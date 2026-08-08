import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeToSupabaseRefresh } from '../lib/refreshEvents'
import { updateCurrentUserPassword } from '../services/authService'
import { getLastSuccessfulLoadTimestamp } from '../services/supabaseService'

interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  const [lastUpdated, setLastUpdated] = useState('Sin datos')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  const { user, signOut, role } = useAuth()

  useEffect(() => {
    let isMounted = true

    const loadLastUpdated = async () => {
      try {
        const timestamp = await getLastSuccessfulLoadTimestamp()

        if (!isMounted) {
          return
        }

        setLastUpdated(timestamp ? new Date(timestamp).toLocaleString('es-ES') : 'Sin datos')
      } catch {
        if (!isMounted) {
          return
        }

        setLastUpdated('Sin datos')
      }
    }

    void loadLastUpdated()

    const unsubscribe = subscribeToSupabaseRefresh(() => {
      void loadLastUpdated()
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (!menuContainerRef.current?.contains(target)) {
        setIsMenuOpen(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isMenuOpen])

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setPasswordMessage('')
    setIsUpdatingPassword(false)
  }

  const openPasswordModal = () => {
    setIsMenuOpen(false)
    setPasswordError('')
    setPasswordMessage('')
    setNewPassword('')
    setConfirmPassword('')
    setIsPasswordModalOpen(true)
  }

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (!newPassword || !confirmPassword) {
      setPasswordError('Completa ambos campos.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setIsUpdatingPassword(true)
    const { error } = await updateCurrentUserPassword(newPassword)

    if (error) {
      setPasswordError(error.message || 'No se pudo actualizar la contraseña.')
      setIsUpdatingPassword(false)
      return
    }

    setPasswordMessage('Contraseña actualizada correctamente.')
    setNewPassword('')
    setConfirmPassword('')
    setIsUpdatingPassword(false)
  }

  const handleSignOut = async () => {
    setIsMenuOpen(false)
    await signOut()
  }

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
        <div className="page-header__user-menu" ref={menuContainerRef}>
          <button
            type="button"
            className="page-header__user"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <span>{user?.email ?? 'Usuario'}</span>
            <span className="page-header__role">{role === 'admin' ? 'Administrador' : 'Usuario'}</span>
          </button>

          {isMenuOpen && (
            <div className="page-header__menu" role="menu" aria-label="Opciones de cuenta">
              <button
                type="button"
                className="page-header__menu-item"
                role="menuitem"
                onClick={openPasswordModal}
              >
                Cambiar contraseña
              </button>
              <button
                type="button"
                className="page-header__menu-item"
                role="menuitem"
                onClick={() => void handleSignOut()}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="page-header__avatar"
          aria-label="Abrir menú de usuario"
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          {user?.email?.charAt(0).toUpperCase() ?? 'U'}
        </button>
      </div>

      {isPasswordModalOpen && (
        <div className="page-header__modal-backdrop" role="presentation" onClick={closePasswordModal}>
          <div
            className="page-header__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="change-password-title">Cambiar contraseña</h2>
            <form className="page-header__modal-form" onSubmit={(event) => void handlePasswordSubmit(event)}>
              <label className="page-header__modal-field">
                <span>Nueva contraseña</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="page-header__modal-field">
                <span>Confirmar contraseña</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              {passwordError && <p className="page-header__modal-error">{passwordError}</p>}
              {passwordMessage && <p className="page-header__modal-success">{passwordMessage}</p>}

              <div className="page-header__modal-actions">
                <button type="button" className="operational-page__reset operational-page__reset--compact" onClick={closePasswordModal}>
                  Cancelar
                </button>
                <button type="submit" className="operational-page__reset operational-page__reset--compact" disabled={isUpdatingPassword}>
                  {isUpdatingPassword ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
