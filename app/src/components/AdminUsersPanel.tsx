import { useEffect, useMemo, useState } from 'react'
import {
  createManagedUser,
  deactivateManagedUser,
  deleteManagedUser,
  listManagedUsers,
  reactivateManagedUser,
  updateManagedUserRole,
  type ManagedUser,
  type ManagedUserRole,
} from '../services/adminUsersService'
import { useAuth } from '../contexts/AuthContext'

interface RoleDraftByUserId {
  [userId: string]: ManagedUserRole
}

const PRINCIPAL_ADMIN_EMAIL = 'eduardo.andrade@carvimsa.com'

function toRoleLabel(role: ManagedUserRole): string {
  return role === 'admin' ? 'Administrador' : 'Usuario'
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Sin datos'
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Sin datos' : parsed.toLocaleString('es-ES')
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function isPrincipalAdmin(user: ManagedUser): boolean {
  return normalizeEmail(user.email) === PRINCIPAL_ADMIN_EMAIL
}

export function AdminUsersPanel() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)
  const [pendingActionUserId, setPendingActionUserId] = useState<string | null>(null)
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<ManagedUserRole>('user')
  const [roleDraftByUserId, setRoleDraftByUserId] = useState<RoleDraftByUserId>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.email.localeCompare(b.email, 'es'))
  }, [users])

  const loadUsers = async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const nextUsers = await listManagedUsers()
      setUsers(nextUsers)
      setRoleDraftByUserId(Object.fromEntries(nextUsers.map((user) => [user.id, user.role])))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo obtener la lista de usuarios.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    if (!email.trim() || !temporaryPassword.trim()) {
      setErrorMessage('Completa correo y contraseña temporal.')
      return
    }

    setIsCreating(true)

    try {
      await createManagedUser({
        email: email.trim(),
        temporaryPassword: temporaryPassword.trim(),
        role: newUserRole,
      })

      setEmail('')
      setTemporaryPassword('')
      setNewUserRole('user')
      setSuccessMessage('Usuario creado correctamente.')
      await loadUsers()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo crear el usuario.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdateRole = async (user: ManagedUser) => {
    setErrorMessage('')
    setSuccessMessage('')

    const nextRole = roleDraftByUserId[user.id] ?? user.role
    if (nextRole === user.role) {
      return
    }

    setIsUpdatingRole(true)

    try {
      await updateManagedUserRole({
        userId: user.id,
        role: nextRole,
      })

      setSuccessMessage('Perfil actualizado correctamente.')
      await loadUsers()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar el perfil del usuario.')
    } finally {
      setIsUpdatingRole(false)
    }
  }

  const handleToggleUserState = async (user: ManagedUser) => {
    setErrorMessage('')
    setSuccessMessage('')

    const bannedUntilDate = user.bannedUntil ? new Date(user.bannedUntil) : null
    const isBanned = Boolean(bannedUntilDate && !Number.isNaN(bannedUntilDate.getTime()) && bannedUntilDate.getTime() > Date.now())
    const actionLabel = isBanned ? 'reactivar' : 'desactivar'
    const confirmed = window.confirm(`¿Deseas ${actionLabel} al usuario ${user.email}?`)
    if (!confirmed) {
      return
    }

    setPendingActionUserId(user.id)

    try {
      if (user.isActive) {
        await deactivateManagedUser({ userId: user.id })
        setSuccessMessage('Usuario desactivado correctamente.')
      } else {
        await reactivateManagedUser({ userId: user.id })
        setSuccessMessage('Usuario reactivado correctamente.')
      }

      await loadUsers()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar el estado del usuario.')
    } finally {
      setPendingActionUserId(null)
      setOpenMenuUserId(null)
    }
  }

  const handleDeleteUser = async (user: ManagedUser) => {
    setErrorMessage('')
    setSuccessMessage('')

    const confirmed = window.confirm(`¿Eliminar permanentemente al usuario ${user.email}? Esta acción no se puede deshacer.`)
    if (!confirmed) {
      return
    }

    setPendingActionUserId(user.id)

    try {
      await deleteManagedUser({ userId: user.id })
      setSuccessMessage('Usuario eliminado correctamente.')
      await loadUsers()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo eliminar el usuario.')
    } finally {
      setPendingActionUserId(null)
      setOpenMenuUserId(null)
    }
  }

  return (
    <section className="config-section" aria-labelledby="users-management-title">
      <h3 id="users-management-title">Gestión de usuarios</h3>
      <p>Administra acceso por correo y perfil.</p>

      {errorMessage ? <div className="import-panel__result is-error">{errorMessage}</div> : null}
      {successMessage ? <div className="import-panel__result is-success">{successMessage}</div> : null}

      <form className="admin-users__form" onSubmit={(event) => void handleCreateUser(event)}>
        <label className="import-panel__field">
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="import-panel__field">
          <span>Contraseña temporal</span>
          <input
            type="password"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <label className="import-panel__field">
          <span>Perfil</span>
          <select
            value={newUserRole}
            onChange={(event) => setNewUserRole(event.target.value === 'admin' ? 'admin' : 'user')}
          >
            <option value="admin">Administrador</option>
            <option value="user">Usuario</option>
          </select>
        </label>

        <button type="submit" className="import-panel__button" disabled={isCreating}>
          {isCreating ? 'Creando...' : 'Crear usuario'}
        </button>
      </form>

      <div className="admin-users__list-header">
        <h4>Usuarios existentes</h4>
        <button type="button" className="operational-page__reset operational-page__reset--compact" onClick={() => void loadUsers()} disabled={isLoading}>
          {isLoading ? 'Actualizando...' : 'Actualizar lista'}
        </button>
      </div>

      <div className="admin-users__table-wrapper">
        <table className="admin-users__table">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Perfil</th>
              <th>Creado</th>
              <th>Último acceso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => {
              const selectedRole = roleDraftByUserId[user.id] ?? user.role
              const isSelf = user.id === currentUser?.id
              const isPrincipal = isPrincipalAdmin(user)
              const isRoleLocked = isPrincipal
              const isMutating = pendingActionUserId === user.id
              const isActionProtected = isSelf || isPrincipal
              const bannedUntilDate = user.bannedUntil ? new Date(user.bannedUntil) : null
              const isBanned = Boolean(bannedUntilDate && !Number.isNaN(bannedUntilDate.getTime()) && bannedUntilDate.getTime() > Date.now())
              const canReactivate = isBanned
              const isCurrentPrincipal = isSelf && isPrincipal

              return (
                <tr key={user.id}>
                  <td>
                    {user.email}
                    {isCurrentPrincipal ? <span className="admin-users__tag">Tu cuenta</span> : null}
                    {isPrincipal && !isSelf ? <span className="admin-users__tag admin-users__tag--protected">Cuenta principal</span> : null}
                  </td>
                  <td>
                    <select
                      value={selectedRole}
                      disabled={isRoleLocked || isUpdatingRole || isMutating}
                      onChange={(event) => {
                        const value = event.target.value === 'admin' ? 'admin' : 'user'
                        setRoleDraftByUserId((current) => ({ ...current, [user.id]: value }))
                      }}
                    >
                      <option value="admin">Administrador</option>
                      <option value="user">Usuario</option>
                    </select>
                    <span className="admin-users__role-label">Actual: {toRoleLabel(user.role)}</span>
                  </td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td>{formatDateTime(user.lastSignInAt)}</td>
                  <td>
                    {isCurrentPrincipal ? (
                      <span className="admin-users__muted-action">Tu cuenta</span>
                    ) : isActionProtected ? (
                      <span className="admin-users__muted-action">Sin acciones disponibles</span>
                    ) : (
                      <div className="admin-users__actions">
                        <button
                          type="button"
                          className="operational-page__reset operational-page__reset--compact"
                          onClick={() => void handleUpdateRole(user)}
                          disabled={isUpdatingRole || isMutating || selectedRole === user.role}
                        >
                          Guardar perfil
                        </button>

                        <div className="admin-users__menu-wrapper">
                          <button
                            type="button"
                            className="operational-page__reset operational-page__reset--compact admin-users__menu-trigger"
                            aria-label={`Abrir acciones para ${user.email}`}
                            onClick={() => setOpenMenuUserId((current) => (current === user.id ? null : user.id))}
                            disabled={isMutating || isUpdatingRole}
                          >
                            ⋯
                          </button>

                          {openMenuUserId === user.id ? (
                            <div className="admin-users__menu" role="menu">
                              <button
                                type="button"
                                className="admin-users__menu-item"
                                onClick={() => void handleToggleUserState(user)}
                                disabled={isMutating || isUpdatingRole}
                              >
                                {canReactivate ? 'Reactivar' : 'Desactivar'}
                              </button>
                              <button
                                type="button"
                                className="admin-users__menu-item admin-users__menu-item--danger"
                                onClick={() => void handleDeleteUser(user)}
                                disabled={isMutating || isUpdatingRole}
                              >
                                Eliminar usuario
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {sortedUsers.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={5}>No hay usuarios registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
