import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'

type Props = {
  token: string
  wsPath: string
  modeLabel: string
}

export function TerminalPanel({ token, wsPath, modeLabel }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const inputDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const [status, setStatus] = useState('disconnected')

  useEffect(() => {
    if (!hostRef.current) {
      return
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'bar',
      convertEol: true,
      theme: {
        background: '#101216',
        foreground: '#d3d7de',
        cursor: '#7cff8a',
        cursorAccent: '#101216'
      }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(hostRef.current)
    fitAddon.fit()
    term.writeln('terminal ready')
    term.focus()

    const onResize = () => fitAddon.fit()
    window.addEventListener('resize', onResize)

    termRef.current = term

    return () => {
      window.removeEventListener('resize', onResize)
      inputDisposableRef.current?.dispose()
      wsRef.current?.close()
      term.dispose()
    }
  }, [])

  function connect() {
    if (!token) {
      termRef.current?.writeln('missing auth token; login first')
      return
    }

    wsRef.current?.close()

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const separator = wsPath.includes('?') ? '&' : '?'
    const url = `${proto}://${window.location.host}${wsPath}${separator}token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      termRef.current?.writeln('connected to broker')
      termRef.current?.focus()

      inputDisposableRef.current?.dispose()
      inputDisposableRef.current = termRef.current?.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      }) || null
    }

    ws.onmessage = (event) => {
      termRef.current?.write(String(event.data))
    }

    ws.onclose = () => {
      setStatus('disconnected')
      inputDisposableRef.current?.dispose()
      inputDisposableRef.current = null
      termRef.current?.writeln('connection closed')
    }

    ws.onerror = () => {
      setStatus('error')
      termRef.current?.writeln('connection error')
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={connect}>Connect {modeLabel}</button>
        <span className={status === 'connected' ? 'ok' : 'subtle'}>status: {status}</span>
        <span className="subtle">cursor: green bar (click terminal if typing is not captured)</span>
      </div>
      <div className="terminal-wrap">
        <div ref={hostRef} className="terminal-host" onClick={() => termRef.current?.focus()} />
      </div>
    </section>
  )
}
