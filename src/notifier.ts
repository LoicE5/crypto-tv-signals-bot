/**
 * Notification service — no external libraries, pure fetch.
 *
 * Supported providers (configure via .env, all optional):
 *   Telegram  — TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   Discord   — DISCORD_WEBHOOK_URL   (webhook, no bot setup needed)
 *   ntfy.sh   — NTFY_URL              (e.g. https://ntfy.sh/my-bot-topic)
 *
 * If none are configured, notifications are printed to console only.
 */

export interface TradeNotification {
    type: 'startup' | 'open' | 'close' | 'neutralize' | 'shutdown'
    pair: string
    positionBefore: string
    positionAfter: string
    side?: 'long' | 'short'
    contracts?: number
    price?: number
    leverage?: number
    unrealizedPnl?: number
    reason?: string
}

export interface DailySummary {
    date: string
    pair: string
    tradeCount: number
    netPnl: number
    balance: number
}

// ─── Internal send helpers ────────────────────────────────────────────────────

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        })
        if (!res.ok) console.warn(`[notifier] Telegram ${res.status}: ${await res.text()}`)
    } catch (e) {
        console.warn('[notifier] Telegram failed:', e)
    }
}

async function sendDiscord(webhookUrl: string, description: string, positive?: boolean): Promise<void> {
    const color = positive === true ? 0x00c853 : positive === false ? 0xff1744 : 0x9e9e9e
    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{ description, color }] })
        })
        if (!res.ok) console.warn(`[notifier] Discord ${res.status}`)
    } catch (e) {
        console.warn('[notifier] Discord failed:', e)
    }
}

async function sendNtfy(url: string, title: string, body: string, priority = 'default'): Promise<void> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { Title: title, Priority: priority },
            body
        })
        if (!res.ok) console.warn(`[notifier] ntfy ${res.status}`)
    } catch (e) {
        console.warn('[notifier] ntfy failed:', e)
    }
}

// ─── Message formatting ───────────────────────────────────────────────────────

function formatTrade(n: TradeNotification): string {
    const px = n.price !== undefined ? `$${n.price.toFixed(2)}` : '—'
    const pnl = n.unrealizedPnl !== undefined
        ? ` | PnL: ${n.unrealizedPnl >= 0 ? '+' : ''}$${n.unrealizedPnl.toFixed(2)}`
        : ''

    switch (n.type) {
        case 'startup':
            return `🤖 *Trader started*\nPair: \`${n.pair}\` | Leverage: ${n.leverage}x | Position: ${n.positionAfter}`
        case 'open':
            return `${n.side === 'long' ? '🟢' : '🔴'} *${n.side?.toUpperCase()} opened* (${n.positionAfter})\n\`${n.pair}\` @ ${px} × ${n.leverage}x${pnl}`
        case 'close':
        case 'neutralize':
            return `⚪ *Neutralized* (${n.positionBefore} → neutral)\n\`${n.pair}\` @ ${px}${pnl}${n.reason ? `\n_${n.reason}_` : ''}`
        case 'shutdown':
            return `🛑 *Trader stopped*\n${n.reason ?? 'Shutdown requested'}`
        default:
            return `ℹ️ \`${n.pair}\` ${n.positionAfter} @ ${px}`
    }
}

function formatDaily(s: DailySummary): string {
    const sign = s.netPnl >= 0 ? '+' : ''
    return `📊 *Daily Summary — ${s.date}*\nPair: \`${s.pair}\`\nTrades: ${s.tradeCount}\nNet P/L: ${sign}$${s.netPnl.toFixed(2)}\nBalance: $${s.balance.toFixed(2)}`
}

function formatError(type: string, message: string): string {
    return `⚠️ *Error [${type}]*\n${message}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

function stripMarkdown(s: string): string {
    return s.replace(/[*_`]/g, '')
}

async function dispatch(markdown: string, positive?: boolean): Promise<void> {
    console.log(`[notify] ${stripMarkdown(markdown)}`)

    const { TELEGRAM_BOT_TOKEN: tToken, TELEGRAM_CHAT_ID: tChat } = process.env
    if (tToken && tChat) await sendTelegram(tToken, tChat, markdown)

    const { DISCORD_WEBHOOK_URL: dUrl } = process.env
    if (dUrl) await sendDiscord(dUrl, markdown.replace(/\*/g, '**').replace(/`/g, '`'), positive)

    const { NTFY_URL: nUrl } = process.env
    if (nUrl) {
        const firstLine = stripMarkdown(markdown).split('\n')[0]
        await sendNtfy(nUrl, firstLine, stripMarkdown(markdown))
    }
}

export async function notify(n: TradeNotification): Promise<void> {
    const positive = n.type === 'open' && n.side === 'long' ? true
        : n.type === 'open' && n.side === 'short' ? false : undefined
    await dispatch(formatTrade(n), positive)
}

export async function notifyDailySummary(s: DailySummary): Promise<void> {
    await dispatch(formatDaily(s), true)
}

export async function notifyError(type: string, message: string): Promise<void> {
    const msg = formatError(type, message)
    console.error(`[notify] ${stripMarkdown(msg)}`)

    const { TELEGRAM_BOT_TOKEN: tToken, TELEGRAM_CHAT_ID: tChat } = process.env
    if (tToken && tChat) await sendTelegram(tToken, tChat, msg)

    const { DISCORD_WEBHOOK_URL: dUrl } = process.env
    if (dUrl) await sendDiscord(dUrl, msg.replace(/\*/g, '**'), false)

    const { NTFY_URL: nUrl } = process.env
    if (nUrl) await sendNtfy(nUrl, `Error: ${type}`, stripMarkdown(msg), 'urgent')
}
