import { supabase } from '../lib/supabase'

export type CargaActualRow = Record<string, unknown>

export async function getCargaActual(): Promise<CargaActualRow[]> {
  const { data, error } = await supabase.schema('despachos').from('vw_carga_actual').select('*')

  if (error) {
    throw error
  }

  return (data ?? []) as CargaActualRow[]
}
