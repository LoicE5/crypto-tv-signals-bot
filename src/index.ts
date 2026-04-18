import { validCommands, validIntervals } from './constants'
import { getLastPrice, getIndicator, logJsonTable, analyseJsonTable, isPairValid } from './functions'
import { getValueFromArgv, isArgv } from './tools'
import { simulateLogger } from './logger'
import puppeteer, { Browser } from "puppeteer"
import { runCli } from './cli'

const firstArgv = process.argv.at(2)

// No arguments — launch interactive CLI
if(!firstArgv) {
    await runCli()
} else {

    if(!validCommands.has(firstArgv)) {
        console.error(`Invalid command "${firstArgv}". Expected one of: ${[...validCommands].filter(command => command !== 'log').join(', ')}`)
        process.exit(1)
    }

    // analyze does not require a browser
    if(firstArgv === 'analyze') {
        const path = getValueFromArgv("--path", process.argv)
        const inverted = isArgv("--inverted", process.argv)
        const amountStr = getValueFromArgv("--amount", process.argv)
        const amount = amountStr !== null ? Number(amountStr) : undefined
        const feeStr = getValueFromArgv("--fee", process.argv)
        const fee = feeStr !== null ? Number(feeStr) : undefined
        const slippageStr = getValueFromArgv("--slippage", process.argv)
        const slippage = slippageStr !== null ? Number(slippageStr) : 0

        if(!path) {
            console.error("--path is required for the analyze command")
            process.exit(1)
        }

        if(amount !== undefined && (isNaN(amount) || amount <= 0)) {
            console.error("--amount must be a positive number")
            process.exit(1)
        }

        if(fee !== undefined && (isNaN(fee) || fee < 0 || fee >= 1)) {
            console.error("--fee must be a decimal in [0, 1) — e.g. 0.001 for 0.1% per leg")
            process.exit(1)
        }

        if(isNaN(slippage) || slippage < 0 || slippage >= 1) {
            console.error("--slippage must be a decimal in [0, 1) — e.g. 0.0005 for 5 bps per leg")
            process.exit(1)
        }

        try {
            console.info(await analyseJsonTable(path, inverted, fee, amount, slippage))
        } catch(error: unknown) {
            console.error(`Failed to analyze file at "${path}": ${error}`)
            process.exit(1)
        }

        process.exit(0)
    }

    const noSandbox = process.env.PUPPETEER_NO_SANDBOX === 'true'
    const browser: Browser = await puppeteer.launch({
        args: noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
    })

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
            try {
                simulateLogger(`Pair : ${pair} | Interval : ${interval} | Price : ${await getLastPrice(pair)} | Signal : ${await getIndicator(browser, pair, interval)}`)
            } catch(simulateError: unknown) {
                console.error('Simulate tick failed:', simulateError)
            }
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

} // end else (CLI argument mode)
