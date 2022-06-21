import { cp } from 'fs'
import { getLastPrice, getIndicator, logJsonTable, analyseJsonTable, isValidInterval, isPairValid } from './functions'
import { readFile, readJsonFile, readJsoncOutputFile, getValueFromArgv, isArgv } from './tools'

(async () => {

    const firstArgv = process.argv[2] // Get the first argument passed in the node CLI

    // If the argv is Analyze
    if (firstArgv == 'analyze') {
        const path = getValueFromArgv("--path", process.argv) as string // We get the value of the --path argv
        const inverted = isArgv("--inverted", process.argv) // We determinate if --inverted have been written within the argv
        
        try {
            console.log(analyseJsonTable(path, inverted)) // We try to print in the console the results of the JSON file analysis
        } catch (e) {
            console.error(`Please make sure that you have correctly entered your path. The given one is ${path}. \n\n Thrown error : ${e}`) // If the file does not exist, we show an error
        }
        
    }

    // If the argv word is Simulate
    if (firstArgv == 'simulate') {
        const pair = getValueFromArgv("--pair", process.argv) as string // We get the pair as a string, such as "BTCUSDT"
        const interval = getValueFromArgv("--interval", process.argv) as string || "1m" // We get the TradingView's signal interval to use ("1m", "4h", "1w"...)

        // If the given interval doesn't fit the requirements (string not in the allowed values), we show an error noticing the user and stop the execution
        if (!isValidInterval(interval)) {
            console.error("The given interval is not valid")
            return
        }

        // If the given pair doesn't fit the requirements (not correctly written), we show an error notifying the user and stop the execution
        if (!await isPairValid(pair)) {
            console.error("The given pair is not valid")
            return
        }

        // We log the pair, the chosen interval, the latest price from Binance, and the given signal by TradingView
        setInterval(async () => {
            console.log(`Pair : ${pair} | Interval : ${interval} | Price : ${await getLastPrice(pair)} | Signal : ${await getIndicator(pair,interval)}`)
        }, 1000)
    }

    // If the argv word is Log
    if (firstArgv == 'log') {
        const pair = getValueFromArgv("--pair", process.argv) as string // We get the pair as a string, such as "BTCUSDT"
        const interval = getValueFromArgv("--interval", process.argv) as string || "1m" // We get the TradingView's signal interval to use ("1m", "4h", "1w"...)
        const delay = Number(getValueFromArgv("--delay", process.argv)) || 10 // We get the given int for the delay (set at 10 seconds by default) between each fetch

        // If the given pair doesn't fit the requirements (not correctly written), we show an error notifying the user and stop the execution
        if (!isValidInterval(interval)) {
            console.error("The given interval is not valid")
            return
        }

        // We log the pair, the chosen interval, the latest price from Binance, and the given signal by TradingView
        if (!await isPairValid(pair)) {
            console.error("The given pair is not valid")
            return
        }

        // We create the file and write the data in it
        await logJsonTable(pair, interval, delay)
    }
    
})()