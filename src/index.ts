import { getLastPrice, getIndicator } from './functions'

(async () => {

    const coin = "ETH"

    setInterval(async () => {
        console.log(`Coin : ${coin} | Signal : ${await getIndicator(`${coin}USDT`, "1m")} | Price : ${await getLastPrice(`${coin}USDT`)}`)
    }, 1000)
    
})()