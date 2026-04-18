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
    // - Iterates entries() from i=0
    // - Sets firstPrice at i=0 (data[0] is the trade entry price for the first signal run)
    // - When a signal changes from index i to i+1:
    //   lastPrice = data[i].price, profit based on signal(firstPrice → lastPrice)
    //   then firstPrice is reset to data[i+1].price
    // - After the loop, any open position is closed at the last row's price
    // All tests pass feeRate=0 unless explicitly testing fee behaviour

    function writeTestJsonc(records: Array<{ pair: string, interval: string, unix_time: number, price: number, signal: string }>): void {
        // Mimic the NDJSON format that logJsonTable writes: one JSON object per line
        const content = records.map(record => JSON.stringify(record)).join("\n") + "\n"
        fs.writeFileSync(TEST_JSONC_FILE, content)
    }

    it("calculates profit for BUY signal across multiple rows before a SELL", async () => {
        // i=0: data[0]={BUY,90}, data[1]={BUY,100} — firstPrice=90, same signal, continue
        // i=1: data[1]={BUY,100}, data[2]={BUY,110} — same signal, continue
        // i=2: data[2]={BUY,110}, data[3]={SELL,120} — change! lastPrice=110, profit=110-90=20
        // EOF: open SELL from firstPrice=120 to lastRow=115, profit=-(115-120)=5
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },  // data[0]: firstPrice=90
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },  // data[1]: same, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },  // data[2]: signal change below
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" }, // data[3]: firstPrice reset to 120
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }  // data[4]: last item — EOF close
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY: profit = lastPrice(110) - firstPrice(90) = 20
        // SELL EOF: profit = -(115-120) = 5
        expect(result.profit_per_transaction).toEqual([20, 5])
        expect(result.sum).toBe(25)
    })

    it("calculates profit for STRONG BUY signal (doubled)", async () => {
        // i=2: data[2]={STRONG BUY,110}, data[3]={SELL,120} — change! lastPrice=110, profit=(110-90)*2=40
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
        // STRONG BUY: profit = (110 - 90) * 2 = 40
        // SELL EOF: profit = -(115-120) = 5
        expect(result.profit_per_transaction).toEqual([40, 5])
        expect(result.sum).toBe(45)
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
        // SELL: firstPrice=120, lastPrice=90, profit=(90-120)*(-1)=30
        // BUY EOF: 85-80=5
        expect(result.profit_per_transaction).toEqual([30, 5])
        expect(result.sum).toBe(35)
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
        // STRONG SELL: firstPrice=120, lastPrice=90, profit=(90-120)*(-2)=60
        // BUY EOF: 85-80=5
        expect(result.profit_per_transaction).toEqual([60, 5])
        expect(result.sum).toBe(65)
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
        // BUY profit=20, SELL EOF profit=5 — inverted: [-20, -5]
        expect(result.profit_per_transaction).toEqual([-20, -5])
        expect(result.sum).toBe(-25)
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
        // profit=[20,5], sum=25, absoluteFirstPrice=90, var = 25/90*100 = 27.777...%
        expect(result.var).toBe(`${25 / 90 * 100}%`)
    })

    it("closes open position at end of file when there are no signal changes", async () => {
        // No signal change in loop — but open BUY position is closed at EOF
        // firstPrice=100 (data[0]), lastPrice=120 (data[2]), profit=20
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 120, signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        // BUY: firstPrice=100, lastPrice=120 → profit=20
        expect(result.profit_per_transaction).toEqual([20])
        expect(result.sum).toBe(20)
        expect(result.var).toBe("20%")
    })

    it("calculates profit from exactly two rows (first row is entry, second is EOF close)", async () => {
        // i=0: row=data[0](100,BUY), nextRow=data[1](110,BUY) — firstPrice=100, same signal, continue
        // i=1: row=data[1], nextRow=undefined → break
        // EOF: BUY from firstPrice=100 to lastRow(110) → profit=10
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction).toEqual([10])
        expect(result.sum).toBe(10)
        expect(result.var).toBe("10%")
    })

    it("returns undefined when file has only one row (no trade can be computed)", async () => {
        // i=0: nextRow=undefined → break immediately before firstPrice is set
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0)
        expect(result).toBeUndefined()
    })

    it("handles multiple signal transitions correctly and closes the trailing open position", async () => {
        // First run: BUY at 90; change to SELL at index 2 → firstPrice=90, lastPrice=110, profit=20
        // Second run: SELL at 120; change to BUY at index 4 → firstPrice=120, lastPrice=115, profit=5
        // EOF: open BUY from 105 to 108 → profit=3
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },   // data[0]: firstPrice=90
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },   // data[1]: same, continue
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },   // data[2]: change! lastPrice=110, profit=20; firstPrice=120
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },  // data[3]: firstPrice=120
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" },  // data[4]: change! lastPrice=115, profit=5; firstPrice=105
            { pair: "BTCUSDT", interval: "1m", unix_time: 6000, price: 105, signal: "BUY" },   // data[5]: firstPrice=105
            { pair: "BTCUSDT", interval: "1m", unix_time: 7000, price: 108, signal: "BUY" }    // data[6]: last item — EOF close BUY 105→108, profit=3
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.length).toBe(3)
        expect(result.profit_per_transaction.at(0)).toBe(20)
        expect(result.profit_per_transaction.at(1)).toBe(5)
        expect(result.profit_per_transaction.at(2)).toBe(3)
        expect(result.sum).toBe(28)
    })

    it("deducts round-trip trading fees from each completed trade", async () => {
        // feeRate=0.001 (0.1% per side, charged on both entry and exit)
        // BUY: firstPrice=90, lastPrice=110
        //   fee = 0.001*(90+110) = 0.2 → profit = 20-0.2 = 19.8
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
        expect(result.profit_per_transaction.at(0)).toBeCloseTo(19.8, 5)
        expect(result.profit_per_transaction.at(1)).toBeCloseTo(4.765, 5)
        expect(result.sum).toBeCloseTo(24.565, 5)
    })

    it("still deducts fees as a cost when inverted=true (regression: inverted sign-flip bug)", async () => {
        // feeRate=0.001, inverted=true. Position directions flip but fees remain a DEBIT.
        // BUY: firstPrice=90, lastPrice=110
        //   fee = 0.001*(90+110) = 0.2
        //   inverted directional delta = -(110-90) = -20
        //   profit = -20 - 0.2 = -20.2
        // EOF SELL: firstPrice=120, lastPrice=115
        //   fee = 0.001*(120+115) = 0.235
        //   inverted directional delta = -(115-120) = 5  (then the SELL case negates it: -5)
        //   profit = -(-(115-120)) - 0.235 = -5 - 0.235 = -5.235
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, true, 0.001) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.at(0)).toBeCloseTo(-20.2, 5)
        expect(result.profit_per_transaction.at(1)).toBeCloseTo(-5.235, 5)
        expect(result.sum).toBeCloseTo(-25.435, 5)
    })

    it("adds slippage on top of fees as a per-leg cost", async () => {
        // feeRate=0.001, slippageRate=0.0005 → total per-leg cost 0.0015
        // BUY: firstPrice=90, lastPrice=110
        //   cost = 0.0015*(90+110) = 0.3 → profit = 20-0.3 = 19.7
        // EOF SELL: firstPrice=120, lastPrice=115
        //   cost = 0.0015*(120+115) = 0.3525 → profit = 5-0.3525 = 4.6475
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 90,  signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 100, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 110, signal: "BUY" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 120, signal: "SELL" },
            { pair: "BTCUSDT", interval: "1m", unix_time: 5000, price: 115, signal: "SELL" }
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0.001, undefined, 0.0005) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.at(0)).toBeCloseTo(19.7, 5)
        expect(result.profit_per_transaction.at(1)).toBeCloseTo(4.6475, 5)
        expect(result.sum).toBeCloseTo(24.3475, 5)
    })

    it("throws when the file does not exist", async () => {
        await expect(analyseJsonTable("/nonexistent/file.jsonc")).rejects.toThrow()
    })

    it("scales profits by amount/entryPrice when amount is provided", async () => {
        // amount=100, feeRate=0
        // Trade 1 (BUY): entry=100, exit=110, rawProfit=10, scaled=10*(100/100)=10
        // Trade 2 (SELL EOF): entry=200, exit=190, rawProfit=10, scaled=10*(100/200)=5
        // sum=15, var=15/100*100=15%
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },  // data[0]: firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" },  // data[1]: change to SELL → lastPrice=110, profit scaled
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 200, signal: "SELL" }, // data[2]: firstPrice=200
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 190, signal: "SELL" }  // data[3]: last item — EOF close
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0, 100) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.at(0)).toBeCloseTo(10, 5)
        expect(result.profit_per_transaction.at(1)).toBeCloseTo(5, 5)
        expect(result.sum).toBeCloseTo(15, 5)
        expect(result.var).toBe("15%")
    })

    it("expresses var as profit/amount when amount is provided", async () => {
        // amount=200, feeRate=0
        // BUY: entry=100, exit=110, rawProfit=10, scaled=10*(200/100)=20
        // EOF SELL: entry=100, exit=90, rawProfit=10, scaled=10*(200/100)=20
        // sum=40, var=40/200*100=20%
        writeTestJsonc([
            { pair: "BTCUSDT", interval: "1m", unix_time: 1000, price: 100, signal: "BUY" },  // firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 2000, price: 110, signal: "BUY" },  // BUY exits here
            { pair: "BTCUSDT", interval: "1m", unix_time: 3000, price: 100, signal: "SELL" }, // firstPrice=100
            { pair: "BTCUSDT", interval: "1m", unix_time: 4000, price: 90,  signal: "SELL" }  // EOF close
        ])
        const result = await analyseJsonTable(TEST_JSONC_FILE, false, 0, 200) as { profit_per_transaction: number[], sum: number, var: string }
        expect(result).toBeDefined()
        expect(result.profit_per_transaction.at(0)).toBeCloseTo(20, 5)
        expect(result.profit_per_transaction.at(1)).toBeCloseTo(20, 5)
        expect(result.sum).toBeCloseTo(40, 5)
        expect(result.var).toBe("20%")
    })
})
