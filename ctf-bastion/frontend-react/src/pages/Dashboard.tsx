export function Dashboard() {
  return (
    <main className="panel">
      <h1 className="title">Phase 1 Platform Live</h1>
      <p className="subtle">
        Auth API, broker WebSocket sessions, and terminal client are running on the Vite frontend.
      </p>
      <p>
        <span className="badge">No SSH clients required</span>
        <span className="badge">JWT gated broker</span>
        <span className="badge">Ephemeral lab model</span>
      </p>
    </main>
  )
}
