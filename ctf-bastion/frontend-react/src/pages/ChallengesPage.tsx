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
  const selectedChallenge = challenges.find((item) => item.id === challengeId)

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
    <div className="page-stack">
      <section className="panel">
        <h2 className="title">Challenges</h2>
        <p className="subtle">
          API: {health} | Player: {email || 'Guest'} | Score: {score}
        </p>
      </section>

      <section className="challenge-layout">
        <article className="panel">
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="secondary" onClick={refreshChallenges}>
              Refresh
            </button>
          </div>
          <div className="challenge-cards">
            {challenges.map((challenge) => (
              <button
                key={challenge.id}
                className={`challenge-card ${challenge.id === challengeId ? 'active' : ''}`}
                onClick={() => setChallengeId(challenge.id)}
              >
                <div className="challenge-card-title">#{challenge.id} {challenge.name}</div>
                <div className="challenge-card-meta">
                  <span className="chip">{challenge.category}</span>
                  <span>{challenge.value} pts</span>
                  <span>{challenge.solves} solves</span>
                  <span>{challenge.solvedByMe ? 'Solved' : 'Open'}</span>
                </div>
              </button>
            ))}
            {challenges.length === 0 ? <p className="subtle">No challenges available.</p> : null}
          </div>
        </article>

        <article className="panel">
          <h3 style={{ marginTop: 0 }}>
            {selectedChallenge ? `${selectedChallenge.name} (${selectedChallenge.value} pts)` : 'Select a challenge'}
          </h3>
          <p className="subtle">
            {selectedChallenge?.description || 'Choose a challenge from the list.'}
          </p>
          <p className="subtle">
            Attempts limit: {selectedChallenge?.maxAttempts ?? '-'} | Solves: {selectedChallenge?.solves ?? '-'}
          </p>
          <div className="row" style={{ marginBottom: 10 }}>
            <button onClick={onStart}>Start Challenge</button>
            <button className="secondary" onClick={onRefreshOptions}>Refresh Connections</button>
          </div>
          <p className="subtle">{message}</p>
          {containerId ? <p className="subtle">Container: {containerId}</p> : null}
          {expiresAt ? <p className="subtle">Expires: {new Date(expiresAt).toLocaleString()}</p> : null}
          <div className="row" style={{ marginBottom: 10 }}>
            {options.map((opt) => (
              <button
                key={opt.type}
                className={selected?.type === opt.type ? '' : 'secondary'}
                onClick={() => setSelected(opt)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="row">
            <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="flag{...}" />
            <button onClick={onSubmitFlag}>Submit</button>
          </div>
          <p className={submitMessage.includes('correct') ? 'ok' : 'subtle'}>{submitMessage}</p>
        </article>
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Session Terminal</h3>
        {selected ? (
          <TerminalPanel token={token} wsPath={selected.wsPath} modeLabel={selected.label} />
        ) : (
          <p className="subtle">Start a challenge and pick a connection mode to open terminal access.</p>
        )}
      </section>
    </div>
  )
}
