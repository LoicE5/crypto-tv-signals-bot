'use client'

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface XTerminalProps {
    streamUrl: string
}

export default function XTerminal({ streamUrl }: XTerminalProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!containerRef.current) return

        const terminal = new Terminal({
            disableStdin: true,
            cursorBlink: false,
            convertEol: true,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#c9d1d9'
            }
        })

        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(containerRef.current)
        fitAddon.fit()

        terminal.writeln('\x1b[90mConnecting to log stream…\x1b[0m')

        const es = new EventSource(streamUrl)
        es.onopen = () => terminal.writeln('\x1b[32mConnected\x1b[0m')
        es.onerror = () => terminal.writeln('\x1b[31mConnection lost — retrying…\x1b[0m')
        es.onmessage = (event) => {
            const { line } = JSON.parse(event.data as string) as { line: string }
            terminal.writeln(line)
        }

        const observer = new ResizeObserver(() => fitAddon.fit())
        observer.observe(containerRef.current)

        return () => {
            es.close()
            observer.disconnect()
            terminal.dispose()
        }
    }, [streamUrl])

    return <div ref={containerRef} style={{ width: '100%', height: '260px' }} />
}
