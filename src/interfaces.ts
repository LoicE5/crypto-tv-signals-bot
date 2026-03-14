export type SignalValue = 'BUY' | 'SELL' | 'NEUTRAL' | 'STRONG BUY' | 'STRONG SELL' | 'ERROR'

export interface TickerRow {
    pair: string
    interval: string
    unix_time: number
    price: number | undefined
    signal: SignalValue | undefined
}

export interface AnalysisResult {
    profit_per_transaction: number[]
    sum: number
    var: string
}
