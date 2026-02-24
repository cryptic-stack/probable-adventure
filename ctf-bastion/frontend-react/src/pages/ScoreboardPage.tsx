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
    <main className="panel">
      <h2 className="title">Scoreboard</h2>
      <p className="subtle">Status: {status}</p>
      <button onClick={refresh} style={{ marginBottom: 12 }}>
        Refresh
      </button>
      {rows.length === 0 ? (
        <p className="subtle">No solves yet.</p>
      ) : (
        rows.map((row) => (
          <p key={`${row.rank}-${row.email}`} className="subtle">
            #{row.rank} {row.email} | score {row.score} | solves {row.solves} | last solve{' '}
            {new Date(row.lastSolveAt).toLocaleString()}
          </p>
        ))
      )}
    </main>
  )
}
