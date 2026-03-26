import logUpdate from 'log-update'

const WRITE_LIMIT = Number(process.env.WRITE_SCROLL_LIMIT) || 5
const SIMULATE_LIMIT = Number(process.env.SIMULATE_SCROLL_LIMIT) || 15

type SSEController = ReadableStreamDefaultController<Uint8Array>

const sseClients = new Set<SSEController>()
const encoder = new TextEncoder()

export function addSSEClient(controller: SSEController): void {
    sseClients.add(controller)
}

export function removeSSEClient(controller: SSEController): void {
    sseClients.delete(controller)
}

function broadcast(line: string): void {
    const chunk = encoder.encode(`data: ${JSON.stringify({ line })}\n\n`)
    for (const ctrl of [...sseClients]) {
        try {
            ctrl.enqueue(chunk)
        } catch {
            sseClients.delete(ctrl)
        }
    }
}

function createScrollLogger(limit: number) {
    const buffer: string[] = []
    return function log(value: unknown): void {
        const line = typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : String(value)
        buffer.push(line)
        if (buffer.length > limit) buffer.shift()
        logUpdate(buffer.join('\n'))
        broadcast(line)
    }
}

export const writeLogger = createScrollLogger(WRITE_LIMIT)
export const simulateLogger = createScrollLogger(SIMULATE_LIMIT)
