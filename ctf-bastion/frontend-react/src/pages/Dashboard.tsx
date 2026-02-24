import { useEffect, useState } from 'react'
import { ChallengeInfo, getScoreboard, listChallenges, ScoreboardEntry } from '../api'
import { useAuthStore } from '../store/auth'

export function Dashboard() {
  const token = useAuthStore((s) => s.token)
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([])
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    async function load() {
      try {
        const [catalog, board] = await Promise.all([listChallenges(token || undefined), getScoreboard()])
        setChallenges(catalog)
        setScoreboard(board)
        setStatus('online')
      } catch {
        setStatus('degraded')
      }
    }
    load()
  }, [token])

  const totalSolves = challenges.reduce((acc, item) => acc + item.solves, 0)
  const solvedByMe = challenges.filter((item) => item.solvedByMe).length

  return (
    <div className="page-stack">
      <section className="panel">
        <h1 className="title">CTF Dashboard</h1>
        <p className="subtle">Platform status: {status}</p>
        <div className="grid-3">
          <article className="stat-card">
            <div className="stat-title">Challenges</div>
            <div className="stat-value">{challenges.length}</div>
          </article>
          <article className="stat-card">
            <div className="stat-title">My Solves</div>
            <div className="stat-value">{solvedByMe}</div>
          </article>
          <article className="stat-card">
            <div className="stat-title">Global Solves</div>
            <div className="stat-value">{totalSolves}</div>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2 className="title">Top Teams</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Solves</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.slice(0, 8).map((row) => (
                <tr key={`${row.rank}-${row.email}`}>
                  <td>{row.rank}</td>
                  <td>{row.email}</td>
                  <td>{row.score}</td>
                  <td>{row.solves}</td>
                </tr>
              ))}
              {scoreboard.length === 0 ? (
                <tr>
                  <td colSpan={4} className="subtle">
                    No solves yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
