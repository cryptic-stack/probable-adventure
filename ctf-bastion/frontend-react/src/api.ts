const API_BASE = '/api'

export type ConnectionOption = {
  type: 'ssh' | 'rdp'
  label: string
  wsPath: string
}

export type ChallengeSessionResponse = {
  challengeId: number
  containerId: string
  expiresAt: string
  options: ConnectionOption[]
}

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

export async function startChallenge(challengeId: number, token: string): Promise<ChallengeSessionResponse> {
  const res = await fetch(`${API_BASE}/challenges/${challengeId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error ?? 'challenge start failed')
  }
  return body as ChallengeSessionResponse
}

export async function getConnectionOptions(challengeId: number, token: string): Promise<ChallengeSessionResponse> {
  const res = await fetch(`${API_BASE}/challenges/${challengeId}/connection-options`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error ?? 'connection options unavailable')
  }
  return body as ChallengeSessionResponse
}
