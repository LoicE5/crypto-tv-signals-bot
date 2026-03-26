const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const LOGS_STREAM_URL = `${API_BASE}/api/logs/stream`

export interface AnalysisResult {
    profit_per_transaction: number[]
    sum: number
    var: string
}

export interface Session {
    command: 'simulate' | 'write'
    pair: string
    interval: string
    delay: number
    startedAt: number
}

export async function fetchIntervals(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/api/intervals`)
    const data = await response.json() as { intervals: string[] }
    return data.intervals
}

export async function fetchFiles(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/api/files`)
    const data = await response.json() as { files: string[] }
    return data.files
}

export async function fetchPrice(pair: string): Promise<number | undefined> {
    const response = await fetch(`${API_BASE}/api/price?pair=${encodeURIComponent(pair)}`)
    const data = await response.json() as { price?: number, error?: string }
    if (data.error)
        throw new Error(data.error)
    return data.price
}

export async function analyzeFile(path: string, inverted: boolean): Promise<AnalysisResult | null> {
    const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, inverted })
    })
    const data = await response.json() as { result: AnalysisResult | null, error?: string }
    if (data.error)
        throw new Error(data.error)
    return data.result
}

export async function fetchSessionStatus(): Promise<Session | null> {
    const response = await fetch(`${API_BASE}/api/session/status`)
    const data = await response.json() as { session: Session | null }
    return data.session
}

export async function startSession(command: string, pair: string, interval: string, delay: number): Promise<Session> {
    const response = await fetch(`${API_BASE}/api/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, pair, interval, delay })
    })
    const data = await response.json() as { session?: Session, error?: string }
    if (data.error)
        throw new Error(data.error)
    if (!data.session)
        throw new Error('No session returned by server')
    return data.session
}

export async function stopSession(): Promise<void> {
    const response = await fetch(`${API_BASE}/api/session/stop`, { method: 'POST' })
    const data = await response.json() as { error?: string }
    if (data.error)
        throw new Error(data.error)
}

export async function checkHealth(): Promise<{url: string, status: number, ok: boolean}> {
    const url = `${API_BASE}/api/health`
    try {
        const res = await fetch(url)
        return { url, status: res.status, ok: res.ok }
    } catch {
        return { url, status: 0, ok: false }
    }
}
