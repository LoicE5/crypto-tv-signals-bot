import { describe, it, expect, beforeEach } from "bun:test"
import fs from "fs"
import path from "path"

// We test the pure functions that don't require puppeteer or ccxt
import { isValidInterval, analyseJsonTable } from "../functions"

const TEST_DIR = "/tmp/crypto-tv-signals-bot-function-tests"
const TEST_JSONC_FILE = path.join(TEST_DIR, "test.jsonc")

beforeEach(() => {
    if(!fs.existsSync(TEST_DIR))
        fs.mkdirSync(TEST_DIR, { recursive: true })
})

describe("isValidInterval", () => {
    it("returns true for valid intervals", () => {
        const validIntervals = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M']
        for(const interval of validIntervals) {
            expect(isValidInterval(interval)).toBe(true)
        }
    })

    it("returns false for an invalid interval string", () => {
        expect(isValidInterval("3m")).toBe(false)
        expect(isValidInterval("6h")).toBe(false)
        expect(isValidInterval("1d")).toBe(false) // lowercase 'd'
        expect(isValidInterval("")).toBe(false)
        expect(isValidInterval("invalid")).toBe(false)
    })

    it("is case-sensitive (1d is not the same as 1D)", () => {
        expect(isValidInterval("1D")).toBe(true)
        expect(isValidInterval("1d")).toBe(false)
    })

    it("returns false for numeric-only input", () => {
        expect(isValidInterval("1")).toBe(false)
    })
})

describe("analyseJsonTable", () => {
    // The algorithm:
    // - Iterates from i=1
    // - Sets firstPrice when i==1
    // - When a signal changes from index i to i+1:
    //   sets lastPrice = data[i].price, profit = lastPrice - firstPrice (based on signal)
    //   then firstPrice is reset to data[i+1].price
    // So profit is measured from firstPrice (set at start of a signal run) to lastPrice (last row before signal changes)

    function writeTestJsonc(records: Array<{ pair: string, interval: string, unix_time: number, price: number, signal: string }>): void {
        // Mimic the format that logJsonTable writes: open bracket + comma-suffixed entries (no closing bracket)
        const content = "[" + records.map((r) => JSON.stringify(r) + ",").join("")
        fs.writeFileSync(TEST_JSONC_FILE, content)
    }

    it("calculates profit for BUY signal across multiple rows before a SELL", () => {
        // i=1: data[1]={BUY,100}, data[2]={BUY,110} - same, firstPrice=100, continue
        // i=2: data[2]={BUY,110}, data[3]={SELL,120} - change! lastPrice=110, profit=110-100=10
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },  // data[0] skipped
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },  // data[1]: firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },  // data[2]: same signal, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" }, // data[3]: signal change! lastPrice=110
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }  // data[4]: last item
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY: profit = lastPrice(110) - firstPrice(100) = 10
        expect(result.profit_per_transaction).toEqual([10])
        expect(result.sum).toBe(10)
    })

    it("calculates profit for STRONG BUY signal (doubled)", () => {
        // i=1: data[1]={STRONG BUY,100}, data[2]={STRONG BUY,110} - same, firstPrice=100, continue
        // i=2: data[2]={STRONG BUY,110}, data[3]={SELL,120} - change! lastPrice=110, profit=(110-100)*2=20
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "STRONG BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "STRONG BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "STRONG BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // STRONG BUY: profit = (110 - 100) * 2 = 20
        expect(result.profit_per_transaction).toEqual([20])
        expect(result.sum).toBe(20)
    })

    it("calculates zero profit for NEUTRAL signal", () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "NEUTRAL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "NEUTRAL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "NEUTRAL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 125, signal: "BUY" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // NEUTRAL always returns 0 profit
        expect(result.profit_per_transaction).toEqual([0])
        expect(result.sum).toBe(0)
    })

    it("calculates profit for SELL signal (short position)", () => {
        // SELL: profit = (lastPrice - firstPrice) * (-1)
        // If price drops during SELL: lastPrice < firstPrice → profit > 0
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 120,  signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100,  signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 90,   signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 80,   signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 85,   signal: "BUY" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // SELL: firstPrice=100, lastPrice=90, profit=(90-100)*(-1)=10
        expect(result.profit_per_transaction).toEqual([10])
        expect(result.sum).toBe(10)
    })

    it("calculates profit for STRONG SELL signal (doubled short)", () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 120,  signal: "STRONG SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100,  signal: "STRONG SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 90,   signal: "STRONG SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 80,   signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 85,   signal: "BUY" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // STRONG SELL: firstPrice=100, lastPrice=90, profit=(90-100)*(-2)=20
        expect(result.profit_per_transaction).toEqual([20])
        expect(result.sum).toBe(20)
    })

    it("inverts profits when inverted=true", () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE, true) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY profit was 10, inverted it becomes -10
        expect(result.profit_per_transaction).toEqual([-10])
        expect(result.sum).toBe(-10)
    })

    it("returns the variation as a percentage string ending with '%'", () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(typeof result.var).toBe("string")
        expect(result.var.endsWith("%")).toBe(true)
        // profit=10, absoluteFirstPrice=100, var = 10/100*100 = 10%
        expect(result.var).toBe("10%")
    })

    it("returns undefined (void) when there are no signal changes", () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 120, signal: "BUY" }
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE)
        expect(result).toBeUndefined()
    })

    it("handles multiple signal transitions correctly", () => {
        // First run: BUY at 100, 110; change to SELL at index 3 → firstPrice=100, lastPrice=110, profit=10
        // Second run: SELL at 120, 115; change to BUY at index 5 → firstPrice=120, lastPrice=115, profit=(115-120)*(-1)=5
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },   // data[0] skipped
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },   // data[1]: firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },   // data[2]: same, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },  // data[3]: change! lastPrice=110, profit=10; firstPrice now=120
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" },  // data[4]: same, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 6000, price: 105, signal: "BUY" },   // data[5]: change! lastPrice=115, profit=(115-120)*(-1)=5; firstPrice now=105
            { pair: "BTCUSDT", interval: "1m", unix_time: 7000, price: 108, signal: "BUY" }    // data[6]: last item
        ])
        const result = analyseJsonTable(TEST_JSONC_FILE) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.length).toBe(2)
        expect(result.profit_per_transaction.at(0)).toBe(10)
        expect(result.profit_per_transaction.at(1)).toBe(5)
        expect(result.sum).toBe(15)
    })

    it("throws when the file does not exist", () => {
        expect(() => analyseJsonTable("/nonexistent/file.jsonc")).toThrow()
    })
})
