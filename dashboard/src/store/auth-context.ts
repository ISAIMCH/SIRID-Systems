import { createContext } from 'react'
import type { SessionGym, SessionResponse } from '../services/api'

export interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  session: SessionResponse | null
  // A gym id, or ALL_GYMS when an owner sees every gym.
  activeGymId: string | null
  isAllGyms: boolean
  // SIRID staff in their panel, not working in any gym: only the platform pages apply.
  isPlatformMode: boolean
  canSeeAllGyms: boolean
  // Gyms of the organization being worked in; forms pick from these in the all-gyms view.
  organizationGyms: SessionGym[]
  setActiveGymId: (gymId: string) => void
  signIn: (token: string, session: SessionResponse) => void
  signOut: () => void
  // Reloads gyms and roles, e.g. after opening a gym.
  refreshSession: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
