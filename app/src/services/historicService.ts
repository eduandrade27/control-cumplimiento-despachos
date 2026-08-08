import { supabase } from '../lib/supabase'
import { fetchAllRowsFromView } from './supabasePagination'

export type HistoricDashboardRow = Record<string, unknown>

let historicDashboardRowsPromise: Promise<HistoricDashboardRow[]> | null = null
let historicAvailableMonthKeysPromise: Promise<string[]> | null = null

function parseMonthKey(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const text = String(value).trim()
  if (!text) {
    return ''
  }

  if (/^\d{4}-\d{2}$/.test(text)) {
    return text
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.slice(0, 7)
  }

  if (/^\d{6}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}`
  }

  const match = text.match(/(\d{4})[^\d]*(\d{1,2})/)
  if (!match) {
    return ''
  }

  const month = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return ''
  }

  return `${match[1]}-${String(month).padStart(2, '0')}`
}

function readMonthCandidate(row: Record<string, unknown>): unknown {
  const candidates = ['mes', 'month', 'mes_numero', 'month_number', 'mes_num', 'month_num', 'periodo', 'period', 'periodo_mes']
  const normalizedCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()))

  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.has(key.toLowerCase())) {
      return value
    }
  }

  return null
}

export function invalidateHistoricDashboardCache(): void {
  historicDashboardRowsPromise = null
  historicAvailableMonthKeysPromise = null
}

export function fetchHistoricAvailableMonthKeys(): Promise<string[]> {
  if (historicAvailableMonthKeysPromise) {
    return historicAvailableMonthKeysPromise
  }

  historicAvailableMonthKeysPromise = (async () => {
    const { data, error } = await supabase
      .schema('despachos')
      .from('vw_anios_disponibles')
      .select('*')

      if (error) {
        throw error
      }

    const monthSet = new Set<string>()

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const monthKey = parseMonthKey(readMonthCandidate(row))
      if (monthKey) {
        monthSet.add(monthKey)
      }
    }

    return Array.from(monthSet).sort((left, right) => left.localeCompare(right))
  })().catch((error) => {
    historicAvailableMonthKeysPromise = null
    throw error
  })

  return historicAvailableMonthKeysPromise
}

export function fetchHistoricDashboardRows(): Promise<HistoricDashboardRow[]> {
  if (historicDashboardRowsPromise) {
    return historicDashboardRowsPromise
  }

  historicDashboardRowsPromise = fetchAllRowsFromView<HistoricDashboardRow>(
    'lineas_despacho',
    1000,
    'fecha,orden_venta,cod_parte,cliente,sector,cant_despachada,status_despacho,tm_programada,tm_despachada,tm_pendiente,causa',
  )
    .then((rows) => rows.map((row) => ({
      ...row,
      has_guia: row.cant_despachada !== null && row.cant_despachada !== undefined,
    })))
    .catch((error) => {
      historicDashboardRowsPromise = null
      throw error
    })

  return historicDashboardRowsPromise
}
