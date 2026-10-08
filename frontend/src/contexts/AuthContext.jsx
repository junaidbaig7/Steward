import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '../services/api/authApi'
import { TOKEN_KEY } from '../services/api/client'

const USER_KEY = 'steward.user'
const AuthContext = createContext(null)

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (localStorage.getItem(TOKEN_KEY) ? readStoredUser() : null))
  const [checking, setChecking] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  /** Called with the TokenResponse returned by any login endpoint. */
  const login = useCallback(({ access_token, user: profile }) => {
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
    setUser(profile)
  }, [])

  const updateUser = useCallback((profile) => {
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
    setUser(profile)
  }, [])

  // Validate a stored token once on load (it may have expired).
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    authApi
      .me()
      .then(updateUser)
      .catch((e) => e.status === 401 && logout())
      .finally(() => setChecking(false))
  }, [logout, updateUser])

  // Any 401 from the API (expired session) signs the user out.
  useEffect(() => {
    window.addEventListener('steward:unauthorized', logout)
    return () => window.removeEventListener('steward:unauthorized', logout)
  }, [logout])

  const value = useMemo(
    () => ({ user, checking, isAdmin: user?.role === 'ADMIN', isCustomer: user?.role === 'USER', login, logout, updateUser }),
    [user, checking, login, logout, updateUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
