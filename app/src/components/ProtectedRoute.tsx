import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  requireAdmin?: boolean
  children?: ReactNode
}

export function ProtectedRoute({ requireAdmin = false, children }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/operativo" replace />
  }

  return children ? <>{children}</> : <Outlet />
}
