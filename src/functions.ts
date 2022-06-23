import puppeteer from "puppeteer"
import { Exchange } from "ccxt"
import { defaultExchange } from './exchanges'
import { writeFile, appendFile, readJsoncOutputFile } from './tools'
import fs from "fs"

/**
 * Returns a string indicator ("BUY","SELL","NEUTRAL","STRONG BUY","STRONG SELL") from TradingView's widget
 * @param pair The pair we want to get the indicator from (like "BTCUSDT")
 * @param interval The interval (1 minute, 1 hour, 1 day...) we want the indicator to be calculated on
 * @param platform The platform we want to use as TradingView's data source (default is "BINANCE", caps string only)
 * @returns The indicator string from tradingview, or "ERROR in case of fail"
 */
async function getIndicator(pair:string, interval:string="1m", platform:string="BINANCE") {

    const valid_interval = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M']
    if (!valid_interval.includes(interval)) {
        console.log(`INVALID INTERVAL : ${interval} not in ${valid_interval}`)
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
        
        const browser = await puppeteer.launch()
        const page = await browser.newPage()
        await page.goto(url)

        await page.waitForSelector('.speedometerSignal-RaUvtPLE')

        const trend = await page.evaluate(() => {
            return (<HTMLElement>document.documentElement.querySelector('.speedometerSignal-RaUvtPLE')!).innerText
        })

        await browser.close()

        return trend

    } catch (e) {
        console.log(e)
        return "ERROR"
    }

}

/**
 * Returns the price of the given cryptocurrencies
 * @param pair The pair we want to get the price from (like "BTCUSDT")
 * @param exchange Echange CCXT object that will be used to fetch the price (default is an instance of Binance)
 * @returns The price as a float
 */
async function getLastPrice(pair:string, exchange:Exchange=defaultExchange) {

    let info = await exchange.fetchTicker(pair)
    let price = info.last

    return price
}

/**
 * Create a .jsonc file with a comment header and an empty array, that is periodically filled with JSON objects, each containing the signal and price of a cryptocurrency pair as well as the corresponding UNIX date.
 * @param pair The pair we want to get the data from (like "BTCUSDT")
 * @param delay The delay between each fetch to the exchange and TradingView's widget, therefore between each JSON object insertion
 * @param exchange Echange CCXT object that will be used to fetch the price (default is an instance of Binance)
 * @returns The price as a float
 */
async function logJsonTable(pair: string, interval: string, delay: number = 10, exchange: Exchange = defaultExchange) {
    
    if (!fs.existsSync('./output'))
        fs.mkdirSync('./output')
    
    const date = new Date() // Creating a date object

    const fileName = `output/${pair}_${interval}_${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}.jsonc` // We generate a file name in the output folder, with some info such as the pair, the TradingView interval and the date

    const head = `/* File : ${fileName} */ [` // Head of the html file, with info

    writeFile(fileName,head) // We create the file (replacing if one already exists), with the head as content

    setInterval(async () => { // We repeat the following forever, with a delay

        let row = {
            "pair": pair,
            "interval": interval,
            "unix_time": Date.now(),
            "price": await getLastPrice(pair, exchange),
            "signal": await getIndicator(pair, interval)
        }
    
        console.log(row) // We log the row

        appendFile(fileName,JSON.stringify(row)+`,`) // We add to the previously created file (with the file name) the row

    }, delay*1000) // We set the delay, converting it from seconds to milliseconds
}

/**
 * Takes a .json or .jsonc file path as input and generates estimated ROI based on the data provided. Meant to be used after using the logJsonTable() function
 * @param pathToJsoncFile String representing the absolute or relative path to the JSON file we want to analyze
 * @param inverted Boolean that inverts the trades (short when BUY, and long when SELL), and calculates the profits accorgingly
 * @returns An object returning the profit of each transaction, the sum of profits and the percentage of variation (all calculated considering operations on 1 unit of the given coin)
 */
function analyseJsonTable(pathToJsoncFile: string, inverted:boolean=false): object|void {
    
    const data = readJsoncOutputFile(pathToJsoncFile) as Array<any>

    let first_price, last_price, absolute_first_price;

    let global_profit = []

    for (let i = 1; i < data.length; i++) {

        let row = data[i];
        let nextRow = data[i + 1]
    
        if (nextRow == undefined)
            break
        
        let prix = {
            current: row.price,
            next: nextRow.price
        }
        let recommendation = {
            current: row.signal,
            next: nextRow.signal
        }
    
        if (i == 1) {
            first_price = prix.current
            absolute_first_price = prix.current
        }
    
        if (recommendation.current == recommendation.next) {
            continue
        } else {
            last_price = prix.current
            let benef
    
            switch (recommendation.current) {
                case "BUY":
                    benef = last_price - first_price
                    break
                case "STRONG BUY":
                    benef = (last_price - first_price) * 2
                    break
                case "NEUTRAL":
                    benef = 0
                    break
                case "SELL":
                    benef = (last_price - first_price) * (-1)
                    break
                case "STRONG SELL":
                    benef = (last_price - first_price) * (-2)
                    break
                default:
                    benef = 0
                    break
            }
    
            global_profit.push(benef)
    
            first_price = prix.next
            last_price = undefined
            continue
        }
    
    }


    try {
        let profit_sum = global_profit.reduce((previousValue, currentValue) => previousValue + currentValue)
        let profit_var = ((global_profit.reduce((previousValue, currentValue) => previousValue + currentValue)/absolute_first_price)* 100) // in %
        
        if (inverted) {
            global_profit = global_profit.map(num => -1 * num)
            profit_sum = -1 * profit_sum
            profit_var = -1 * profit_var
        }

        const results = {
            profit_per_transaction: global_profit,
            sum: profit_sum,
            var: profit_var+'%'
        }
    
        return results

    } catch (e) {
        console.log("There is no change of signal in the given jsonc file. Therefore, it isn't possible to calculate a profit.")
    }

}

/**
 * Returns true if the given interval string is valid, or false otherwise
 * @param interval The interval string we want to verify
 * @returns A boolean that states if the interval is correct or isn't
 */
function isValidInterval(interval: string): boolean {
    const valid_interval = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M']
    return valid_interval.includes(interval)
}

/**
 * Check if a pair is valid by returning true if it is and false if it isn't. Works by trying to fetch the price of the given pair string and returning false in case of any exception
 * @param pair The pair string we want to test
 * @returns A boolean that confirms or not the condition
 */
async function isPairValid(pair:string){
    try {
        await getLastPrice(pair)
    } catch (e) {
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