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
    <main className="panel">
      <h2 className="title">Register</h2>
      <form onSubmit={onSubmit} className="form-grid">
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Register</button>
      </form>
      <p className={message.includes('successful') ? 'ok' : 'err'}>{message}</p>
    </main>
  )
}
