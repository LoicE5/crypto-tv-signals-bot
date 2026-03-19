import { analyseJsonTable, getLastPrice, getIndicator, logJsonTable } from './src/functions'
import { validIntervals } from './src/constants'
import type { Browser } from 'puppeteer'
import { version } from './package.json'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
}

interface Session {
    command: 'simulate' | 'write'
    pair: string
    interval: string
    delay: number
    startedAt: number
}

let activeSession: Session | null = null
let sessionBrowser: Browser | null = null
let sessionIntervalId: ReturnType<typeof setInterval> | null = null

async function findNdjsonFiles(): Promise<string[]> {
    const glob = new Bun.Glob('**/*.ndjson')
    const files: string[] = []
    for await (const file of glob.scan({ cwd: process.cwd() })) {
        if(!file.startsWith('node_modules/'))
            files.push(file)
    }
    return files.sort()
}

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
}

function badRequest(message: string): Response {
    return json({ error: message }, 400)
}

async function stopSession(): Promise<void> {
    if(sessionIntervalId !== null) clearInterval(sessionIntervalId)
    if(sessionBrowser !== null) await sessionBrowser.close().catch((closeError: unknown) => console.error('Browser close error:', closeError))
    activeSession = null
    sessionBrowser = null
    sessionIntervalId = null
}

export async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname, searchParams } = url

    if(request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS_HEADERS })

    if(pathname === '/api/health' && request.method === 'GET')
        return json({ status: 'ok', version })

    if(pathname === '/api/intervals' && request.method === 'GET')
        return json({ intervals: [...validIntervals] })

    if(pathname === '/api/files' && request.method === 'GET') {
        const files = await findNdjsonFiles()
        return json({ files })
    }

    if(pathname === '/api/price' && request.method === 'GET') {
        const pair = searchParams.get('pair')
        if(!pair) return badRequest('pair query param is required')
        try {
            const price = await getLastPrice(pair)
            return json({ pair, price })
        } catch(fetchError: unknown) {
            return json({ error: `Failed to fetch price: ${fetchError}` }, 502)
        }
    }

    if(pathname === '/api/analyze' && request.method === 'POST') {
        let body: { path?: string, inverted?: boolean }
        try {
            body = await request.json() as { path?: string, inverted?: boolean }
        } catch {
            return badRequest('Invalid JSON body')
        }
        const { path, inverted = false } = body
        if(!path) return badRequest('path is required')
        try {
            const result = await analyseJsonTable(path, inverted)
            return json({ result: result ?? null })
        } catch(analyzeError: unknown) {
            return json({ error: `Analysis failed: ${analyzeError}` }, 500)
        }
    }

    if(pathname === '/api/session/status' && request.method === 'GET')
        return json({ session: activeSession })

    if(pathname === '/api/session/start' && request.method === 'POST') {
        if(activeSession) return json({ error: 'A session is already running. Stop it first.' }, 409)
        let body: { command?: string, pair?: string, interval?: string, delay?: number }
        try {
            body = await request.json() as { command?: string, pair?: string, interval?: string, delay?: number }
        } catch {
            return badRequest('Invalid JSON body')
        }
        const { command, pair, interval = '1m', delay = 10 } = body
        if(!command || !['simulate', 'write'].includes(command))
            return badRequest('command must be "simulate" or "write"')
        if(!pair) return badRequest('pair is required')
        if(!validIntervals.has(interval)) return badRequest(`Invalid interval "${interval}"`)

        try {
            const puppeteer = await import('puppeteer')
            sessionBrowser = await puppeteer.default.launch()
            activeSession = { command: command as 'simulate' | 'write', pair, interval, delay, startedAt: Date.now() }

            if(command === 'simulate') {
                const browser = sessionBrowser as Browser
                sessionIntervalId = setInterval(async () => {
                    const price = await getLastPrice(pair)
                    const signal = await getIndicator(browser, pair, interval)
                    console.info(`[simulate] ${pair} | ${interval} | ${price} | ${signal}`)
                }, 1000)
            } else {
                logJsonTable(sessionBrowser, pair, interval, delay)
            }

            return json({ session: activeSession })
        } catch(startError: unknown) {
            await stopSession()
            return json({ error: `Failed to start session: ${startError}` }, 500)
        }
    }

    if(pathname === '/api/session/stop' && request.method === 'POST') {
        if(!activeSession) return json({ error: 'No active session' }, 404)
        await stopSession()
        return json({ stopped: true })
    }

    return json({ error: 'Not found' }, 404)
}

if(import.meta.main) {
    const port = Number(process.env.PORT) || 3001
    const server = Bun.serve({ port, fetch: handler })
    console.info(`API server running on http://localhost:${server.port}`)
}
