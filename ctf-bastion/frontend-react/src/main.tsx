import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ChallengesPage } from './pages/ChallengesPage'
import { ScoreboardPage } from './pages/ScoreboardPage'
import { useAuthStore } from './store/auth'
import './styles.css'

function Shell() {
  const email = useAuthStore((s) => s.email)
  const clear = useAuthStore((s) => s.clear)
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <div className="brand">CTF Bastion</div>
          <nav className="nav">
            <NavLink to="/dashboard">Home</NavLink>
            <NavLink to="/challenges">Challenges</NavLink>
            <NavLink to="/scoreboard">Scoreboard</NavLink>
            {!email ? <NavLink to="/login">Login</NavLink> : null}
            {!email ? <NavLink to="/register">Register</NavLink> : null}
          </nav>
          <div className="row">
            <span className="user-chip">{email || 'Guest'}</span>
            {email ? (
              <button className="secondary" onClick={clear}>
                Logout
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/scoreboard" element={<ScoreboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
