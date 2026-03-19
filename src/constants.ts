export const validIntervals = new Set(['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M'])

// Typical spot taker fee per exchange (decimal — e.g. 0.001 = 0.1%)
export const EXCHANGE_FEES: Record<string, number> = {
    binance: 0.001,
    bybit: 0.001,
    okx: 0.001,
    kraken: 0.0026,
    coinbase: 0.004,
    kucoin: 0.001,
    bitfinex: 0.002
}
