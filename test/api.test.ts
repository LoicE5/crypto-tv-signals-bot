import { describe, it, expect, mock, beforeEach } from "bun:test"
import { fetchIntervals, fetchFiles, fetchPrice, analyzeFile, fetchSessionStatus } from "../web/src/lib/api"

// Mock global fetch
const mockFetch = mock(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return new Response("{}", { status: 200 })
})

beforeEach(() => {
    mockFetch.mockClear()
    globalThis.fetch = mockFetch as unknown as typeof fetch
})

describe("fetchIntervals", () => {
    it("returns intervals array from API response", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ intervals: ["1m", "5m", "1h"] }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchIntervals()
        expect(result).toEqual(["1m", "5m", "1h"])
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })
})

describe("fetchFiles", () => {
    it("returns files array from API response", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ files: ["./output/BTCUSDT.ndjson"] }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchFiles()
        expect(result).toEqual(["./output/BTCUSDT.ndjson"])
    })

    it("returns empty array when no files", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ files: [] }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchFiles()
        expect(result).toEqual([])
    })
})

describe("fetchPrice", () => {
    it("returns price number from API response", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ pair: "BTCUSDT", price: 50000 }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchPrice("BTCUSDT")
        expect(result).toBe(50000)
    })

    it("throws when API returns an error", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ error: "Pair not found" }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        await expect(fetchPrice("INVALID")).rejects.toThrow("Pair not found")
    })

    it("returns undefined for missing price", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ pair: "BTCUSDT" }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchPrice("BTCUSDT")
        expect(result).toBeUndefined()
    })
})

describe("analyzeFile", () => {
    it("returns analysis result from API response", async () => {
        const mockResult = { profit_per_transaction: [10, 5], sum: 15, var: "15%" }
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ result: mockResult }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await analyzeFile("./output/test.ndjson", false)
        expect(result).toEqual(mockResult)
    })

    it("returns null when result is null (no signal changes)", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ result: null }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await analyzeFile("./output/test.ndjson", false)
        expect(result).toBeNull()
    })

    it("sends POST with correct body", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ result: null }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        await analyzeFile("./my.ndjson", true)
        const call = mockFetch.mock.calls.at(0)!
        expect(call.at(1)?.method).toBe("POST")
        const body = JSON.parse(call.at(1)?.body as string)
        expect(body.path).toBe("./my.ndjson")
        expect(body.inverted).toBe(true)
    })

    it("throws when API returns an error field", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ error: "File not found" }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        await expect(analyzeFile("./missing.ndjson", false)).rejects.toThrow("File not found")
    })
})

describe("fetchSessionStatus", () => {
    it("returns null when no session is active", async () => {
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ session: null }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchSessionStatus()
        expect(result).toBeNull()
    })

    it("returns session object when a session is active", async () => {
        const mockSession = { command: "simulate", pair: "BTCUSDT", interval: "1m", delay: 10, startedAt: 1000 }
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({ session: mockSession }), {
                headers: { "Content-Type": "application/json" }
            })
        )
        const result = await fetchSessionStatus()
        expect(result).toEqual(mockSession)
    })
})
