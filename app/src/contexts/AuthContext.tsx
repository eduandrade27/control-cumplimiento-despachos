import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getCurrentSession, getUserRole, type AppRole, signOutSession } from '../services/authService'

interface AuthContextValue {
  session: Session | null
  user: User | null
  role: AppRole
  isAuthenticated: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AppRole>('user')

  const refreshSession = async () => {
    const { data } = await getCurrentSession()
    setSession(data.session)
    setUser(data.session?.user ?? null)
    setRole(getUserRole(data.session?.user ?? null))
  }

  useEffect(() => {
    void refreshSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setRole(getUserRole(nextSession?.user ?? null))
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await signOutSession()
    await refreshSession()
  }

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    role,
    isAuthenticated: Boolean(session),
    isAdmin: role === 'admin',
    signOut,
    refreshSession,
  }), [role, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
