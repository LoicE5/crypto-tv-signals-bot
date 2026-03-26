'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import styles from './Dashboard.module.css'
import {
    fetchFiles,
    fetchIntervals,
    fetchPrice,
    analyzeFile,
    fetchSessionStatus,
    startSession,
    stopSession,
    checkHealth,
    LOGS_STREAM_URL,
    type AnalysisResult,
    type Session
} from '@/lib/api'

const XTerminal = dynamic(() => import('./XTerminal'), { ssr: false })

// ── Analyze section ────────────────────────────────────────────────────────────

function AnalyzeSection() {
    const [files, setFiles] = useState<string[]>([])
    const [selectedFile, setSelectedFile] = useState('')
    const [inverted, setInverted] = useState(false)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<AnalysisResult | null | undefined>(undefined)
    const [error, setError] = useState('')

    useEffect(() => {
        fetchFiles()
            .then(found => {
                setFiles(found)
                if(found.length > 0) setSelectedFile(found.at(0)!)
            })
            .catch((fetchError: unknown) => { console.warn('Could not load file list:', fetchError instanceof Error ? fetchError.message : fetchError); setError('Could not load file list') })
    }, [])

    async function handleAnalyze() {
        if(!selectedFile) return
        setLoading(true)
        setError('')
        setResult(undefined)
        try {
            const data = await analyzeFile(selectedFile, inverted)
            setResult(data)
        } catch(analyzeError: unknown) {
            setError(String(analyzeError))
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className={styles.card} aria-labelledby="analyze-heading">
            <h2 id="analyze-heading">Analyze</h2>

            {files.length === 0 ? (
                <p className={styles.errorMsg}>No .ndjson files found. Run the <code>write</code> command first.</p>
            ) : (
                <>
                    <div className={styles.field}>
                        <label htmlFor="file-select">File</label>
                        <select
                            id="file-select"
                            value={selectedFile}
                            onChange={event => setSelectedFile(event.target.value)}
                        >
                            {files.map(file => (
                                <option key={file} value={file}>{file}</option>
                            ))}
                        </select>
                    </div>

                    <label className={styles.checkbox}>
                        <input
                            type="checkbox"
                            checked={inverted}
                            onChange={event => setInverted(event.target.checked)}
                        />
                        Invert strategy (short on BUY, long on SELL)
                    </label>

                    <div className={styles.btnRow}>
                        <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={handleAnalyze}
                            disabled={loading}
                        >
                            {loading ? 'Analyzing…' : 'Analyze'}
                        </button>
                    </div>
                </>
            )}

            {error && <p className={styles.errorMsg}>{error}</p>}

            {result !== undefined && result !== null && (
                <div className={styles.result} aria-label="Analysis result">
                    <div className={styles.resultRow}>
                        <span className={styles.resultLabel}>Transactions</span>
                        <span className={styles.resultValue}>{result.profit_per_transaction.length}</span>
                    </div>
                    <div className={styles.resultRow}>
                        <span className={styles.resultLabel}>Sum</span>
                        <span className={styles.resultValue}>{result.sum.toFixed(4)}</span>
                    </div>
                    <div className={styles.resultRow}>
                        <span className={styles.resultLabel}>Variation</span>
                        <span className={styles.resultValue}>{result.var}</span>
                    </div>
                </div>
            )}

            {result === null && (
                <p className={styles.errorMsg}>No signal changes found — cannot compute profit.</p>
            )}
        </section>
    )
}

// ── Price check section ────────────────────────────────────────────────────────

function PriceSection() {
    const [pair, setPair] = useState('BTCUSDT')
    const [price, setPrice] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function handleCheck() {
        setLoading(true)
        setError('')
        setPrice(null)
        try {
            const value = await fetchPrice(pair.trim().toUpperCase())
            setPrice(value ?? null)
        } catch(priceError: unknown) {
            setError(String(priceError))
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className={styles.card} aria-labelledby="price-heading">
            <h2 id="price-heading">Price Check</h2>
            <div className={styles.field}>
                <label htmlFor="price-pair">Pair</label>
                <input
                    id="price-pair"
                    type="text"
                    value={pair}
                    onChange={event => setPair(event.target.value)}
                    placeholder="BTCUSDT"
                />
            </div>
            <div className={styles.btnRow}>
                <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={handleCheck}
                    disabled={loading || !pair.trim()}
                >
                    {loading ? 'Fetching…' : 'Check Price'}
                </button>
            </div>
            {error && <p className={styles.errorMsg}>{error}</p>}
            {price !== null && (
                <div className={styles.result} aria-label="Price result">
                    <div className={styles.resultRow}>
                        <span className={styles.resultLabel}>{pair.toUpperCase()}</span>
                        <span className={styles.resultValue}>${price.toLocaleString()}</span>
                    </div>
                </div>
            )}
        </section>
    )
}

// ── Session section ────────────────────────────────────────────────────────────

function SessionSection({ intervals }: { intervals: string[] }) {
    const [command, setCommand] = useState<'simulate' | 'write'>('simulate')
    const [pair, setPair] = useState('BTCUSDT')
    const [selectedInterval, setSelectedInterval] = useState('1m')
    const [delay, setDelay] = useState(10)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const refreshStatus = useCallback(async () => {
        try {
            const status = await fetchSessionStatus()
            setSession(status)
        } catch(fetchError: unknown) { console.warn('Session status unavailable:', fetchError instanceof Error ? fetchError.message : fetchError) }
    }, [])

    useEffect(() => {
        refreshStatus()
        const timer = setInterval(refreshStatus, 3000)
        return () => clearInterval(timer)
    }, [refreshStatus])

    async function handleStart() {
        setLoading(true)
        setError('')
        try {
            const started = await startSession(command, pair.trim().toUpperCase(), selectedInterval, delay)
            setSession(started)
        } catch(startError: unknown) {
            setError(String(startError))
        } finally {
            setLoading(false)
        }
    }

    async function handleStop() {
        setLoading(true)
        setError('')
        try {
            await stopSession()
            setSession(null)
        } catch(stopError: unknown) {
            setError(String(stopError))
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className={styles.card} aria-labelledby="session-heading">
            <h2 id="session-heading">Session</h2>

            <div className={styles.field}>
                <label htmlFor="session-command">Command</label>
                <select
                    id="session-command"
                    value={command}
                    onChange={event => setCommand(event.target.value as 'simulate' | 'write')}
                    disabled={session !== null}
                >
                    <option value="simulate">simulate — print live price + signal</option>
                    <option value="write">write — record to .ndjson file</option>
                </select>
            </div>

            <div className={styles.row}>
                <div className={styles.field}>
                    <label htmlFor="session-pair">Pair</label>
                    <input
                        id="session-pair"
                        type="text"
                        value={pair}
                        onChange={event => setPair(event.target.value)}
                        placeholder="BTCUSDT"
                        disabled={session !== null}
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="session-interval">Interval</label>
                    <select
                        id="session-interval"
                        value={selectedInterval}
                        onChange={event => setSelectedInterval(event.target.value)}
                        disabled={session !== null}
                    >
                        {intervals.map(value => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </div>
                {command === 'write' && (
                    <div className={styles.field}>
                        <label htmlFor="session-delay">Delay (s)</label>
                        <input
                            id="session-delay"
                            type="number"
                            min={1}
                            value={delay}
                            onChange={event => setDelay(Number(event.target.value))}
                            disabled={session !== null}
                        />
                    </div>
                )}
            </div>

            <div className={styles.btnRow}>
                {session === null ? (
                    <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={handleStart}
                        disabled={loading || !pair.trim()}
                    >
                        {loading ? 'Starting…' : 'Start'}
                    </button>
                ) : (
                    <button
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={handleStop}
                        disabled={loading}
                    >
                        {loading ? 'Stopping…' : 'Stop'}
                    </button>
                )}
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <div className={styles.result}>
                <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>Status</span>
                    <span>
                        {session !== null ? (
                            <span className={`${styles.statusBadge} ${styles.statusRunning}`}>
                                <span className={styles.dot} />
                                running — {session.command} {session.pair} @ {session.interval}
                            </span>
                        ) : (
                            <span className={`${styles.statusBadge} ${styles.statusIdle}`}>idle</span>
                        )}
                    </span>
                </div>
            </div>
        </section>
    )
}

// ── Live logs section ──────────────────────────────────────────────────────────

function LogSection() {
    return (
        <section className={styles.card} aria-labelledby="log-heading">
            <h2 id="log-heading">Live Logs</h2>
            <div className={styles.terminalWrap}>
                <XTerminal streamUrl={LOGS_STREAM_URL} />
            </div>
        </section>
    )
}

// ── Dashboard root ─────────────────────────────────────────────────────────────

export default function Dashboard() {
    const [intervals, setIntervals] = useState<string[]>([])

    useEffect(() => {
        checkHealth().then(({ url, status, ok }) => {
            if (!ok)
                alert(`Server is not available at the moment. URL ${url} returned an error code ${status}`)
        })
        fetchIntervals().then(setIntervals).catch(fetchError => console.warn('Could not fetch intervals:', fetchError instanceof Error ? fetchError.message : fetchError))
    }, [])

    return (
        <main className={styles.dashboard}>
            <header className={styles.header}>
                <h1 className={styles.title}>Crypto TV Signals Bot</h1>
                <span className={styles.badge}>alpha</span>
            </header>

            <SessionSection intervals={intervals} />
            <LogSection />
            <AnalyzeSection />
            <PriceSection />
        </main>
    )
}
