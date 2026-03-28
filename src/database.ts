/**
 * Database service — zero new dependencies, uses Bun's built-in SQLite.
 *
 * Provider selection (auto-detected from env):
 *   DB_PATH=./data/bot.db          → local SQLite via bun:sqlite (default, recommended for VPS)
 *   SUPABASE_URL + SUPABASE_ANON_KEY → Supabase REST API (cloud alternative)
 *   Neither set                    → no-op (no persistence, logs a warning)
 *
 * Batching strategy:
 *   signals  → buffered, flushed every SIGNAL_FLUSH_MS or when buffer hits SIGNAL_BUFFER_LIMIT
 *   trades   → written immediately (critical events)
 *   errors   → written immediately (critical events)
 *
 * TimescaleDB (Neon) alternative:
 *   Use the same SQL schema below in a PostgreSQL/TimescaleDB instance.
 *   Replace the Supabase fetch calls with your Neon/TimescaleDB connection.
 *   Run: SELECT create_hypertable('signals', 'timestamp');
 */

import type { Database as BunSQLiteInstance } from 'bun:sqlite'

const SIGNAL_BUFFER_LIMIT = 100
const SIGNAL_FLUSH_MS = 60_000

export interface SignalRow {
    pair: string
    interval: string
    price: number | undefined
    signal: string
    position: string
    timestamp: number
}

export interface TradeRow {
    id: string
    pair: string
    side: string
    contracts: number
    price: number | undefined
    leverage: number
    positionBefore: string
    positionAfter: string
    unrealizedPnl: number | undefined
    timestamp: number
    exchangeId: string
}

export interface ErrorRow {
    type: string
    message: string
    position: string | undefined
    timestamp: number
}

export interface Database {
    bufferSignal(row: SignalRow): void
    writeTrade(row: TradeRow): Promise<void>
    writeError(row: ErrorRow): Promise<void>
    getDailySummary(dateStr: string): Promise<{ tradeCount: number; netPnl: number }>
    flush(): Promise<void>
    close(): Promise<void>
}

// ─── SQL schema (used for both SQLite and Supabase table creation) ────────────

const SQL_CREATE_SIGNALS = `
    CREATE TABLE IF NOT EXISTS signals (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        pair  TEXT    NOT NULL,
        interval TEXT NOT NULL,
        price REAL,
        signal   TEXT NOT NULL,
        position TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    )`

const SQL_CREATE_TRADES = `
    CREATE TABLE IF NOT EXISTS trades (
        id              TEXT PRIMARY KEY,
        pair            TEXT    NOT NULL,
        side            TEXT    NOT NULL,
        contracts       REAL    NOT NULL,
        price           REAL,
        leverage        INTEGER NOT NULL,
        position_before TEXT    NOT NULL,
        position_after  TEXT    NOT NULL,
        unrealized_pnl  REAL,
        timestamp       INTEGER NOT NULL,
        exchange_id     TEXT    NOT NULL
    )`

const SQL_CREATE_ERRORS = `
    CREATE TABLE IF NOT EXISTS errors (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        type      TEXT    NOT NULL,
        message   TEXT    NOT NULL,
        position  TEXT,
        timestamp INTEGER NOT NULL
    )`

// ─── Local SQLite (bun:sqlite) ────────────────────────────────────────────────

