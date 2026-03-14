import puppeteer, { Browser } from "puppeteer"
import { Exchange } from "ccxt"
import { defaultExchange } from './exchanges'
import { writeFile, appendFile, readJsoncOutputFile } from './tools'
import fs from "fs"
import { validIntervals } from "./constants"

/**
 * Returns a string indicator ("BUY","SELL","NEUTRAL","STRONG BUY","STRONG SELL") from TradingView's widget
 * @param browser The Puppeteer browser instance to use
 * @param pair The pair we want to get the indicator from (like "BTCUSDT")
 * @param interval The interval (1 minute, 1 hour, 1 day...) we want the indicator to be calculated on
 * @param platform The platform we want to use as TradingView's data source (default is "BINANCE", caps string only)
 * @returns The indicator string from tradingview, or "ERROR" in case of fail
 */
async function getIndicator(browser: Browser, pair: string, interval: string = "1m", platform: string = "BINANCE"): Promise<string | undefined> {

    const validIntervals = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M']
    if(!validIntervals.includes(interval)) {
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

        return trend

    } catch(error: unknown) {
        console.error(error)
        return "ERROR"
    }

}

/**
 * Returns the price of the given cryptocurrencies
 * @param pair The pair we want to get the price from (like "BTCUSDT")
 * @param exchange Exchange CCXT object that will be used to fetch the price (default is an instance of Binance)
 * @returns The price as a float
 */
async function getLastPrice(pair: string, exchange: Exchange = defaultExchange): Promise<number | undefined> {

    const info = await exchange.fetchTicker(pair)
    const price = info.last

    return price
}

/**
 * Create a .jsonc file with a comment header and an empty array, that is periodically filled with JSON objects, each containing the signal and price of a cryptocurrency pair as well as the corresponding UNIX date.
 * @param browser The Puppeteer browser instance to use
 * @param pair The pair we want to get the data from (like "BTCUSDT")
 * @param interval The TradingView signal interval to use
 * @param delay The delay between each fetch to the exchange and TradingView's widget, therefore between each JSON object insertion
 * @param exchange Exchange CCXT object that will be used to fetch the price (default is an instance of Binance)
 */
async function logJsonTable(browser: Browser, pair: string, interval: string, delay: number = 10, exchange: Exchange = defaultExchange): Promise<void> {

    if(!fs.existsSync('./output'))
        fs.mkdirSync('./output')

    const date = new Date()

    const fileName = `output/${pair}_${interval}_${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}.jsonc`

    const head = `[`

    writeFile(fileName, head, true)

    setInterval(async () => {

        const row = {
            pair: pair,
            interval: interval,
            unix_time: Date.now(),
            price: await getLastPrice(pair, exchange),
            signal: await getIndicator(browser, pair, interval)
        }

        console.info(row)

        appendFile(fileName, JSON.stringify(row)+`,`)

    }, delay*1000)
}

/**
 * Takes a .json or .jsonc file path as input and generates estimated ROI based on the data provided. Meant to be used after using the logJsonTable() function
 * @param pathToJsoncFile String representing the absolute or relative path to the JSON file we want to analyze
 * @param inverted Boolean that inverts the trades (short when BUY, and long when SELL), and calculates the profits accordingly
 * @returns An object returning the profit of each transaction, the sum of profits and the percentage of variation (all calculated considering operations on 1 unit of the given coin)
 */
function analyseJsonTable(pathToJsoncFile: string, inverted: boolean = false): object | void {

    const data = readJsoncOutputFile(pathToJsoncFile) as Array<{ price: number, signal: string }>

    let firstPrice: number | undefined
    let lastPrice: number | undefined
    let absoluteFirstPrice: number | undefined

    let globalProfit: number[] = []

    for(let i = 1; i < data.length; i++) {

        const row = data.at(i)
        const nextRow = data.at(i + 1)

        if(nextRow == undefined)
            break

        const prices = {
            current: row!.price,
            next: nextRow.price
        }
        const recommendation = {
            current: row!.signal,
            next: nextRow.signal
        }

        if(i == 1) {
            firstPrice = prices.current
            absoluteFirstPrice = prices.current
        }

        if(recommendation.current == recommendation.next) {
            continue
        } else {
            lastPrice = prices.current
            const currentLastPrice = lastPrice
            let profit: number

            switch(recommendation.current) {
                case "BUY":
                    profit = currentLastPrice - firstPrice!
                    break
                case "STRONG BUY":
                    profit = (currentLastPrice - firstPrice!) * 2
                    break
                case "NEUTRAL":
                    profit = 0
                    break
                case "SELL":
                    profit = (currentLastPrice - firstPrice!) * (-1)
                    break
                case "STRONG SELL":
                    profit = (currentLastPrice - firstPrice!) * (-2)
                    break
                default:
                    profit = 0
                    break
            }

            globalProfit.push(profit)

            firstPrice = prices.next
            lastPrice = undefined
            continue
        }

    }

    try {
        let profitSum = globalProfit.reduce((accumulator, currentValue) => accumulator + currentValue)
        let profitVariation = ((globalProfit.reduce((accumulator, currentValue) => accumulator + currentValue) / absoluteFirstPrice!) * 100)

        if(inverted) {
            globalProfit = globalProfit.map((num) => -1 * num)
            profitSum = -1 * profitSum
            profitVariation = -1 * profitVariation
        }

        const results = {
            profit_per_transaction: globalProfit,
            sum: profitSum,
            var: profitVariation+'%'
        }

        return results

    } catch(error: unknown) {
        console.warn("There is no change of signal in the given jsonc file. Therefore, it isn't possible to calculate a profit.")
    }

}

/**
 * Returns true if the given interval string is valid, or false otherwise
 * @param interval The interval string we want to verify
 * @returns A boolean that states if the interval is correct or isn't
 */
function isValidInterval(interval: string): boolean {
    return validIntervals.has(interval)
}

/**
 * Check if a pair is valid by returning true if it is and false if it isn't. Works by trying to fetch the price of the given pair string and returning false in case of any exception
 * @param pair The pair string we want to test
 * @returns A boolean that confirms or not the condition
 */
async function isPairValid(pair: string): Promise<boolean> {
    try {
        await getLastPrice(pair)
    } catch(error: unknown) {
        return false
    }
    return true
}


export {
    getIndicator,
    getLastPrice,
    logJsonTable,
    analyseJsonTable,
    isValidInterval,
    isPairValid
}
