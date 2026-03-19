import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import fs from "fs"
import path from "path"
import { handler } from "../server"

const TEST_DIR = "/tmp/crypto-tv-signals-bot-server-tests"
const TEST_NDJSON = path.join(TEST_DIR, "test.ndjson")

beforeAll(() => {
    if(!fs.existsSync(TEST_DIR))
        fs.mkdirSync(TEST_DIR, { recursive: true })

    // Write a valid ndjson file with a signal change for analyze tests
    const rows = [
        { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90, signal: "BUY" },
        { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
        { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
        { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
        { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
    ]
    fs.writeFileSync(TEST_NDJSON, rows.map(r => JSON.stringify(r)).join("\n") + "\n")
})

afterAll(() => {
    if(fs.existsSync(TEST_DIR))
        fs.rmSync(TEST_DIR, { recursive: true })
})

function makeRequest(pathname: string, options: RequestInit = {}): Request {
    return new Request(`http://localhost${pathname}`, options)
}

describe("GET /api/health", () => {
    it("returns 200 with ok status", async () => {
        const response = await handler(makeRequest("/api/health"))
        expect(response.status).toBe(200)
        const body = await response.json() as { status: string, version: string }
        expect(body.status).toBe("ok")
        expect(typeof body.version).toBe("string")
    })
})

describe("GET /api/intervals", () => {
    it("returns 200 with an array of valid intervals", async () => {
        const response = await handler(makeRequest("/api/intervals"))
        expect(response.status).toBe(200)
        const body = await response.json() as { intervals: string[] }
        expect(Array.isArray(body.intervals)).toBe(true)
        expect(body.intervals.length).toBeGreaterThan(0)
        expect(body.intervals).toContain("1m")
        expect(body.intervals).toContain("1D")
    })
})

describe("GET /api/files", () => {
    it("returns 200 with files array", async () => {
        const response = await handler(makeRequest("/api/files"))
        expect(response.status).toBe(200)
        const body = await response.json() as { files: string[] }
        expect(Array.isArray(body.files)).toBe(true)
    })
})

describe("GET /api/price", () => {
    it("returns 400 when pair query param is missing", async () => {
        const response = await handler(makeRequest("/api/price"))
        expect(response.status).toBe(400)
        const body = await response.json() as { error: string }
        expect(body.error).toBeTruthy()
    })
})

describe("POST /api/analyze", () => {
    it("returns analysis result for a valid ndjson file", async () => {
        const response = await handler(makeRequest("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: TEST_NDJSON, inverted: false })
        }))
        expect(response.status).toBe(200)
        const body = await response.json() as { result: { sum: number, var: string, profit_per_transaction: number[] } | null }
        expect(body.result).not.toBeNull()
        expect(typeof body.result!.sum).toBe("number")
        expect(body.result!.var.endsWith("%")).toBe(true)
        expect(Array.isArray(body.result!.profit_per_transaction)).toBe(true)
    })

    it("returns 400 when path is missing", async () => {
        const response = await handler(makeRequest("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inverted: false })
        }))
        expect(response.status).toBe(400)
        const body = await response.json() as { error: string }
        expect(body.error).toBeTruthy()
    })

    it("returns 400 on invalid JSON body", async () => {
        const response = await handler(makeRequest("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "not-json"
        }))
        expect(response.status).toBe(400)
    })

    it("returns error on non-existent file", async () => {
        const response = await handler(makeRequest("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "/nonexistent/file.ndjson" })
        }))
        // Either 500 error or result: null (file not found throws)
        expect(response.status).toBe(500)
    })
})

describe("GET /api/session/status", () => {
    it("returns session: null when no session is active", async () => {
        const response = await handler(makeRequest("/api/session/status"))
        expect(response.status).toBe(200)
        const body = await response.json() as { session: null }
        expect(body.session).toBeNull()
    })
})

describe("POST /api/session/start", () => {
    it("returns 400 when command is missing", async () => {
        const response = await handler(makeRequest("/api/session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pair: "BTCUSDT", interval: "1m" })
        }))
        expect(response.status).toBe(400)
    })

    it("returns 400 when pair is missing", async () => {
        const response = await handler(makeRequest("/api/session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "simulate", interval: "1m" })
        }))
        expect(response.status).toBe(400)
    })

    it("returns 400 when interval is invalid", async () => {
        const response = await handler(makeRequest("/api/session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "simulate", pair: "BTCUSDT", interval: "99x" })
        }))
        expect(response.status).toBe(400)
    })
})

describe("POST /api/session/stop", () => {
    it("returns 404 when no session is active", async () => {
        const response = await handler(makeRequest("/api/session/stop", { method: "POST" }))
        expect(response.status).toBe(404)
    })
})

describe("OPTIONS preflight (CORS)", () => {
    it("returns 204 with CORS headers", async () => {
        const response = await handler(makeRequest("/api/health", { method: "OPTIONS" }))
        expect(response.status).toBe(204)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
        expect(response.headers.get("Access-Control-Allow-Methods")).toBeTruthy()
    })
})

describe("unknown routes", () => {
    it("returns 404 for unrecognized paths", async () => {
        const response = await handler(makeRequest("/api/nonexistent"))
        expect(response.status).toBe(404)
    })
})
