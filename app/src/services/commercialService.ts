import { supabase } from '../lib/supabase'
import { fetchAllRowsFromView } from './supabasePagination'
import type { AvailableMonthOption, SupabaseErrorInfo } from '../types/operational'
import type { CommercialDashboardData } from '../types/commercial'

function toSupabaseError(error: unknown): SupabaseErrorInfo {
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
    message: typeof error === 'string' ? error : 'Error desconocido al consultar Comercial.',
  }
}

function getValue(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase())

  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.includes(key.toLowerCase())) {
      return value
    }
  }

  return null
}

function normalizeMonthKey(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toString().padStart(2, '0')}`
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) {
      return null
    }

    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      return trimmed
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(5, 7)}`
    }

    if (/^\d{6}$/.test(trimmed)) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}`
    }

    const match = trimmed.match(/(\d{4})[^\d]*(\d{1,2})/)

    if (match) {
      return `${match[1]}-${Number(match[2]).toString().padStart(2, '0')}`
    }
  }

  return null
}

function getMonthKeyFromRow(row: Record<string, unknown>): string | null {
  const monthValue = getValue(row, ['mes', 'month', 'mes_numero', 'month_number', 'mes_num', 'month_num', 'periodo', 'period', 'periodo_mes'])
  const normalizedMonth = normalizeMonthKey(monthValue)
  if (normalizedMonth) {
    return normalizedMonth
  }

  const dateValue = getValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido'])
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed.slice(0, 7)
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 7)
    }
  }

  return null
}

function parseYearMonth(monthKey: string): { year: number; month: number } | null {
  const match = monthKey.match(/^(\d{4})-(\d{1,2})$/)

  if (!match) {
    return null
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  }
}

function formatMonthLabel(monthKey: string): string {
  const parsed = parseYearMonth(monthKey)

  if (!parsed) {
    return monthKey
  }

  const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
  const date = new Date(parsed.year, parsed.month - 1, 1)

  return formatter.format(date).replace(/\b\w/, (char) => char.toUpperCase())
}

function buildAvailableMonthOptions(baseRows: Record<string, unknown>[], availableRows: Record<string, unknown>[]): AvailableMonthOption[] {
  const options = new Map<string, AvailableMonthOption>()

  const addMonthOption = (monthValue: unknown) => {
    const monthKey = normalizeMonthKey(monthValue)

    if (!monthKey) {
      return
    }

    const parsed = parseYearMonth(monthKey)

    if (!parsed) {
      return
    }

    const value = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`

    if (!options.has(value)) {
      options.set(value, {
        value,
        label: formatMonthLabel(value),
        year: parsed.year,
        month: parsed.month,
      })
    }
  }

  for (const row of availableRows) {
    const monthValue = getMonthKeyFromRow(row)
    addMonthOption(monthValue)
  }

  for (const row of baseRows) {
    const monthValue = getMonthKeyFromRow(row)
    addMonthOption(monthValue)
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year
    }

    return left.month - right.month
  })
}

export async function fetchCommercialDashboardData(): Promise<CommercialDashboardData> {
  try {
    const [detailRows, causeRows, areaRows, yearsQuery] = await Promise.all([
      fetchAllRowsFromView<Record<string, unknown>>('vw_pedidos'),
      fetchAllRowsFromView<Record<string, unknown>>('vw_pedido_causa'),
      fetchAllRowsFromView<Record<string, unknown>>('vw_pedido_area'),
      supabase.schema('despachos').from('vw_anios_disponibles').select('*'),
    ])
    if (yearsQuery.error) {
      throw toSupabaseError(yearsQuery.error)
    }

    return {
      detailRows,
      causeRows,
      areaRows,
      availableMonths: buildAvailableMonthOptions([...detailRows, ...causeRows, ...areaRows], (yearsQuery.data ?? []) as Record<string, unknown>[]),
    }
  } catch (error) {
    throw toSupabaseError(error)
  }
}
