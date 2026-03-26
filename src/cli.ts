import * as clack from '@clack/prompts'
import puppeteer from 'puppeteer'
import { validIntervals } from './constants'
import { analyseJsonTable, getIndicator, getLastPrice, isPairValid, logJsonTable } from './functions'
import { simulateLogger } from './logger'

export async function discoverNdjsonFiles(): Promise<string[]> {
    const glob = new Bun.Glob('**/*.ndjson')
    const files: string[] = []
    for await (const file of glob.scan({ cwd: process.cwd() })) {
        if(!file.startsWith('node_modules/'))
            files.push(`./${file}`)
    }
    return files.sort()
}

async function promptPairAndInterval(): Promise<{ pair: string, interval: string } | undefined> {
    const pair = await clack.text({
        message: 'Cryptocurrency pair',
        placeholder: 'BTCUSDT',
        validate: value => !value?.trim() ? 'Pair is required' : undefined
    })
    if(clack.isCancel(pair)) return undefined

    const interval = await clack.select({
        message: 'TradingView interval',
        options: [...validIntervals].map(value => ({ value, label: value }))
    })
    if(clack.isCancel(interval)) return undefined

    return { pair: pair as string, interval: interval as string }
}

export async function runCli(): Promise<void> {
    clack.intro('Crypto TV Signals Bot')

    const command = await clack.select({
        message: 'What would you like to do?',
        options: [
            { value: 'simulate', label: 'simulate', hint: 'print live price + signal on a loop' },
            { value: 'write',    label: 'write',    hint: 'record price + signal to .ndjson file' },
            { value: 'analyze',  label: 'analyze',  hint: 'estimate ROI from a .ndjson file' }
        ]
    })

    if(clack.isCancel(command)) {
        clack.cancel('Cancelled.')
        return
    }

    if(command === 'analyze') {
        const files = await discoverNdjsonFiles()

        if(files.length === 0) {
            clack.log.warn('No .ndjson files found in the current directory tree.')
            clack.outro('Nothing to analyze.')
            return
        }

        const filePath = await clack.select({
            message: 'Select a .ndjson file',
            options: files.map(file => ({ value: file, label: file }))
        })
        if(clack.isCancel(filePath)) { clack.cancel('Cancelled.'); return }

        const inverted = await clack.confirm({
            message: 'Invert strategy? (short on BUY, long on SELL)',
            initialValue: false
        })
        if(clack.isCancel(inverted)) { clack.cancel('Cancelled.'); return }

        const spinner = clack.spinner()
        spinner.start('Analyzing…')

        try {
            const result = await analyseJsonTable(filePath as string, inverted as boolean)
            spinner.stop('Analysis complete')
            if(result === undefined) {
                clack.log.warn('No signal changes found — cannot compute profit.')
            } else {
                clack.log.info(`Transactions : ${result.profit_per_transaction.length}`)
                clack.log.info(`Sum          : ${result.sum}`)
                clack.log.info(`Variation    : ${result.var}`)
            }
        } catch(analysisError: unknown) {
            spinner.stop('Analysis failed')
            clack.log.error(String(analysisError))
        }

        clack.outro('Done.')
        return
    }

    // simulate and write both need a pair + interval
    const pairInterval = await promptPairAndInterval()
    if(!pairInterval) { clack.cancel('Cancelled.'); return }
    const { pair, interval } = pairInterval

    const spinner = clack.spinner()
    spinner.start('Validating pair on Binance…')
    const valid = await isPairValid(pair)
    if(!valid) {
        spinner.stop('Validation failed')
        clack.log.error(`"${pair}" was not found on Binance.`)
        clack.outro('Aborted.')
        return
    }
    spinner.stop('Pair validated')

    const browserArgs = process.env.PUPPETEER_NO_SANDBOX === 'true'
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : []

    if(command === 'write') {
        const delayInput = await clack.text({
            message: 'Delay between records (seconds)',
            placeholder: '10',
            initialValue: '10',
            validate: value => {
                const num = Number(value)
                return isNaN(num) || num <= 0 ? 'Must be a positive number' : undefined
            }
        })
        if(clack.isCancel(delayInput)) { clack.cancel('Cancelled.'); return }

        const delay = Number(delayInput) || 10
        const browser = await puppeteer.launch({ args: browserArgs })
        process.on('SIGINT', async () => { await browser.close(); process.exit(0) })
        clack.outro(`Writing ${pair} @ ${interval} every ${delay}s — press Ctrl+C to stop.`)
        await logJsonTable(browser, pair, interval, delay)
        return
    }

    // simulate
    const browser = await puppeteer.launch({ args: browserArgs })
    process.on('SIGINT', async () => { await browser.close(); process.exit(0) })
    clack.outro(`Simulating ${pair} @ ${interval} — press Ctrl+C to stop.`)

    setInterval(async () => {
        const price = await getLastPrice(pair)
        const signal = await getIndicator(browser, pair, interval)
        simulateLogger(`Pair: ${pair} | Interval: ${interval} | Price: ${price} | Signal: ${signal}`)
    }, 1000)
}
