import { useEffect, useState } from 'react'
import { getScoreboard, ScoreboardEntry } from '../api'

export function ScoreboardPage() {
  const [rows, setRows] = useState<ScoreboardEntry[]>([])
  const [status, setStatus] = useState('loading')

  async function refresh() {
    try {
      const board = await getScoreboard()
      setRows(board)
      setStatus('ok')
    } catch (err) {
      setStatus((err as Error).message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <section className="panel">
      <h2 className="title">Scoreboard</h2>
      <p className="subtle">Status: {status}</p>
      <button className="secondary" onClick={refresh} style={{ marginBottom: 12 }}>
        Refresh
      </button>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
              <th>Solves</th>
              <th>Last Solve</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.rank}-${row.email}`}>
                <td>{row.rank}</td>
                <td>{row.email}</td>
                <td>{row.score}</td>
                <td>{row.solves}</td>
                <td>{new Date(row.lastSolveAt).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="subtle">
                  No solves yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
