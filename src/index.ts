import { validIntervals } from './constants'
import { getLastPrice, getIndicator, logJsonTable, analyseJsonTable, isPairValid } from './functions'
import { getValueFromArgv, isArgv } from './tools'
import puppeteer, { Browser } from "puppeteer"

const validCommands = ['analyze', 'simulate', 'write', 'log']
const firstArgv = process.argv.at(2)

if(!firstArgv || !validCommands.includes(firstArgv)) {
    console.error(`Invalid or missing command. Expected one of: ${validCommands.filter(c => c !== 'log').join(', ')}`)
    process.exit(1)
}

// analyze does not require a browser
if(firstArgv === 'analyze') {
    const path = getValueFromArgv("--path", process.argv)
    const inverted = isArgv("--inverted", process.argv)

    if(!path) {
        console.error("--path is required for the analyze command")
        process.exit(1)
    }

    try {
        console.info(await analyseJsonTable(path, inverted))
    } catch(error: unknown) {
        console.error(`Failed to analyze file at "${path}": ${error}`)
        process.exit(1)
    }

    process.exit(0)
}

const browser: Browser = await puppeteer.launch()

process.on('SIGINT', async () => {
    await browser.close()
    process.exit(0)
})

if(firstArgv === 'simulate') {
    const pair = getValueFromArgv("--pair", process.argv)
    const interval = getValueFromArgv("--interval", process.argv) ?? "1m"

    if(!pair) {
        console.error("--pair is required for the simulate command")
        await browser.close()
        process.exit(1)
    }

    if(!validIntervals.has(interval)) {
        console.error(`Invalid interval "${interval}". Allowed: ${validIntervals.values().toArray().join(',')}`)
        await browser.close()
        process.exit(1)
    }

    if(!await isPairValid(pair)) {
        console.error(`Invalid pair "${pair}". Make sure it exists on Binance.`)
        await browser.close()
        process.exit(1)
    }

    setInterval(async () => {
        console.info(`Pair : ${pair} | Interval : ${interval} | Price : ${await getLastPrice(pair)} | Signal : ${await getIndicator(browser, pair, interval)}`)
    }, 1000)
}

if(firstArgv === 'write' || firstArgv === 'log') {
    const pair = getValueFromArgv("--pair", process.argv)
    const interval = getValueFromArgv("--interval", process.argv) ?? "1m"
    const delay = Number(getValueFromArgv("--delay", process.argv)) || 10

    if(!pair) {
        console.error("--pair is required for the write command")
        await browser.close()
        process.exit(1)
    }

    if(!validIntervals.has(interval)) {
        console.error(`Invalid interval "${interval}". Allowed: ${validIntervals.values().toArray().join(',')}`)
        await browser.close()
        process.exit(1)
    }

    if(!await isPairValid(pair)) {
        console.error(`Invalid pair "${pair}". Make sure it exists on Binance.`)
        await browser.close()
        process.exit(1)
    }

    await logJsonTable(browser, pair, interval, delay)
}
