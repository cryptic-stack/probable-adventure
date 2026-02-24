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
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">CTF Bastion</div>
        <nav className="nav">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/login">Login</NavLink>
          <NavLink to="/register">Register</NavLink>
          <NavLink to="/challenges">Challenges</NavLink>
          <NavLink to="/scoreboard">Scoreboard</NavLink>
        </nav>
        <div className="subtle">{email || 'guest'}</div>
      </header>
      <Outlet />
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
