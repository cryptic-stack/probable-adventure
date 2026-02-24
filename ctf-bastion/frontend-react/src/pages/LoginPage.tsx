import { FormEvent, useState } from 'react'
import { login } from '../api'
import { useAuthStore } from '../store/auth'

export function LoginPage() {
  const [email, setEmail] = useState('player@example.com')
  const [password, setPassword] = useState('playerpass')
  const [message, setMessage] = useState('')
  const setAuth = useAuthStore((s) => s.setAuth)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const token = await login(email, password)
      setAuth(email, token)
      setMessage('login successful')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <section className="auth-wrap panel">
      <h2 className="title">Sign In</h2>
      <p className="subtle">Use your player account to access challenges.</p>
      <form onSubmit={onSubmit} className="form-grid">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Login</button>
      </form>
      <p className={message.includes('successful') ? 'ok' : 'err'}>{message}</p>
    </section>
  )
}
