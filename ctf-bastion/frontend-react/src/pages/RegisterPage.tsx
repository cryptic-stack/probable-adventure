import { FormEvent, useState } from 'react'
import { register } from '../api'

export function RegisterPage() {
  const [email, setEmail] = useState('player@example.com')
  const [password, setPassword] = useState('playerpass')
  const [message, setMessage] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await register(email, password)
      setMessage('registration successful')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <section className="auth-wrap panel">
      <h2 className="title">Create Account</h2>
      <p className="subtle">Register a player account for this CTF event.</p>
      <form onSubmit={onSubmit} className="form-grid">
        <label htmlFor="register-email">Email</label>
        <input id="register-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Register</button>
      </form>
      <p className={message.includes('successful') ? 'ok' : 'err'}>{message}</p>
    </section>
  )
}
