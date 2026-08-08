import { supabase } from '../lib/supabase'

export type ManagedUserRole = 'admin' | 'user'

export interface ManagedUser {
  id: string
  email: string
  role: ManagedUserRole
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

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<AdminUsersResponse<T>>('admin-users', {
    body,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo conectar con el servicio de administración de usuarios.')
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
