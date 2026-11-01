import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from './auth-context'
import { disconnectSocket } from '../services/socket'
import { blockedOrganization, clearStoredSession, getCurrentSession, type SessionResponse } from '../services/api'
import { storeOrganizationNotice } from './organizationNotice'
import { ALL_GYMS, getActiveGymId, storeActiveGymId } from '../services/activeGym'
import { canUseDashboard, isStaffGym } from '../utils/access'

const SESSION_KEY = 'session'

function readSession(): SessionResponse | null {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as SessionResponse | null
    return session?.gyms ? session : null
  } catch {
    return null
  }
}

// Only owners of several gyms get the "all gyms" view; SIRID staff always pick a gym.
function canSeeAll(session: SessionResponse | null) {
  return Boolean(session && !session.user.isPlatformAdmin && session.gyms.length > 1
    && session.gyms.some((gym) => gym.roles.includes('Propietario')))
}

// SIRID staff start in their own panel (no gym) and only work in a gym they pick.
function resolveGymId(session: SessionResponse | null, gymId: string | null) {
  if (!session) return null
  if (gymId === ALL_GYMS && canSeeAll(session)) return ALL_GYMS
  if (gymId && session.gyms.some((gym) => gym.id === gymId)) return gymId
  if (session.user.isPlatformAdmin) return null
  if (canSeeAll(session)) return ALL_GYMS
  // The API's default gym can be one where the person is a client; then the first gym they work in.
  return session.gyms.some((gym) => gym.id === session.defaultGymId) ? session.defaultGymId : session.gyms[0]?.id ?? null
}

// Only the gyms the person works in reach the selector and the role checks.
function staffSession(session: SessionResponse): SessionResponse {
  return { ...session, gyms: session.gyms.filter(isStaffGym) }
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [session, setSession] = useState(readSession)
  // Stored right away so the first requests of the pages already carry the right gym.
  const [activeGymId, setActiveGym] = useState(() => {
    const gymId = resolveGymId(readSession(), getActiveGymId())
    storeActiveGymId(gymId)
    return gymId
  })

  const saveSession = useCallback((receivedSession: SessionResponse, preferredGymId: string | null) => {
    const nextSession = staffSession(receivedSession)
    const gymId = resolveGymId(nextSession, preferredGymId)
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
    storeActiveGymId(gymId)
    setSession(nextSession)
    setActiveGym(gymId)
  }, [])

  const signOut = useCallback(() => {
    disconnectSocket()
    clearStoredSession()
    setToken(null)
    setSession(null)
    setActiveGym(null)
  }, [])

  const applySession = useCallback((nextSession: SessionResponse) => {
    // Signed out while the request was on its way.
    if (!localStorage.getItem('token')) return
    if (!canUseDashboard(nextSession)) signOut()
    else saveSession(nextSession, getActiveGymId())
  }, [saveSession, signOut])

  // SIRID suspended the organization while the session was open: the login screen explains it.
  const handleSessionError = useCallback((error: unknown) => {
    const blocked = blockedOrganization(error)
    if (!blocked) return
    storeOrganizationNotice(blocked)
    signOut()
  }, [signOut])

  const loadSession = useCallback(
    () => getCurrentSession().then(applySession).catch(handleSessionError),
    [applySession, handleSessionError],
  )

  // Gyms and roles can change while a session is open, and older sessions have no gyms at all.
  useEffect(() => {
    if (!token) return
    getCurrentSession().then(applySession).catch(handleSessionError)
  }, [token, applySession, handleSessionError])

  const value = useMemo<AuthContextValue>(() => {
    const activeGym = session?.gyms.find((gym) => gym.id === activeGymId)
    const organizationId = activeGym?.organization.id ?? session?.organization?.id
    return {
      token,
      isAuthenticated: Boolean(token),
      session,
      activeGymId,
      isAllGyms: activeGymId === ALL_GYMS,
      isPlatformMode: Boolean(session?.user.isPlatformAdmin) && !activeGymId,
      canSeeAllGyms: canSeeAll(session),
      organizationGyms: session?.gyms.filter((gym) => gym.organization.id === organizationId) ?? [],
      setActiveGymId: (gymId) => {
        const nextGymId = resolveGymId(session, gymId)
        storeActiveGymId(nextGymId)
        setActiveGym(nextGymId)
      },
      signIn: (nextToken, nextSession) => {
        localStorage.setItem('token', nextToken)
        localStorage.setItem('userName', nextSession.user.nombre ?? nextSession.user.name ?? '')
        localStorage.setItem('userData', JSON.stringify(nextSession.user))
        saveSession(nextSession, null)
        setToken(nextToken)
      },
      signOut,
      refreshSession: loadSession,
    }
  }, [token, session, activeGymId, saveSession, signOut, loadSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
