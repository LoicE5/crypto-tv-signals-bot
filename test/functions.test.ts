import { describe, it, expect, beforeEach } from "bun:test"
import fs from "fs"
import path from "path"

// We test the pure functions that don't require puppeteer or ccxt
import { analyseJsonTable } from "../src/functions"
import { validIntervals } from "../src/constants"

const TEST_DIR = "/tmp/crypto-tv-signals-bot-function-tests"
const TEST_JSONC_FILE = path.join(TEST_DIR, "test.jsonc")

beforeEach(() => {
    if(!fs.existsSync(TEST_DIR))
        fs.mkdirSync(TEST_DIR, { recursive: true })
})

describe("isValidInterval", () => {
    it("returns true for valid intervals", () => {
        for(const interval of [...validIntervals]) {
            expect(validIntervals.has(interval)).toBe(true)
        }
    })

    it("returns false for an invalid interval string", () => {
        expect(validIntervals.has("3m")).toBe(false)
        expect(validIntervals.has("6h")).toBe(false)
        expect(validIntervals.has("1d")).toBe(false) // lowercase 'd'
        expect(validIntervals.has("")).toBe(false)
        expect(validIntervals.has("invalid")).toBe(false)
    })

    it("is case-sensitive (1d is not the same as 1D)", () => {
        expect(validIntervals.has("1D")).toBe(true)
        expect(validIntervals.has("1d")).toBe(false)
    })

    it("returns false for numeric-only input", () => {
        expect(validIntervals.has("1")).toBe(false)
    })
})

