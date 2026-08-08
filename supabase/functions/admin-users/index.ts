import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.3'

type ManagedUserRole = 'admin' | 'user'

type Action = 'listUsers' | 'createUser' | 'updateRole'

interface ManagedUser {
  id: string
  email: string
  role: ManagedUserRole
  createdAt: string | null
  lastSignInAt: string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeRole(value: unknown): ManagedUserRole {
  return value === 'admin' ? 'admin' : 'user'
}

function mapUser(user: Record<string, unknown>): ManagedUser {
  const appMetadata = typeof user.app_metadata === 'object' && user.app_metadata !== null
    ? (user.app_metadata as Record<string, unknown>)
    : {}

  return {
    id: typeof user.id === 'string' ? user.id : '',
    email: typeof user.email === 'string' ? user.email : '',
    role: normalizeRole(appMetadata.role),
    createdAt: typeof user.created_at === 'string' ? user.created_at : null,
    lastSignInAt: typeof user.last_sign_in_at === 'string' ? user.last_sign_in_at : null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse(500, {
        ok: false,
        error: { message: 'Configuración incompleta del backend de usuarios.' },
      })
    }

    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return jsonResponse(401, {
        ok: false,
        error: { message: 'No autenticado.' },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const {
      data: { user: callerUser },
      error: callerError,
    } = await userClient.auth.getUser()

    if (callerError || !callerUser) {
      return jsonResponse(401, {
        ok: false,
        error: { message: 'Sesión inválida.' },
      })
    }

    if (normalizeRole(callerUser.app_metadata?.role) !== 'admin') {
      return jsonResponse(403, {
        ok: false,
        error: { message: 'Acceso restringido a administradores.' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const body = (await req.json()) as Record<string, unknown>
    const action = body.action as Action

    if (action === 'listUsers') {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (error) {
        return jsonResponse(400, {
          ok: false,
          error: { message: error.message },
        })
      }

      const users = (data.users ?? []).map((item) => mapUser(item as unknown as Record<string, unknown>))
      return jsonResponse(200, {
        ok: true,
        data: { users },
      })
    }

    if (action === 'createUser') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      const temporaryPassword = typeof body.temporaryPassword === 'string' ? body.temporaryPassword : ''
      const role = normalizeRole(body.role)

      if (!email || !temporaryPassword) {
        return jsonResponse(400, {
          ok: false,
          error: { message: 'Correo y contraseña temporal son obligatorios.' },
        })
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: { role },
      })

      if (error || !data.user) {
        return jsonResponse(400, {
          ok: false,
          error: { message: error?.message || 'No se pudo crear el usuario.' },
        })
      }

      return jsonResponse(200, {
        ok: true,
        data: {
          user: mapUser(data.user as unknown as Record<string, unknown>),
        },
      })
    }

    if (action === 'updateRole') {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      const role = normalizeRole(body.role)

      if (!userId) {
        return jsonResponse(400, {
          ok: false,
          error: { message: 'userId es obligatorio.' },
        })
      }

      const { data: existingData, error: existingError } = await adminClient.auth.admin.getUserById(userId)
      if (existingError || !existingData.user) {
        return jsonResponse(404, {
          ok: false,
          error: { message: existingError?.message || 'Usuario no encontrado.' },
        })
      }

      const existingMetadata = typeof existingData.user.app_metadata === 'object' && existingData.user.app_metadata !== null
        ? (existingData.user.app_metadata as Record<string, unknown>)
        : {}

      const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...existingMetadata,
          role,
        },
      })

      if (error || !data.user) {
        return jsonResponse(400, {
          ok: false,
          error: { message: error?.message || 'No se pudo actualizar el perfil del usuario.' },
        })
      }

      return jsonResponse(200, {
        ok: true,
        data: {
          user: mapUser(data.user as unknown as Record<string, unknown>),
        },
      })
    }

    return jsonResponse(400, {
      ok: false,
      error: { message: 'Acción no soportada.' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado en admin-users.'

    return jsonResponse(500, {
      ok: false,
      error: { message },
    })
  }
})
