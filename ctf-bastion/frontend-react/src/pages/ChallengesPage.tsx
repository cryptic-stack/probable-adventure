import { useEffect, useState } from 'react'
import { apiHealth, ConnectionOption, getConnectionOptions, startChallenge } from '../api'
import { useAuthStore } from '../store/auth'
import { TerminalPanel } from './TerminalPanel'

export function ChallengesPage() {
  const [health, setHealth] = useState('loading')
  const [challengeId, setChallengeId] = useState(1)
  const [containerId, setContainerId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [options, setOptions] = useState<ConnectionOption[]>([])
  const [selected, setSelected] = useState<ConnectionOption | null>(null)
  const [message, setMessage] = useState('')
  const token = useAuthStore((s) => s.token)
  const email = useAuthStore((s) => s.email)

  useEffect(() => {
    apiHealth().then(setHealth).catch(() => setHealth('api unavailable'))
  }, [])

  async function onStart() {
    if (!token) {
      setMessage('login required before starting a challenge')
      return
    }

    try {
      const session = await startChallenge(challengeId, token)
      setContainerId(session.containerId)
      setExpiresAt(session.expiresAt)
      setOptions(session.options)
      setSelected(session.options[0] ?? null)
      setMessage('challenge started')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  async function onRefreshOptions() {
    if (!token) {
      setMessage('login required')
      return
    }

    try {
      const session = await getConnectionOptions(challengeId, token)
      setContainerId(session.containerId)
      setExpiresAt(session.expiresAt)
      setOptions(session.options)
      setSelected(session.options[0] ?? null)
      setMessage('connection options refreshed')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <main className="panel">
      <h2 className="title">Challenge Terminal</h2>
      <p className="subtle">API health: {health}</p>
      <p className="subtle">Active user: {email || 'not logged in'}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="subtle">Challenge ID</span>
        <input
          type="number"
          value={challengeId}
          onChange={(e) => setChallengeId(Number(e.target.value))}
          style={{ width: 100 }}
        />
        <button onClick={onStart}>Start Challenge</button>
        <button onClick={onRefreshOptions}>Refresh Connections</button>
      </div>
      <p className="subtle">{message}</p>
      {containerId ? <p className="subtle">Assigned container: {containerId}</p> : null}
      {expiresAt ? <p className="subtle">Expires: {new Date(expiresAt).toLocaleString()}</p> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {options.map((opt) => (
          <button key={opt.type} onClick={() => setSelected(opt)}>
            {opt.label}
          </button>
        ))}
      </div>
      {selected ? (
        <TerminalPanel token={token} wsPath={selected.wsPath} modeLabel={selected.label} />
      ) : (
        <p className="subtle">Start challenge to get SSH/RDP connection options.</p>
      )}
    </main>
  )
}
