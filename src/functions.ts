import puppeteer from "puppeteer"
import { Exchange } from "ccxt"
import { defaultExchange } from './exchanges'
import { writeFile, appendFile } from './tools'

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

async function logHtmlTable(pair:string, interval:string, delay:number=10, exchange:Exchange=defaultExchange, noFile:boolean=false) {

    const date = new Date() // Creating a date object

    const fileName = `output/${pair}_${interval}_${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}.html` // We generate a file name in the output folder, with some info such as the pair, the TradingView interval and the date

    const head = `
        <!-- Filename : ${fileName} -->
        <script src="script.js" defer></script>
        <h2>Current pair : ${pair} | Interval : ${interval}</h2>
        <table>
            <thead>
                <td>Prix</td>
                <td>Recommendation</td>
            </thead>
        ` // Head of the html file, with info and the client script tag

    console.log(head) // Log the head in the console

    if (!noFile) { // If the noFile value is false (if we want a file)
        writeFile(fileName,head) // We create the file (replacing if one already exists), with the head as content
    }

    setInterval(async () => { // We repeat the following forever, with a delay

        let row = `
            <tr>
                <td>${await getLastPrice(pair, exchange)}</td>
                <td>${await getIndicator(pair,interval)}</td>
            </tr>
        ` // Every row of the table
        console.log(row) // We log the row

        if (!noFile) { // If we want a file
            appendFile(fileName,row) // We add to the previously created file (with the file name) the row
        }

    }, delay*1000) // We set the delay, converting it from seconds to milliseconds
}

export {
    getIndicator,
    getLastPrice,
    getReturnFromHTML,
    logHtmlTable
}