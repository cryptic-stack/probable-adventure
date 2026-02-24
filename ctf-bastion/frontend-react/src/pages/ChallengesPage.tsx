import { useEffect, useState } from 'react'
import { apiHealth } from '../api'
import { useAuthStore } from '../store/auth'
import { TerminalPanel } from './TerminalPanel'

export function ChallengesPage() {
  const [health, setHealth] = useState('loading')
  const token = useAuthStore((s) => s.token)
  const email = useAuthStore((s) => s.email)

  useEffect(() => {
    apiHealth().then(setHealth).catch(() => setHealth('api unavailable'))
  }, [])

  return (
    <main className="panel">
      <h2 className="title">Challenge Terminal</h2>
      <p className="subtle">API health: {health}</p>
      <p className="subtle">Active user: {email || 'not logged in'}</p>
      <TerminalPanel token={token} />
    </main>
  )
}
