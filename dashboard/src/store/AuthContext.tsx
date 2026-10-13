import { useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from './auth-context'

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      signIn: (nextToken, user) => {
        localStorage.setItem('token', nextToken)
        if (user) {
          localStorage.setItem('userName', user.nombre)
          localStorage.setItem('userData', JSON.stringify(user))
        }
        setToken(nextToken)
      },
      signOut: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('userName')
        localStorage.removeItem('userData')
        setToken(null)
      },
    }),
    [token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider