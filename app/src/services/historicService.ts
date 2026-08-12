import { supabase } from '../lib/supabase'

export type HistoricDashboardRow = Record<string, unknown>

const historicDashboardRowsPromises = new Map<string, Promise<HistoricDashboardRow[]>>()
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
  historicDashboardRowsPromises.clear()
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

function getRangeCacheKey(range?: { from?: string; to?: string }): string {
  const from = range?.from ?? ''
  const to = range?.to ?? ''
  return `${from}|${to}`
}

export async function preloadHistoricCurrentYear(): Promise<void> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthText = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  await fetchHistoricDashboardRows({
    from: `${year}-01-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  })
}

export function fetchHistoricDashboardRows(range?: { from?: string; to?: string }): Promise<HistoricDashboardRow[]> {
  const cacheKey = getRangeCacheKey(range)
  const cached = historicDashboardRowsPromises.get(cacheKey)

  if (cached) {
    return cached
  }

  const request = (async () => {
    const rows: HistoricDashboardRow[] = []
    let fromRow = 0

    while (true) {
      let query = supabase
        .schema('despachos')
        .from('lineas_despacho')
        .select('fecha,orden_venta,cod_parte,cliente,sector,cant_despachada,status_despacho,tm_programada,tm_despachada,tm_pendiente,causa')

      if (range?.from) {
        query = query.gte('fecha', range.from)
      }

      if (range?.to) {
        query = query.lte('fecha', range.to)
      }

      const { data, error } = await query.range(fromRow, fromRow + 1000 - 1)

      if (error) {
        throw error
      }

      const batch = (data ?? []) as HistoricDashboardRow[]
      rows.push(...batch)

      if (batch.length < 1000) {
        break
      }

      fromRow += 1000
    }

    return rows
  })()
    .then((rows) => rows.map((row) => ({
      ...row,
      has_guia: row.cant_despachada !== null && row.cant_despachada !== undefined,
    })))
    .catch((error) => {
      historicDashboardRowsPromises.delete(cacheKey)
      throw error
    })

  historicDashboardRowsPromises.set(cacheKey, request)
  return request
}
