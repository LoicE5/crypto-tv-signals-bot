import ccxt from "ccxt"

const b = new ccxt.binance()
const binance = b

const defaultExchange = new ccxt.binance();

export {
    b,
    binance,
    defaultExchange
}