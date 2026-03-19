import { Browser } from "puppeteer"
import { Exchange } from "ccxt"
import { defaultExchange } from './exchanges'
import { writeFile, appendFile, readOutputFile } from './tools'
import { TickerRow, AnalysisResult, SignalValue } from './interfaces'
import { mkdir } from "node:fs/promises"
import { validIntervals } from "./constants"

/**
 * Returns a signal indicator from TradingView's Technical Analysis Widget
 * @param browser The Puppeteer browser instance to use
 * @param pair The pair to get the indicator for (e.g. "BTCUSDT")
 * @param interval The TradingView time interval (e.g. "1m", "4h", "1D")
 * @param platform The TradingView data source platform in uppercase (default: "BINANCE")
 * @returns The signal string, or "ERROR" on failure
 */
export async function getIndicator(browser: Browser, pair: string, interval: string = "1m", platform: string = "BINANCE"): Promise<SignalValue> {

    if(!validIntervals.has(interval)) {
        console.warn(`INVALID INTERVAL : ${interval} not in ${validIntervals}`)
        return 'ERROR'
    }

    const settings = {
        interval: interval,
        width: 425,
        isTransparent: false,
        height: 450,
        symbol: `${platform}:${pair}`,
        showIntervalTabs: true,
        colorTheme: "light",
        utm_source: "127.0.0.1",
        utm_medium: "widget_new",
        utm_campaign: "technical-analysis"
    }
    const url = `https://s.tradingview.com/embed-widget/technical-analysis/?locale=en#${JSON.stringify(settings)}`

    try {
        const page = await browser.newPage()
        await page.goto(url)
        await page.waitForSelector('[class*="speedometerText"]')

        const trend = await page.evaluate(() => {
            const signalClass = (document.documentElement.querySelector('[class*="speedometerText"]')?.parentElement?.classList.item(1) as string).split('-') as string[]

            if(signalClass.at(1) === 'strong')
                return `${signalClass.at(1)?.toUpperCase()} ${signalClass.at(2)?.toUpperCase()}`
            return signalClass.at(1)?.toUpperCase()
        })

        await page.close()
        return (trend ?? 'ERROR') as SignalValue

    } catch(error: unknown) {
        console.error(error)
        return 'ERROR'
    }
}

/**
 * Returns the latest price of a cryptocurrency pair
 * @param pair The pair to fetch (e.g. "BTCUSDT")
 * @param exchange CCXT exchange instance to use (default: Binance)
 * @returns The last price as a number, or undefined if unavailable
 */
export async function getLastPrice(pair: string, exchange: Exchange = defaultExchange): Promise<number | undefined> {
    const info = await exchange.fetchTicker(pair)
    return info.last
}

/**
 * Writes one JSON record per line to a .ndjson file at each interval tick.
 * The file is valid NDJSON at all times — safe through crashes or early exits.
 * @param browser The Puppeteer browser instance to use
 * @param pair The cryptocurrency pair (e.g. "BTCUSDT")
 * @param interval The TradingView signal interval
 * @param delay Seconds between each fetch and write (default: 10)
 * @param exchange CCXT exchange instance to use (default: Binance)
 */
export async function logJsonTable(browser: Browser, pair: string, interval: string, delay: number = 10, exchange: Exchange = defaultExchange): Promise<void> {

    await mkdir('./output', { recursive: true })

    const date = new Date()
    const fileName = `output/${pair}_${interval}_${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}.ndjson`

    await writeFile(fileName, '', true)

    setInterval(async () => {
        try {
            const row: TickerRow = {
                pair: pair,
                interval: interval,
                unix_time: Date.now(),
                price: await getLastPrice(pair, exchange),
                signal: await getIndicator(browser, pair, interval)
            }

            console.info(row)
            await appendFile(fileName, JSON.stringify(row) + "\n")

        } catch(error: unknown) {
            console.error('Failed to write row:', error)
        }
    }, delay * 1000)
}

/**
 * Reads a .ndjson file produced by logJsonTable and estimates ROI per signal run.
 * Strategy: enter at start of each signal run, exit when signal changes.
 *   STRONG BUY → long x2 | BUY → long x1 | NEUTRAL → no position
 *   SELL → short x1 | STRONG SELL → short x2
 * @param pathToNdjsonFile Path to the .ndjson file to analyze
 * @param inverted If true, all positions are reversed (short on BUY, long on SELL)
 * @returns AnalysisResult with per-transaction profits, total sum and % variation, or undefined if no signal changes
 */
export async function analyseJsonTable(pathToNdjsonFile: string, inverted: boolean = false): Promise<AnalysisResult | undefined> {

    const data = await readOutputFile(pathToNdjsonFile) as Array<TickerRow>

    let firstPrice: number | undefined
    let absoluteFirstPrice: number | undefined
    const globalProfit: number[] = []

    for(let i = 1; i < data.length; i++) {

        const row = data.at(i)
        const nextRow = data.at(i + 1)

        if(row === undefined || nextRow === undefined)
            break

        if(i === 1) {
            firstPrice = row.price
            absoluteFirstPrice = row.price
        }

        if(firstPrice === undefined || row.price === undefined)
            continue

        if(row.signal === nextRow.signal)
            continue

        const lastPrice = row.price
        let profit: number

        switch(row.signal) {
            case 'BUY':
                profit = lastPrice - firstPrice
                break
            case 'STRONG BUY':
                profit = (lastPrice - firstPrice) * 2
                break
            case 'NEUTRAL':
                profit = 0
                break
            case 'SELL':
                profit = (lastPrice - firstPrice) * -1
                break
            case 'STRONG SELL':
                profit = (lastPrice - firstPrice) * -2
                break
            default:
                profit = 0
        }

        globalProfit.push(profit)
        firstPrice = nextRow.price
    }

    if(globalProfit.length === 0) {
        console.warn("There is no change of signal in the given file. Therefore, it isn't possible to calculate a profit.")
        return undefined
    }

    const profitSum = globalProfit.reduce((accumulator: number, currentValue: number): number => accumulator + currentValue)
    if(absoluteFirstPrice === undefined) return undefined
    const profitVariation = (profitSum / absoluteFirstPrice) * 100

    const result: AnalysisResult = {
        profit_per_transaction: inverted ? globalProfit.map(p => -1 * p) : globalProfit,
        sum: inverted ? -1 * profitSum : profitSum,
        var: (inverted ? -1 * profitVariation : profitVariation) + '%'
    }

    return result
}

/**
 * Returns true if the pair exists on the exchange, false otherwise
 */
export async function isPairValid(pair: string): Promise<boolean> {
    try {
        await getLastPrice(pair)
        return true
    } catch(pairError: unknown) {
        console.error('Pair validation failed:', pairError)
        return false
    }
}