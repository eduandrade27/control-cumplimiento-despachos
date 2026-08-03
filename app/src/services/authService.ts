import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AppRole = 'admin' | 'user'

export interface AuthSessionState {
  session: Session | null
  user: User | null
  role: AppRole
}

export async function signInWithEmailPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOutSession() {
  return supabase.auth.signOut()
}

export async function getCurrentSession() {
  return supabase.auth.getSession()
}

export function getUserRole(user: User | null | undefined): AppRole {
  const role = user?.app_metadata?.role

  return role === 'admin' ? 'admin' : 'user'
}
