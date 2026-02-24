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
    <main className="panel">
      <h2 className="title">Login</h2>
      <form onSubmit={onSubmit} className="form-grid">
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Login</button>
      </form>
      <p className={message.includes('successful') ? 'ok' : 'err'}>{message}</p>
    </main>
  )
}
