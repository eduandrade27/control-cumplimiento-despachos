import { useEffect, useState } from 'react'
import { subscribeToSupabaseRefresh } from '../lib/refreshEvents'
import { getCargaActual } from '../services/supabaseService'

interface SupabaseErrorInfo {
  code?: string
  message?: string
  details?: string
  hint?: string
}

interface UseSupabaseCargaActualResult {
  status: 'loading' | 'ready' | 'error'
  message: string
  rows: Array<Record<string, unknown>>
  errorInfo?: SupabaseErrorInfo
}

function normalizeSupabaseError(error: unknown): SupabaseErrorInfo {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>

    return {
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
      hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Error al consultar Supabase.',
  }
}

export function useSupabaseCargaActual(): UseSupabaseCargaActualResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [errorInfo, setErrorInfo] = useState<SupabaseErrorInfo | undefined>()

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        const data = await getCargaActual()

        if (!isMounted) {
          return
        }

        setRows(data)
        setMessage(data.length > 0 ? 'Consulta realizada correctamente.' : 'No existen cargas registradas.')
        setErrorInfo(undefined)
        setStatus('ready')
      } catch (error) {
        if (!isMounted) {
          return
        }

        const normalizedError = normalizeSupabaseError(error)
        setErrorInfo(normalizedError)
        setMessage(normalizedError.message ?? 'Error al consultar Supabase.')
        setStatus('error')
      }
    }

    void loadData()

    const unsubscribe = subscribeToSupabaseRefresh(() => {
      void loadData()
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  return { status, message, rows, errorInfo }
}
