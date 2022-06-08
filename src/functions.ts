import puppeteer from "puppeteer"
import { Exchange } from "ccxt"
import { defaultExchange } from './exchanges'
import { writeFile, appendFile, readJsoncOutputFile } from './tools'

/**
 * Returns a string indicator ("BUY","SELL","NEUTRAL","STRONG BUY","STRONG SELL") from TradingView's widget
 * @param pair The pair we want to get the indicator from (like "BTCUSDT")
 * @param interval The interval (1 minute, 1 hour, 1 day...) we want the indicator to be calculated on
 * @param platform The platform we want to use as TradingView's data source (default is "BINANCE", caps string only)
 * @returns 
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

async function getLastPrice(pair:string, exchange:Exchange=defaultExchange) {

    let info = await exchange.fetchTicker(pair)
    let price = info.last

    return price
}

async function getReturnFromHTML(url:string) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.goto(url)

    const global_return = await page.evaluate(() => {
        return JSON.parse((<HTMLElement>document.documentElement.querySelector('p#results')!).innerText)
    })

    await browser.close()

    return global_return
}

async function logJsonTable(pair:string, interval:string, delay:number=10, exchange:Exchange=defaultExchange) {

    const date = new Date() // Creating a date object

    const fileName = `output/${pair}_${interval}_${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}.jsonc` // We generate a file name in the output folder, with some info such as the pair, the TradingView interval and the date

    const head = `/* File : ${fileName} */ [` // Head of the html file, with info

    writeFile(fileName,head) // We create the file (replacing if one already exists), with the head as content

    setInterval(async () => { // We repeat the following forever, with a delay

        let row = {
            "pair": pair,
            "interval": interval,
            "unix_time": date.getTime(),
            "price": await getLastPrice(pair, exchange),
            "signal": await getIndicator(pair, interval)
        }
    
        console.log(row) // We log the row

        appendFile(fileName,JSON.stringify(row)+`,`) // We add to the previously created file (with the file name) the row

    }, delay*1000) // We set the delay, converting it from seconds to milliseconds
}

function analyseJsonTable(pathToJsoncFile: string, inverted:boolean=false): Object|void {
    
    const data = readJsoncOutputFile(pathToJsoncFile) as Array<any>

    let first_price, last_price, absolute_first_price;

    let benefice_global = []

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
    
            benefice_global.push(benef)
    
            first_price = prix.next
            last_price = undefined
            continue
        }
    
    }


    try {
        let benefice_sum = benefice_global.reduce((previousValue, currentValue) => previousValue + currentValue)
        let benefice_var = ((benefice_global.reduce((previousValue, currentValue) => previousValue + currentValue)/absolute_first_price)* 100) // in %
        
        if (inverted) {
            benefice_global = benefice_global.map(num => -1 * num)
            benefice_sum = -1 * benefice_sum
            benefice_var = -1 * benefice_var
        }

        const results = {
            array: benefice_global,
            sum: benefice_sum,
            var: benefice_var+'%'
        }
    
        return results

    } catch (e) {
        console.log("There is no change of signal in the given jsonc file. Therefore, it isn't possible to calculate a profit.")
    }

}


export {
    getIndicator,
    getLastPrice,
    getReturnFromHTML,
    logJsonTable,
    analyseJsonTable
}