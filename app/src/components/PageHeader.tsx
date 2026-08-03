import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeToSupabaseRefresh } from '../lib/refreshEvents'

interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  const [lastUpdated, setLastUpdated] = useState('Sin datos')
  const { user, signOut, role } = useAuth()

  useEffect(() => {
    const unsubscribe = subscribeToSupabaseRefresh(() => {
      setLastUpdated(new Date().toLocaleString('es-ES'))
    })

    return unsubscribe
  }, [])

  return (
    <header className="page-header">
      <div className="page-header__title-block">
        <p className="page-header__eyebrow">CARVIMSA</p>
        <h1>{title}</h1>
      </div>

      <div className="page-header__actions">
        <div className="page-header__meta">
          <span className="page-header__label">Última actualización:</span>
          <span className="page-header__value">{lastUpdated}</span>
        </div>
        <div className="page-header__user">
          <span>{user?.email ?? 'Usuario'}</span>
          <span className="page-header__role">{role === 'admin' ? 'Administrador' : 'Usuario'}</span>
        </div>
        <button type="button" className="page-header__avatar" aria-label="Cerrar sesión" onClick={() => void signOut()}>
          {user?.email?.charAt(0).toUpperCase() ?? 'U'}
        </button>
      </div>
    </header>
  )
}
