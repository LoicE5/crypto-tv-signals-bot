/**
 * Live trading engine — perpetual futures, up to 2x leverage, one-way mode.
 *
 * Signal → position mapping:
 *   STRONG BUY  → long_full  (2x leverage, full TRADE_AMOUNT collateral)
 *   BUY         → long_half  (2x leverage, TRADE_AMOUNT / 2 collateral)
 *   NEUTRAL     → neutral    (close all)
 *   SELL        → short_half (2x leverage, TRADE_AMOUNT / 2 collateral)
 *   STRONG SELL → short_full (2x leverage, full TRADE_AMOUNT collateral)
 *   ERROR       → retry up to MAX_SCRAPE_RETRIES; if all fail → neutralize + exit
 *
 * Graceful neutralization is triggered by:
 *   - SIGINT / SIGTERM (handled in index.ts)
 *   - Persistent scraping errors (after retries)
 *   - Max drawdown breach
 *   - uncaughtException / unhandledRejection (handled in index.ts)
 */

import type { Browser } from 'puppeteer'
import type { Exchange } from 'ccxt'
import { getIndicator, getLastPrice } from './functions'
import { notify, notifyError, notifyDailySummary } from './notifier'
import type { Database } from './database'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PositionState = 'neutral' | 'long_half' | 'long_full' | 'short_half' | 'short_full'

export interface TraderConfig {
    tvPair: string         // TradingView format  e.g. BTCUSDT
    ccxtPair: string       // CCXT futures format e.g. BTC/USDT:USDT
    interval: string
    amount: number         // USDT collateral per full position
    leverage: number       // 1 or 2 (enforced ≤ 2 in index.ts)
    delay: number          // seconds between signal checks
    maxDrawdownPct: number // stop trading at this % loss from start balance
    exchangeId: string
}

export interface TraderState {
    position: PositionState
    contracts: number
    entryPrice: number | undefined
    startBalance: number
    lastSummaryDate: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_QUOTES = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'DAI', 'BUSD']
const MAX_SCRAPE_RETRIES = 2       // total attempts = 1 + MAX_SCRAPE_RETRIES = 3
const SCRAPE_RETRY_DELAY_MS = 8_000

// ─── Pair helpers ─────────────────────────────────────────────────────────────

