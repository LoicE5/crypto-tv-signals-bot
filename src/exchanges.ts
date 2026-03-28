import ccxt, { Exchange } from "ccxt"

const defaultExchange = new ccxt.binance()

/**
 * Creates an authenticated CCXT exchange instance configured for futures/derivatives.
 * @param exchangeId  CCXT exchange id, e.g. 'binance' | 'bybit' | 'okx'
 * @param marketType  Market type, e.g. 'future' (Binance USDM) | 'linear' (Bybit) | 'swap' (OKX)
 * @param apiKey      Exchange API key
 * @param apiSecret   Exchange API secret
 */
export function createFuturesExchange(
    exchangeId: string,
    marketType: string,
    apiKey: string,
    apiSecret: string
): Exchange {
    const ExchangeClass = (ccxt as unknown as Record<string, new (config: object) => Exchange>)[exchangeId]
    if (!ExchangeClass) throw new Error(`Unknown CCXT exchange: "${exchangeId}"`)
    return new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
        options: { defaultType: marketType }
    })
}

export {
    defaultExchange
}
