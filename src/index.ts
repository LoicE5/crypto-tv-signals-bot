import { getLastPrice, getIndicator, logJsonTable } from './functions'

(async () => {

    await logJsonTable("ETHUSDT","1m",1)

    // const coin = "ETH"

    // setInterval(async () => {
    //     console.log(`Coin : ${coin} | Signal : ${await getIndicator(`${coin}USDT`, "1m")} | Price : ${await getLastPrice(`${coin}USDT`)}`)

    // }, 1000)
    
})()