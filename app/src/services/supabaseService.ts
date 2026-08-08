import { supabase } from '../lib/supabase'

export type CargaActualRow = Record<string, unknown>

const LAST_LOAD_TIMESTAMP_CANDIDATES = [
  'fecha_carga',
  'fecha_fin',
  'fecha_fin_carga',
  'fecha_actualizacion',
  'updated_at',
  'created_at',
] as const

function parseTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function readLastLoadTimestampFromRow(row: Record<string, unknown>): string | null {
  for (const candidate of LAST_LOAD_TIMESTAMP_CANDIDATES) {
    const normalizedCandidate = candidate.toLowerCase()

    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase() !== normalizedCandidate) {
        continue
      }

      const parsed = parseTimestamp(value)
      if (parsed) {
        return parsed
      }
    }
  }

  return null
}

export async function getCargaActual(): Promise<CargaActualRow[]> {
  const { data, error } = await supabase.schema('despachos').from('vw_carga_actual').select('*')

  if (error) {
    throw error
  }

  return (data ?? []) as CargaActualRow[]
}

export async function getLastSuccessfulLoadTimestamp(): Promise<string | null> {
  const { data, error } = await supabase
    .schema('despachos')
    .from('cargas')
    .select('*')
    .eq('estado', 'completada')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  return readLastLoadTimestampFromRow(data as Record<string, unknown>)
}
