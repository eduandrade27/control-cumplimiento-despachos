import { supabase } from '../lib/supabase'

export type ManagedUserRole = 'admin' | 'user'

export interface ManagedUser {
  id: string
  email: string
  role: ManagedUserRole
  isActive: boolean
  bannedUntil: string | null
  createdAt: string | null
  lastSignInAt: string | null
}

interface AdminUsersInvokeError {
  message: string
}

interface AdminUsersResponse<T> {
  ok: boolean
  data?: T
  error?: AdminUsersInvokeError
}

interface ListUsersResponse {
  users: ManagedUser[]
}

interface CreateUserResponse {
  user: ManagedUser
}

interface UpdateRoleResponse {
  user: ManagedUser
}

interface ToggleUserStateResponse {
  user: ManagedUser
}

interface DeleteUserResponse {
  userId: string
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const typedPayload = payload as {
    error?: { message?: unknown }
    message?: unknown
  }

  if (typedPayload.error && typeof typedPayload.error.message === 'string' && typedPayload.error.message.trim()) {
    return typedPayload.error.message
  }

  if (typeof typedPayload.message === 'string' && typedPayload.message.trim()) {
    return typedPayload.message
  }

  return null
}

async function extractInvokeErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') {
    return null
  }

  const maybeError = error as {
    context?: {
      clone?: () => { json: () => Promise<unknown>; text: () => Promise<string> }
      json?: () => Promise<unknown>
      text?: () => Promise<string>
    }
  }

  const context = maybeError.context
  if (!context) {
    return null
  }

  try {
    if (typeof context.clone === 'function') {
      try {
        const jsonPayload = await context.clone().json()
        const parsedJsonMessage = extractErrorMessage(jsonPayload)
        if (parsedJsonMessage) {
          return parsedJsonMessage
        }
      } catch {
        // Ignore JSON parse errors and keep trying other formats.
      }

      try {
        const textPayload = await context.clone().text()
        if (textPayload.trim()) {
          try {
            const parsedPayload = JSON.parse(textPayload)
            const parsedMessage = extractErrorMessage(parsedPayload)
            if (parsedMessage) {
              return parsedMessage
            }
          } catch {
            return textPayload
          }

          return textPayload
        }
      } catch {
        // Ignore text extraction errors and keep fallback flow.
      }
    }

    if (typeof context.json === 'function') {
      const jsonPayload = await context.json()
      const parsedJsonMessage = extractErrorMessage(jsonPayload)
      if (parsedJsonMessage) {
        return parsedJsonMessage
      }
    }

    if (typeof context.text === 'function') {
      const textPayload = await context.text()
      if (!textPayload.trim()) {
        return null
      }

      try {
        const parsedPayload = JSON.parse(textPayload)
        const parsedMessage = extractErrorMessage(parsedPayload)
        if (parsedMessage) {
          return parsedMessage
        }
      } catch {
        return textPayload
      }

      return textPayload
    }
  } catch {
    return null
  }

  return null
}

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<AdminUsersResponse<T>>('admin-users', {
    body,
  })

  if (error) {
    const detailedMessage = await extractInvokeErrorMessage(error)
    throw new Error(detailedMessage || error.message || 'No se pudo conectar con el servicio de administración de usuarios.')
  }

  if (!data?.ok) {
    throw new Error(data?.error?.message || 'No se pudo completar la operación de usuarios.')
  }

  if (!data.data) {
    throw new Error('Respuesta inválida del servicio de administración de usuarios.')
  }

  return data.data
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const data = await invokeAdminUsers<ListUsersResponse>({
    action: 'listUsers',
  })

  return data.users
}

export async function createManagedUser(params: {
  email: string
  temporaryPassword: string
  role: ManagedUserRole
}): Promise<ManagedUser> {
  const data = await invokeAdminUsers<CreateUserResponse>({
    action: 'createUser',
    email: params.email,
    temporaryPassword: params.temporaryPassword,
    role: params.role,
  })

  return data.user
}

export async function updateManagedUserRole(params: {
  userId: string
  role: ManagedUserRole
}): Promise<ManagedUser> {
  const data = await invokeAdminUsers<UpdateRoleResponse>({
    action: 'updateRole',
    userId: params.userId,
    role: params.role,
  })

  return data.user
}

export async function deactivateManagedUser(params: {
  userId: string
}): Promise<ManagedUser> {
  const data = await invokeAdminUsers<ToggleUserStateResponse>({
    action: 'deactivateUser',
    userId: params.userId,
  })

  return data.user
}

export async function reactivateManagedUser(params: {
  userId: string
}): Promise<ManagedUser> {
  const data = await invokeAdminUsers<ToggleUserStateResponse>({
    action: 'reactivateUser',
    userId: params.userId,
  })

  return data.user
}

export async function deleteManagedUser(params: {
  userId: string
}): Promise<string> {
  const data = await invokeAdminUsers<DeleteUserResponse>({
    action: 'deleteUser',
    userId: params.userId,
  })

  return data.userId
}
