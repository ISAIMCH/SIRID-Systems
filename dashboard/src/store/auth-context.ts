import { createContext } from 'react'
import type { AuthUser } from '../services/api'

export interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  signIn: (token: string, user?: AuthUser) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)