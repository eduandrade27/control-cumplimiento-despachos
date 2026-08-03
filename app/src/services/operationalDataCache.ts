import { supabase } from '../lib/supabase'
import { fetchAllRowsFromView } from './supabasePagination'
import type { AvailableMonthOption } from '../types/operational'

interface OperationalBaseData {
  monthlyRows: Record<string, unknown>[]
  dailyRows: Record<string, unknown>[]
  detailRows: Record<string, unknown>[]
  causeRows: Record<string, unknown>[]
  areaRows: Record<string, unknown>[]
  availableMonths: AvailableMonthOption[]
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

function buildAvailableMonthOptions(monthlyRows: Record<string, unknown>[], availableRows: Record<string, unknown>[]): AvailableMonthOption[] {
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
    const monthValue = getValue(row, ['mes', 'month', 'mes_numero', 'month_number', 'mes_num', 'month_num', 'periodo', 'period', 'periodo_mes'])
    addMonthOption(monthValue)
  }

  for (const row of monthlyRows) {
    const monthValue = getValue(row, ['mes', 'month', 'mes_numero', 'month_number', 'mes_num', 'month_num', 'periodo', 'period', 'periodo_mes'])
    addMonthOption(monthValue)
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year
    }

    return left.month - right.month
  })
}

let operationalBaseDataPromise: Promise<OperationalBaseData> | null = null

export function invalidateOperationalBaseDataCache(): void {
  operationalBaseDataPromise = null
}

export function fetchOperationalBaseData(): Promise<OperationalBaseData> {
  if (operationalBaseDataPromise) {
    return operationalBaseDataPromise
  }

  operationalBaseDataPromise = (async () => {
    const [monthlyQuery, dailyQuery, detailRows, causeRows, areaRows, yearsQuery] = await Promise.all([
      supabase.schema('despachos').from('vw_kpis_mensuales').select('*'),
      supabase.schema('despachos').from('vw_kpis_diarios').select('*'),
      fetchAllRowsFromView<Record<string, unknown>>('vw_pedidos'),
      fetchAllRowsFromView<Record<string, unknown>>('vw_pedido_causa'),
      fetchAllRowsFromView<Record<string, unknown>>('vw_pedido_area'),
      supabase.schema('despachos').from('vw_anios_disponibles').select('*'),
    ])

    if (monthlyQuery.error) {
      throw monthlyQuery.error
    }

    if (dailyQuery.error) {
      throw dailyQuery.error
    }

    if (yearsQuery.error) {
      throw yearsQuery.error
    }

    const monthlyRows = (monthlyQuery.data ?? []) as Record<string, unknown>[]
    const dailyRows = (dailyQuery.data ?? []) as Record<string, unknown>[]
    const yearsRows = (yearsQuery.data ?? []) as Record<string, unknown>[]

    return {
      monthlyRows,
      dailyRows,
      detailRows,
      causeRows,
      areaRows,
      availableMonths: buildAvailableMonthOptions(monthlyRows, yearsRows),
    }
  })().catch((error) => {
    operationalBaseDataPromise = null
    throw error
  })

  return operationalBaseDataPromise
}