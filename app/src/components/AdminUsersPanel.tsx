import { useEffect, useMemo, useState } from 'react'
import {
  createManagedUser,
  listManagedUsers,
  updateManagedUserRole,
  type ManagedUser,
  type ManagedUserRole,
} from '../services/adminUsersService'

interface RoleDraftByUserId {
  [userId: string]: ManagedUserRole
}

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

export function AdminUsersPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdatingRole, setIsUpdatingRole] = useState(false)
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
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => {
              const selectedRole = roleDraftByUserId[user.id] ?? user.role

              return (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={selectedRole}
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
                    <button
                      type="button"
                      className="operational-page__reset operational-page__reset--compact"
                      onClick={() => void handleUpdateRole(user)}
                      disabled={isUpdatingRole || selectedRole === user.role}
                    >
                      Guardar perfil
                    </button>
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