async function createLocalDb(dbPath: string): Promise<Database> {
    const { mkdirSync } = await import('node:fs')
    const { dirname } = await import('node:path')
    mkdirSync(dirname(dbPath), { recursive: true })

    // Dynamic import keeps bun:sqlite out of the module graph unless this path is used
    const { Database: BunSQLite } = await import('bun:sqlite') as { Database: typeof BunSQLiteInstance & (new (path: string) => BunSQLiteInstance) }
    const db = new BunSQLite(dbPath)
    db.exec(SQL_CREATE_SIGNALS)
    db.exec(SQL_CREATE_TRADES)
    db.exec(SQL_CREATE_ERRORS)

    const insertSignal = db.prepare(
        'INSERT INTO signals (pair,interval,price,signal,position,timestamp) VALUES (?,?,?,?,?,?)'
    )
    const insertTrade = db.prepare(
        `INSERT OR REPLACE INTO trades
         (id,pair,side,contracts,price,leverage,position_before,position_after,unrealized_pnl,timestamp,exchange_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    const insertError = db.prepare(
        'INSERT INTO errors (type,message,position,timestamp) VALUES (?,?,?,?)'
    )

    const signalBuffer: SignalRow[] = []
    let flushTimer: ReturnType<typeof setInterval> | null = null

    const flush = async () => {
        if (signalBuffer.length === 0) return
        const rows = signalBuffer.splice(0)
        const batchInsert = db.transaction(() => {
            for (const s of rows)
                insertSignal.run(s.pair, s.interval, s.price ?? null, s.signal, s.position, s.timestamp)
        })
        try { batchInsert() } catch (e) { console.error('[db] Signal flush error:', e) }
    }

    flushTimer = setInterval(flush, SIGNAL_FLUSH_MS)

    return {
        bufferSignal(row) {
            signalBuffer.push(row)
            if (signalBuffer.length >= SIGNAL_BUFFER_LIMIT) flush()
        },
        async writeTrade(row) {
            try {
                insertTrade.run(
                    row.id, row.pair, row.side, row.contracts, row.price ?? null, row.leverage,
                    row.positionBefore, row.positionAfter, row.unrealizedPnl ?? null,
                    row.timestamp, row.exchangeId
                )
            } catch (e) { console.error('[db] Trade write error:', e) }
        },
        async writeError(row) {
            try {
                insertError.run(row.type, row.message, row.position ?? null, row.timestamp)
            } catch (e) { console.error('[db] Error write error:', e) }
        },
        async getDailySummary(dateStr) {
            const dayStart = new Date(dateStr).getTime()
            const dayEnd = dayStart + 86_400_000
            try {
                const row = db.query<{ count: number }, [number, number]>(
                    'SELECT COUNT(*) AS count FROM trades WHERE timestamp >= ? AND timestamp < ?'
                ).get(dayStart, dayEnd)
                return { tradeCount: row?.count ?? 0, netPnl: 0 }
            } catch { return { tradeCount: 0, netPnl: 0 } }
        },
        flush,
        async close() {
            if (flushTimer) clearInterval(flushTimer)
            await flush()
            db.close()
        }
    }
}

// ─── Supabase REST ────────────────────────────────────────────────────────────

function createSupabaseDb(supabaseUrl: string, anonKey: string): Database {
    const signalBuffer: SignalRow[] = []
    let flushTimer: ReturnType<typeof setInterval> | null = null

    const headers = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
    }

    const post = async (table: string, body: unknown): Promise<void> => {
        try {
            const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
                method: 'POST', headers, body: JSON.stringify(body)
            })
            if (!res.ok) console.error(`[db] Supabase ${table} error ${res.status}: ${await res.text()}`)
        } catch (e) { console.error(`[db] Supabase ${table} failed:`, e) }
    }

    const flush = async () => {
        if (signalBuffer.length === 0) return
        const rows = signalBuffer.splice(0)
        await post('signals', rows.map(s => ({
            pair: s.pair, interval: s.interval, price: s.price ?? null,
            signal: s.signal, position: s.position, timestamp: s.timestamp
        })))
    }

    flushTimer = setInterval(flush, SIGNAL_FLUSH_MS)

    return {
        bufferSignal(row) {
            signalBuffer.push(row)
            if (signalBuffer.length >= SIGNAL_BUFFER_LIMIT) flush()
        },
        async writeTrade(row) {
            await post('trades', {
                id: row.id, pair: row.pair, side: row.side, contracts: row.contracts,
                price: row.price ?? null, leverage: row.leverage,
                position_before: row.positionBefore, position_after: row.positionAfter,
                unrealized_pnl: row.unrealizedPnl ?? null,
                timestamp: row.timestamp, exchange_id: row.exchangeId
            })
        },
        async writeError(row) {
            await post('errors', {
                type: row.type, message: row.message,
                position: row.position ?? null, timestamp: row.timestamp
            })
        },
        async getDailySummary(dateStr) {
            const dayStart = new Date(dateStr).getTime()
            const dayEnd = dayStart + 86_400_000
            try {
                const res = await fetch(
                    `${supabaseUrl}/rest/v1/trades?select=id&timestamp=gte.${dayStart}&timestamp=lt.${dayEnd}`,
                    { headers }
                )
                if (!res.ok) return { tradeCount: 0, netPnl: 0 }
                const data = await res.json() as unknown[]
                return { tradeCount: data.length, netPnl: 0 }
            } catch { return { tradeCount: 0, netPnl: 0 } }
        },
        flush,
        async close() {
            if (flushTimer) clearInterval(flushTimer)
            await flush()
        }
    }
}

// ─── No-op ────────────────────────────────────────────────────────────────────

function createNoopDb(): Database {
    return {
        bufferSignal() {},
        async writeTrade() {},
        async writeError() {},
        async getDailySummary() { return { tradeCount: 0, netPnl: 0 } },
        async flush() {},
        async close() {}
    }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<Database> {
    const dbPath = process.env.DB_PATH
    const supaUrl = process.env.SUPABASE_URL
    const supaKey = process.env.SUPABASE_ANON_KEY

    if (dbPath) {
        console.log(`[db] Local SQLite: ${dbPath}`)
        return createLocalDb(dbPath)
    }

    if (supaUrl && supaKey) {
        console.log('[db] Supabase')
        return createSupabaseDb(supaUrl, supaKey)
    }

    console.warn('[db] No database configured (DB_PATH or SUPABASE_URL). Signals/trades will not be persisted.')
    return createNoopDb()
}