describe("analyseJsonTable", () => {
    // The algorithm:
    // - Iterates from i=1
    // - Sets firstPrice when i==1
    // - When a signal changes from index i to i+1:
    //   sets lastPrice = data[i].price, profit = lastPrice - firstPrice (based on signal)
    //   then firstPrice is reset to data[i+1].price
    // - After the loop, any open position is closed at the last row's price
    // All tests pass feeRate=0 unless explicitly testing fee behaviour

    function writeTestJsonc(records: Array<{ pair: string, interval: string, unix_time: number, price: number, signal: string }>): void {
        // Mimic the NDJSON format that logJsonTable writes: one JSON object per line
        const content = records.map(record => JSON.stringify(record)).join("\n") + "\n"
        fs.writeFileSync(TEST_JSONC_FILE, content)
    }

    it("calculates profit for BUY signal across multiple rows before a SELL", async () => {
        // i=1: data[1]={BUY,100}, data[2]={BUY,110} - same, firstPrice=100, continue
        // i=2: data[2]={BUY,110}, data[3]={SELL,120} - change! lastPrice=110, profit=110-100=10
        // EOF: open SELL from firstPrice=120 to lastRow=115, profit=-(115-120)=5
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },  // data[0] skipped
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },  // data[1]: firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },  // data[2]: same signal, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" }, // data[3]: signal change! lastPrice=110
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }  // data[4]: last item — EOF close
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY: profit = lastPrice(110) - firstPrice(100) = 10
        // SELL EOF: profit = -(115-120) = 5
        expect(result.profit_per_transaction).toEqual([10, 5])
        expect(result.sum).toBe(15)
    })

    it("calculates profit for STRONG BUY signal (doubled)", async () => {
        // i=2: data[2]={STRONG BUY,110}, data[3]={SELL,120} - change! lastPrice=110, profit=(110-100)*2=20
        // EOF: open SELL from 120 to 115, profit=-(115-120)=5
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "STRONG BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "STRONG BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "STRONG BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // STRONG BUY: profit = (110 - 100) * 2 = 20
        // SELL EOF: profit = -(115-120) = 5
        expect(result.profit_per_transaction).toEqual([20, 5])
        expect(result.sum).toBe(25)
    })

    it("calculates zero profit for NEUTRAL signal and closes the next open position at EOF", async () => {
        // NEUTRAL always returns 0; then BUY opens and closes at EOF
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "NEUTRAL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "NEUTRAL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "NEUTRAL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 125, signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // NEUTRAL: 0; BUY EOF: 125-120=5
        expect(result.profit_per_transaction).toEqual([0, 5])
        expect(result.sum).toBe(5)
    })

    it("calculates profit for SELL signal (short position)", async () => {
        // SELL: profit = (lastPrice - firstPrice) * (-1)
        // If price drops during SELL: lastPrice < firstPrice → profit > 0
        // EOF: open BUY from 80 to 85, profit=5
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 120,  signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100,  signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 90,   signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 80,   signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 85,   signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // SELL: firstPrice=100, lastPrice=90, profit=(90-100)*(-1)=10
        // BUY EOF: 85-80=5
        expect(result.profit_per_transaction).toEqual([10, 5])
        expect(result.sum).toBe(15)
    })

    it("calculates profit for STRONG SELL signal (doubled short)", async () => {
        // EOF: open BUY from 80 to 85, profit=5
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 120,  signal: "STRONG SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100,  signal: "STRONG SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 90,   signal: "STRONG SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 80,   signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 85,   signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // STRONG SELL: firstPrice=100, lastPrice=90, profit=(90-100)*(-2)=20
        // BUY EOF: 85-80=5
        expect(result.profit_per_transaction).toEqual([20, 5])
        expect(result.sum).toBe(25)
    })

    it("inverts profits when inverted=true", async () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, true, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY profit=10, SELL EOF profit=5 — inverted: [-10, -5]
        expect(result.profit_per_transaction).toEqual([-10, -5])
        expect(result.sum).toBe(-15)
    })

    it("returns the variation as a percentage string ending with '%'", async () => {
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(typeof result.var).toBe("string")
        expect(result.var.endsWith("%")).toBe(true)
        // profit=[10,5], sum=15, absoluteFirstPrice=100, var = 15/100*100 = 15%
        expect(result.var).toBe("15%")
    })

    it("closes open position at end of file when there are no signal changes", async () => {
        // No signal change in loop — but open BUY position is closed at EOF
        // firstPrice=110 (data[1]), lastPrice=120 (data[2]), profit=10
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 120, signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY: firstPrice=110, lastPrice=120 → profit=10
        expect(result.profit_per_transaction).toEqual([10])
        expect(result.sum).toBe(10)
        expect(result.var).toBe(`${10/110*100}%`)
    })

    it("returns undefined when file has only two rows (insufficient for analysis)", async () => {
        // Loop: i=1, nextRow=undefined → break before firstPrice is set → no EOF close
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0)
        expect(result).toBeUndefined()
    })

    it("handles multiple signal transitions correctly and closes the trailing open position", async () => {
        // First run: BUY at 100, 110; change to SELL at index 3 → firstPrice=100, lastPrice=110, profit=10
        // Second run: SELL at 120, 115; change to BUY at index 5 → firstPrice=120, lastPrice=115, profit=5
        // EOF: open BUY from 105 to 108 → profit=3
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },   // data[0] skipped
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },   // data[1]: firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },   // data[2]: same, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },  // data[3]: change! lastPrice=110, profit=10; firstPrice=120
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" },  // data[4]: same, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 6000, price: 105, signal: "BUY" },   // data[5]: change! lastPrice=115, profit=5; firstPrice=105
            { pair: "BTCUSDT", interval: "1m", unix_time: 7000, price: 108, signal: "BUY" }    // data[6]: last item — EOF close BUY 105→108, profit=3
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.length).toBe(3)
        expect(result.profit_per_transaction.at(0)).toBe(10)
        expect(result.profit_per_transaction.at(1)).toBe(5)
        expect(result.profit_per_transaction.at(2)).toBe(3)
        expect(result.sum).toBe(18)
    })

    it("deducts round-trip trading fees from each completed trade", async () => {
        // feeRate=0.001 (0.1% per side, charged on both entry and exit)
        // BUY: firstPrice=100, lastPrice=110
        //   fee = 0.001*(100+110) = 0.21 → profit = 10-0.21 = 9.79
        // EOF SELL: firstPrice=120, lastPrice=115
        //   fee = 0.001*(120+115) = 0.235 → profit = -(115-120)-0.235 = 5-0.235 = 4.765
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0.001) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.at(0)).toBeCloseTo(9.79, 5)
        expect(result.profit_per_transaction.at(1)).toBeCloseTo(4.765, 5)
        expect(result.sum).toBeCloseTo(14.555, 5)
    })

    it("throws when the file does not exist", async () => {
        await expect(analyseJsonTable("/nonexistent/file.jsonc")).rejects.toThrow()
    })
})
