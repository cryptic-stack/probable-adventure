import { create } from 'zustand'

type AuthState = {
  email: string
  token: string
  setAuth: (email: string, token: string) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  email: '',
  token: '',
  setAuth: (email, token) => set({ email, token }),
  clear: () => set({ email: '', token: '' })
}))
