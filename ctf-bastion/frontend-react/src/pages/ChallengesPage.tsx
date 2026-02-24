import { useEffect, useState } from 'react'
import {
  apiHealth,
  ChallengeInfo,
  ConnectionOption,
  getConnectionOptions,
  listChallenges,
  startChallenge,
  submitFlag
} from '../api'
import { useAuthStore } from '../store/auth'
import { TerminalPanel } from './TerminalPanel'

export function ChallengesPage() {
  const [health, setHealth] = useState('loading')
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([])
  const [challengeId, setChallengeId] = useState(1)
  const [containerId, setContainerId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [options, setOptions] = useState<ConnectionOption[]>([])
  const [selected, setSelected] = useState<ConnectionOption | null>(null)
  const [message, setMessage] = useState('')
  const [flag, setFlag] = useState('flag{ctf_demo_01}')
  const [submitMessage, setSubmitMessage] = useState('')
  const [score, setScore] = useState(0)
  const token = useAuthStore((s) => s.token)
  const email = useAuthStore((s) => s.email)

  useEffect(() => {
    apiHealth().then(setHealth).catch(() => setHealth('api unavailable'))
  }, [])

  async function refreshChallenges() {
    try {
      const list = await listChallenges(token || undefined)
      setChallenges(list)
      if (!list.some((item) => item.id === challengeId) && list[0]) {
        setChallengeId(list[0].id)
      }
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  useEffect(() => {
    refreshChallenges()
  }, [token])

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

  async function onSubmitFlag() {
    if (!token) {
      setSubmitMessage('login required')
      return
    }

    try {
      const result = await submitFlag(challengeId, token, flag)
      setScore(result.totalScore)
      const attemptsSuffix =
        result.attemptsRemaining === null ? '' : ` | attempts left: ${result.attemptsRemaining}`
      const pointsSuffix = result.awardedPoints ? ` | +${result.awardedPoints} pts` : ''
      setSubmitMessage(`${result.message}${pointsSuffix}${attemptsSuffix}`)
      await refreshChallenges()
    } catch (err) {
      setSubmitMessage((err as Error).message)
    }
  }

  return (
    <main className="panel">
      <h2 className="title">Challenge Terminal</h2>
      <p className="subtle">API health: {health}</p>
      <p className="subtle">Active user: {email || 'not logged in'}</p>
      <p className="subtle">My score: {score}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="subtle">Challenge</span>
        <select value={challengeId} onChange={(e) => setChallengeId(Number(e.target.value))}>
          {challenges.map((challenge) => (
            <option key={challenge.id} value={challenge.id}>
              #{challenge.id} {challenge.name} ({challenge.value} pts)
            </option>
          ))}
        </select>
        <button onClick={onStart}>Start Challenge</button>
        <button onClick={onRefreshOptions}>Refresh Connections</button>
        <button onClick={refreshChallenges}>Refresh Catalog</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        {challenges.map((challenge) => (
          <p key={challenge.id} className="subtle">
            [{challenge.category}] #{challenge.id} {challenge.name} | {challenge.value} pts | solves {challenge.solves} |
            attempts {challenge.maxAttempts} {challenge.solvedByMe ? '| solved' : ''}
          </p>
        ))}
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={flag} onChange={(e) => setFlag(e.target.value)} style={{ minWidth: 260 }} />
        <button onClick={onSubmitFlag}>Submit Flag</button>
      </div>
      <p className={submitMessage.includes('correct') ? 'ok' : 'subtle'}>{submitMessage}</p>
      {selected ? (
        <TerminalPanel token={token} wsPath={selected.wsPath} modeLabel={selected.label} />
      ) : (
        <p className="subtle">Start challenge to get SSH/RDP connection options.</p>
      )}
    </main>
  )
}
