import { getLastPrice, getIndicator, logJsonTable, analyseJsonTable, isValidInterval, isPairValid } from './functions'
import { getValueFromArgv, isArgv } from './tools'
import puppeteer, { Browser } from "puppeteer"

;(async () => {

    const validCommands = ['analyze', 'simulate', 'write', 'log']
    const firstArgv = process.argv.at(2)

    if(!firstArgv || !validCommands.includes(firstArgv)) {
        console.error(`Invalid or missing command. Expected one of: ${validCommands.filter(c => c !== 'log').join(', ')}`)
        process.exit(1)
    }

    const browser: Browser = await puppeteer.launch()

    // If the argv is Analyze
    if(firstArgv == 'analyze') {
        const path = getValueFromArgv("--path", process.argv) as string
        const inverted = isArgv("--inverted", process.argv)

        try {
            console.info(analyseJsonTable(path, inverted))
        } catch(error: unknown) {
            console.error(`Please make sure that you have correctly entered your path. The given one is ${path}. \n\n Thrown error : ${error}`)
        }

    }

    // If the argv word is Simulate
    if(firstArgv == 'simulate') {
        const pair = getValueFromArgv("--pair", process.argv) as string
        const interval = getValueFromArgv("--interval", process.argv) as string || "1m"

        if(!isValidInterval(interval)) {
            console.error("The given interval is not valid")
            return
        }

        if(!await isPairValid(pair)) {
            console.error("The given pair is not valid")
            return
        }

        setInterval(async () => {
            console.info(`Pair : ${pair} | Interval : ${interval} | Price : ${await getLastPrice(pair)} | Signal : ${await getIndicator(browser, pair, interval)}`)
        }, 1000)
    }

    // If the argv word is Log
    if(firstArgv == 'write' || firstArgv == 'log') {
        const pair = getValueFromArgv("--pair", process.argv) as string
        const interval = getValueFromArgv("--interval", process.argv) as string || "1m"
        const delay = Number(getValueFromArgv("--delay", process.argv)) || 10

        if(!isValidInterval(interval)) {
            console.error("The given interval is not valid")
            return
        }

        if(!await isPairValid(pair)) {
            console.error("The given pair is not valid")
            return
        }

        await logJsonTable(browser, pair, interval, delay)
    }

})()