export function toCcxtFuturesPair(tvPair: string): string {
    if (tvPair.includes('/')) return tvPair
    for (const q of KNOWN_QUOTES) {
        if (tvPair.endsWith(q)) {
            const base = tvPair.slice(0, -q.length)
            return `${base}/${q}:${q}`   // BTC/USDT:USDT  (linear USDM perpetual)
        }
    }
    return tvPair
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function signalToDesired(signal: string): PositionState {
    switch (signal) {
        case 'STRONG BUY':  return 'long_full'
        case 'BUY':         return 'long_half'
        case 'NEUTRAL':     return 'neutral'
        case 'SELL':        return 'short_half'
        case 'STRONG SELL': return 'short_full'
        default:            return 'neutral'
    }
}

function positionSide(pos: PositionState): 'buy' | 'sell' | null {
    if (pos.startsWith('long'))  return 'buy'
    if (pos.startsWith('short')) return 'sell'
    return null
}

function positionCollateral(pos: PositionState, amount: number): number {
    if (pos.endsWith('full')) return amount
    if (pos.endsWith('half')) return amount / 2
    return 0
}

// ─── Retry-aware scraping ─────────────────────────────────────────────────────

async function getSignalWithRetry(
    browser: Browser,
    tvPair: string,
    interval: string
): Promise<string> {
    for (let attempt = 0; attempt <= MAX_SCRAPE_RETRIES; attempt++) {
        if (attempt > 0) {
            console.warn(`[trader] Scraping retry ${attempt}/${MAX_SCRAPE_RETRIES} in ${SCRAPE_RETRY_DELAY_MS / 1000}s…`)
            await Bun.sleep(SCRAPE_RETRY_DELAY_MS)
        }
        const signal = await getIndicator(browser, tvPair, interval)
        if (signal !== 'ERROR') {
            if (attempt > 0) console.log(`[trader] Scraping recovered on attempt ${attempt + 1}.`)
            return signal
        }
        console.warn(`[trader] Signal ERROR (attempt ${attempt + 1}/${MAX_SCRAPE_RETRIES + 1})`)
    }
    return 'ERROR'  // all attempts exhausted
}

// ─── Exchange setup ───────────────────────────────────────────────────────────

export async function setupFuturesExchange(
    exchange: Exchange,
    ccxtPair: string,
    leverage: number
): Promise<void> {
    await exchange.loadMarkets()

    // Isolated margin (limits loss to position collateral only)
    try {
        await exchange.setMarginMode('isolated', ccxtPair)
        console.log('[trader] Margin mode: ISOLATED')
    } catch (e: unknown) {
        const msg = String(e)
        if (!msg.includes('No need to change') && !msg.includes('already'))
            console.warn('[trader] setMarginMode warning:', msg)
    }

    // Leverage
    try {
        await exchange.setLeverage(leverage, ccxtPair)
        console.log(`[trader] Leverage: ${leverage}x`)
    } catch (e) {
        console.warn('[trader] setLeverage warning:', e)
    }
}

// ─── Position read ────────────────────────────────────────────────────────────

export async function readCurrentPosition(
    exchange: Exchange,
    ccxtPair: string,
    leverage: number
): Promise<Pick<TraderState, 'position' | 'contracts' | 'entryPrice'>> {
    try {
        const positions = await exchange.fetchPositions([ccxtPair])
        const open = positions.find(p => Math.abs(p.contracts ?? 0) > 0)
        if (!open) return { position: 'neutral', contracts: 0, entryPrice: undefined }

        const contracts = Math.abs(open.contracts ?? 0)
        const effectiveLev = open.leverage ?? leverage
        let position: PositionState = 'neutral'
        if (open.side === 'long')  position = effectiveLev >= 2 ? 'long_full'  : 'long_half'
        if (open.side === 'short') position = effectiveLev >= 2 ? 'short_full' : 'short_half'

        console.log(`[trader] Existing position on startup: ${position} (${contracts} contracts @ ${open.entryPrice ?? '?'})`)
        return { position, contracts, entryPrice: open.entryPrice ?? undefined }
    } catch (e) {
        console.warn('[trader] fetchPositions failed on startup, assuming neutral:', e)
        return { position: 'neutral', contracts: 0, entryPrice: undefined }
    }
}

// ─── Neutralize ───────────────────────────────────────────────────────────────

export async function neutralize(
    exchange: Exchange,
    ccxtPair: string,
    state: TraderState,
    db: Database,
    reason = 'shutdown'
): Promise<void> {
    if (state.position === 'neutral') {
        console.log('[trader] Already neutral — nothing to close.')
        return
    }

    console.log(`[trader] Neutralizing (${state.position}) — reason: ${reason}`)
    try {
        const positions = await exchange.fetchPositions([ccxtPair])
        const open = positions.find(p => Math.abs(p.contracts ?? 0) > 0)

        if (!open || Math.abs(open.contracts ?? 0) === 0) {
            console.log('[trader] No open position found on exchange.')
            state.position = 'neutral'
            state.contracts = 0
            return
        }

        const contracts = Math.abs(open.contracts ?? 0)
        const closeSide = open.side === 'long' ? 'sell' : 'buy'
        const pnl = open.unrealizedPnl ?? undefined

        const order = await exchange.createOrder(
            ccxtPair, 'market', closeSide, contracts, undefined, { reduceOnly: true }
        )

        const price = order.average ?? open.markPrice ?? undefined

        await db.writeTrade({
            id: String(order.id ?? `neutralize-${Date.now()}`),
            pair: ccxtPair, side: closeSide, contracts, price,
            leverage: state.position.endsWith('full') ? 2 : 1,
            positionBefore: state.position, positionAfter: 'neutral',
            unrealizedPnl: typeof pnl === 'number' ? pnl : undefined,
            timestamp: Date.now(), exchangeId: exchange.id
        })

        await notify({
            type: 'neutralize',
            pair: ccxtPair,
            positionBefore: state.position, positionAfter: 'neutral',
            contracts, price,
            unrealizedPnl: typeof pnl === 'number' ? pnl : undefined,
            reason
        })

        console.log(`[trader] Neutralized. Order: ${order.id} @ ${price ?? '?'}`)
    } catch (e) {
        const msg = `neutralize() failed: ${e}`
        console.error('[trader]', msg)
        await db.writeError({ type: 'order', message: msg, position: state.position, timestamp: Date.now() }).catch(() => {})
        await notifyError('neutralize', msg).catch(() => {})
    } finally {
        state.position = 'neutral'
        state.contracts = 0
        state.entryPrice = undefined
    }
}

// ─── Position transition ──────────────────────────────────────────────────────

async function executeTransition(
    exchange: Exchange,
    ccxtPair: string,
    desired: PositionState,
    state: TraderState,
    amount: number,
    leverage: number,
    db: Database
): Promise<void> {
    const currentSide = positionSide(state.position)
    const desiredSide = positionSide(desired)
    const positionBefore = state.position

    // Step 1: close existing if switching direction or going neutral
    if (currentSide !== null && (desired === 'neutral' || currentSide !== desiredSide)) {
        try {
            const positions = await exchange.fetchPositions([ccxtPair])
            const open = positions.find(p => Math.abs(p.contracts ?? 0) > 0)
            if (open && Math.abs(open.contracts ?? 0) > 0) {
                const closeSide = open.side === 'long' ? 'sell' : 'buy'
                const closeContracts = Math.abs(open.contracts ?? 0)
                const closeOrder = await exchange.createOrder(
                    ccxtPair, 'market', closeSide, closeContracts, undefined, { reduceOnly: true }
                )
                await db.writeTrade({
                    id: String(closeOrder.id ?? `close-${Date.now()}`),
                    pair: ccxtPair, side: closeSide, contracts: closeContracts,
                    price: closeOrder.average, leverage,
                    positionBefore, positionAfter: desired === 'neutral' ? 'neutral' : 'neutral (interim)',
                    unrealizedPnl: typeof open.unrealizedPnl === 'number' ? open.unrealizedPnl : undefined,
                    timestamp: Date.now(), exchangeId: exchange.id
                })
                console.log(`[trader] Closed ${positionBefore}: order ${closeOrder.id}`)
            }
        } catch (e) {
            console.error('[trader] Close leg failed:', e)
            throw e
        }
    }

    if (desired === 'neutral') {
        state.position = 'neutral'
        state.contracts = 0
        state.entryPrice = undefined
        await notify({ type: 'close', pair: ccxtPair, positionBefore, positionAfter: 'neutral' })
        return
    }

    // Step 2: open new position
    if (desiredSide === null) return

    try {
        await exchange.loadMarkets()
        const market = exchange.market(ccxtPair)
        const contractSize = market.contractSize ?? 1
        const price = await getLastPrice(ccxtPair, exchange)
        if (!price) throw new Error('Price unavailable for order sizing')

        const collateral = positionCollateral(desired, amount)
        const rawContracts = (collateral * leverage) / (price * contractSize)
        const contracts = parseFloat(exchange.amountToPrecision(ccxtPair, rawContracts))

        const minContracts = market.limits?.amount?.min ?? 0
        const minCost = market.limits?.cost?.min ?? 0
        const estimatedCost = contracts * price * contractSize

        if (contracts < minContracts || estimatedCost < minCost) {
            console.warn(
                `[trader] Order too small (${contracts} contracts ≈ $${estimatedCost.toFixed(2)}). ` +
                `Minimums: ${minContracts} contracts / $${minCost}. Skipping.`
            )
            return
        }

        const openOrder = await exchange.createOrder(
            ccxtPair, 'market', desiredSide, contracts, undefined, { leverage }
        )

        state.position = desired
        state.contracts = contracts
        state.entryPrice = openOrder.average ?? price

        await db.writeTrade({
            id: String(openOrder.id ?? `open-${Date.now()}`),
            pair: ccxtPair, side: desiredSide, contracts,
            price: state.entryPrice, leverage,
            positionBefore, positionAfter: desired,
            unrealizedPnl: undefined,
            timestamp: Date.now(), exchangeId: exchange.id
        })

        await notify({
            type: 'open',
            pair: ccxtPair,
            side: desiredSide === 'buy' ? 'long' : 'short',
            positionBefore, positionAfter: desired,
            contracts, price: state.entryPrice, leverage
        })

        console.log(`[trader] Opened ${desired}: order ${openOrder.id} (${contracts} @ ${state.entryPrice})`)
    } catch (e) {
        console.error('[trader] Open leg failed:', e)
        throw e
    }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function startTrader(
    browser: Browser,
    exchange: Exchange,
    config: TraderConfig,
    db: Database,
    onFatalError: (reason: string) => Promise<void>
): Promise<TraderState> {
    const { tvPair, ccxtPair, interval, amount, leverage, delay, maxDrawdownPct, exchangeId } = config

    await setupFuturesExchange(exchange, ccxtPair, leverage)

    const { position, contracts, entryPrice } = await readCurrentPosition(exchange, ccxtPair, leverage)
    const balanceInfo = await exchange.fetchBalance()
    const startBalance = Number(balanceInfo['USDT']?.total ?? balanceInfo['USDT']?.free ?? 0)

    const state: TraderState = {
        position, contracts, entryPrice,
        startBalance,
        lastSummaryDate: new Date().toDateString()
    }

    console.log(
        `[trader] Ready | Pair: ${ccxtPair} | Leverage: ${leverage}x | Amount: $${amount} | ` +
        `Delay: ${delay}s | Max drawdown: ${maxDrawdownPct}% | Balance: $${startBalance.toFixed(2)}`
    )

    await notify({
        type: 'startup',
        pair: ccxtPair,
        positionBefore: 'neutral', positionAfter: state.position,
        leverage
    })

    let fatalOccurred = false

    setInterval(async () => {
        if (fatalOccurred) return
        try {
            // ── Daily summary ──────────────────────────────────────────────────
            const today = new Date().toDateString()
            if (today !== state.lastSummaryDate) {
                try {
                    const summary = await db.getDailySummary(state.lastSummaryDate)
                    const bal = await exchange.fetchBalance()
                    const currentBal = Number(bal['USDT']?.total ?? state.startBalance)
                    await notifyDailySummary({
                        date: state.lastSummaryDate, pair: ccxtPair,
                        tradeCount: summary.tradeCount,
                        netPnl: currentBal - state.startBalance,
                        balance: currentBal
                    })
                } catch (e) { console.warn('[trader] Daily summary failed:', e) }
                state.lastSummaryDate = today
            }

            // ── Fetch signal (with retries) ────────────────────────────────────
            const signal = await getSignalWithRetry(browser, tvPair, interval)

            if (signal === 'ERROR') {
                fatalOccurred = true
                const msg = `TradingView scraping failed after ${MAX_SCRAPE_RETRIES + 1} attempts. Neutralizing.`
                console.error(`\n[trader] ${msg}`)
                await db.writeError({ type: 'scraping', message: msg, position: state.position, timestamp: Date.now() }).catch(() => {})
                await notifyError('scraping', msg).catch(() => {})
                await onFatalError(msg)
                return
            }

            const price = await getLastPrice(tvPair)

            db.bufferSignal({ pair: tvPair, interval, price, signal, position: state.position, timestamp: Date.now() })

            process.stdout.write(
                `\r[trader] ${tvPair} | $${price?.toFixed(2) ?? '—'} | Signal: ${signal.padEnd(11)} | Position: ${state.position.padEnd(11)}   `
            )

            // ── Drawdown check ─────────────────────────────────────────────────
            try {
                const bal = await exchange.fetchBalance()
                const currentBal = Number(bal['USDT']?.free ?? 0)
                if (state.startBalance > 0) {
                    const drawdownPct = ((state.startBalance - currentBal) / state.startBalance) * 100
                    if (drawdownPct >= maxDrawdownPct) {
                        fatalOccurred = true
                        const msg = `Max drawdown reached: ${drawdownPct.toFixed(1)}% ≥ ${maxDrawdownPct}%. Neutralizing.`
                        console.error(`\n[trader] ${msg}`)
                        await db.writeError({ type: 'drawdown', message: msg, position: state.position, timestamp: Date.now() }).catch(() => {})
                        await notifyError('drawdown', msg).catch(() => {})
                        await onFatalError(msg)
                        return
                    }
                }
            } catch (e) { console.warn('[trader] Balance check failed:', e) }

            // ── Execute transition ─────────────────────────────────────────────
            const desired = signalToDesired(signal)
            if (desired !== state.position) {
                console.log(`\n[trader] ${signal} → ${state.position} → ${desired}`)
                await executeTransition(exchange, ccxtPair, desired, state, amount, leverage, db)
            }

        } catch (e) {
            const msg = `Loop error: ${e}`
            console.error('\n[trader]', msg)
            await db.writeError({ type: 'network', message: msg, position: state.position, timestamp: Date.now() }).catch(() => {})
            // transient error — log and continue to next tick
        }
    }, delay * 1000)

    return state
}
