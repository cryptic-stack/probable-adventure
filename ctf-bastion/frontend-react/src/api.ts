const API_BASE = '/api'

export async function apiHealth(): Promise<string> {
  const res = await fetch(`${API_BASE}/health`)
  const data = await res.json()
  return `${data.status}:${data.service}`
}

export async function register(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) {
    const body = await res.json()
    throw new Error(body.error ?? 'register failed')
  }
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error ?? 'login failed')
  }
  return body.accessToken as string
}
