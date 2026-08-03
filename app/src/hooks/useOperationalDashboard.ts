import { useCallback, useEffect, useMemo, useState } from 'react'
import { aggregatePedidos, filterRowsBySelectedMonths, matchesSelectedClients, readNumericValue } from '../lib/operationalDetail'
import { fetchOperationalDashboardData } from '../services/operationalService'
import type { AvailableMonthOption, OperationalDashboardStatus, OperationalKpiSummary, SupabaseErrorInfo } from '../types/operational'

function buildMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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

  if (typeof value === 'number') {
    return `${String(value).padStart(2, '0')}`
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
  }

  return null
}

function formatMonthLabel(monthKey: string): string {
  const match = monthKey.match(/^(\d{4})-(\d{1,2})$/)

  if (!match) {
    return monthKey
  }

  const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)

  return formatter.format(date).replace(/\b\w/, (char) => char.toUpperCase())
}

function getMonthForRow(row: Record<string, unknown>): string | null {
  const monthValue = getValue(row, ['mes', 'month', 'mes_numero', 'month_number', 'mes_num', 'month_num', 'periodo', 'period', 'periodo_mes'])
  const yearValue = getValue(row, ['anio', 'year', 'ano', 'year_number'])

  const normalizedMonth = normalizeMonthKey(monthValue)
  if (normalizedMonth) {
    return normalizedMonth
  }

  if (typeof yearValue === 'number' || typeof yearValue === 'string') {
    const yearString = String(yearValue).trim()
    if (/^\d{4}$/.test(yearString)) {
      return yearString
    }
  }

  return null
}

function buildAggregateSummary(
  rows: Record<string, unknown>[],
  dailyRows: Record<string, unknown>[],
  selectedMonths: string[],
): OperationalKpiSummary {
  const normalizedSelectedMonths = new Set(selectedMonths)
  const monthFilteredRows = rows.filter((row) => {
    const monthKey = getMonthForRow(row)
    return monthKey !== null && normalizedSelectedMonths.has(monthKey)
  })
  const monthFilteredDailyRows = dailyRows.filter((row) => {
    const monthKey = getMonthForRow(row)
    return monthKey !== null && normalizedSelectedMonths.has(monthKey)
  })
  const firstRow = monthFilteredRows[0] as Record<string, unknown> | undefined
  const tmProgramadas = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['tm_programada', 'tm_programadas', 'tm_programado', 'tm_programada_total']) ?? 0), 0)
  const tmDespachadas = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['tm_despachada', 'tm_despachadas', 'tm_despa', 'tm_despachadas_total']) ?? 0), 0)
  const tmPendientes = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['tm_pendiente', 'tm_pendientes', 'tm_por_despachar', 'tm_pendientes_total']) ?? 0), 0)
  const totalPedidos = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['total_pedidos', 'pedidos_total', 'cantidad_pedidos']) ?? 0), 0)
  const pedidosCumplidos = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['pedidos_cumplidos', 'cumplidos']) ?? 0), 0)
  const pedidosIncumplidos = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['pedidos_incumplidos', 'incumplidos']) ?? 0), 0)
  const clientesAfectados = monthFilteredRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['clientes_afectados', 'clientes']) ?? 0), 0)
  const cumplimientoPct = totalPedidos > 0 ? (pedidosCumplidos / totalPedidos) * 100 : null
  const promedioDiarioTmProgramadas = monthFilteredDailyRows.length > 0
    ? monthFilteredDailyRows.reduce((accumulator, row) => accumulator + (readNumericValue(row, ['promedio_diario_tm_programada', 'promedio_diario_tm_programadas', 'promedio_diario', 'tm_programada']) ?? 0), 0) / monthFilteredDailyRows.length
    : (firstRow ? readNumericValue(firstRow, ['promedio_diario_tm_programada', 'promedio_diario_tm_programadas', 'promedio_diario']) ?? null : null)
  const monthKey = selectedMonths.length > 0 ? selectedMonths[0] : null
  const monthLabel = monthKey ? formatMonthLabel(monthKey) : null
  const parsedMonth = monthKey?.match(/^(\d{4})-(\d{1,2})$/)

  return {
    monthKey,
    year: parsedMonth ? Number(parsedMonth[1]) : null,
    month: parsedMonth ? Number(parsedMonth[2]) : null,
    monthLabel,
    tmProgramadas,
    tmDespachadas,
    tmPendientes,
    totalPedidos,
    pedidosCumplidos,
    pedidosIncumplidos,
    clientesAfectados,
    cumplimientoPct,
    promedioDiarioTmProgramadas,
  }
}

function buildDetailSummary(
  detailRows: Record<string, unknown>[],
  selectedMonths: string[],
  selectedClients: string[],
): OperationalKpiSummary {
  const filteredRows = filterRowsBySelectedMonths(detailRows, selectedMonths).filter((row) => matchesSelectedClients(row, selectedClients))
  const pedidos = aggregatePedidos(filteredRows)
  const totalPedidos = pedidos.length
  const pedidosIncumplidos = pedidos.filter((pedido) => pedido.isIncumplido).length
  const pedidosCumplidos = totalPedidos - pedidosIncumplidos
  const tmProgramadas = pedidos.reduce((accumulator, pedido) => accumulator + pedido.programmedTm, 0)
  const tmDespachadas = pedidos.reduce((accumulator, pedido) => accumulator + pedido.dispatchedTm, 0)
  const tmPendientes = pedidos.reduce((accumulator, pedido) => accumulator + pedido.pendingTm, 0)
  const clientesAfectados = new Set(pedidos.map((pedido) => pedido.client?.trim()).filter(Boolean)).size
  const daysWithProgramming = new Set(pedidos.filter((pedido) => pedido.programmedTm > 0 && pedido.dateKey).map((pedido) => pedido.dateKey as string))
  const cumplimientoPct = totalPedidos > 0 ? (pedidosCumplidos / totalPedidos) * 100 : null
  const promedioDiarioTmProgramadas = daysWithProgramming.size > 0 ? tmProgramadas / daysWithProgramming.size : null
  const monthKey = selectedMonths.length > 0 ? selectedMonths[0] : null
  const monthLabel = monthKey ? formatMonthLabel(monthKey) : null
  const parsedMonth = monthKey?.match(/^(\d{4})-(\d{1,2})$/)

  return {
    monthKey,
    year: parsedMonth ? Number(parsedMonth[1]) : null,
    month: parsedMonth ? Number(parsedMonth[2]) : null,
    monthLabel,
    tmProgramadas,
    tmDespachadas,
    tmPendientes,
    totalPedidos,
    pedidosCumplidos,
    pedidosIncumplidos,
    clientesAfectados,
    cumplimientoPct,
    promedioDiarioTmProgramadas,
  }
}

function buildOperationalKpiSummary(
  rows: Record<string, unknown>[],
  dailyRows: Record<string, unknown>[],
  detailRows: Record<string, unknown>[],
  selectedMonths: string[],
  selectedClients: string[],
): OperationalKpiSummary {
  if (selectedClients.length > 0) {
    return buildDetailSummary(detailRows, selectedMonths, selectedClients)
  }

  return buildAggregateSummary(rows, dailyRows, selectedMonths)
}

function areSameMonths(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function extractAvailableYears(months: AvailableMonthOption[]): number[] {
  return Array.from(new Set(months.map((month) => month.year))).sort((left, right) => right - left)
}

function getInitialMonthForYear(
  months: AvailableMonthOption[],
  targetYear: number,
  preferredMonthKey: string,
): string | null {
  const yearMonths = months.filter((month) => month.year === targetYear)
  if (yearMonths.length === 0) {
    return null
  }

  const preferredMonth = yearMonths.find((month) => month.value === preferredMonthKey)
  if (preferredMonth) {
    return preferredMonth.value
  }

  return yearMonths[yearMonths.length - 1]?.value ?? null
}

export function useOperationalDashboard(selectedClients: string[]) {
  const [monthlyRows, setMonthlyRows] = useState<Record<string, unknown>[]>([])
  const [dailyRows, setDailyRows] = useState<Record<string, unknown>[]>([])
  const [detailRows, setDetailRows] = useState<Record<string, unknown>[]>([])
  const [availableMonths, setAvailableMonths] = useState<AvailableMonthOption[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [defaultYear, setDefaultYear] = useState<number | null>(null)
  const [defaultMonths, setDefaultMonths] = useState<string[]>([])
  const [status, setStatus] = useState<OperationalDashboardStatus>('loading')
  const [error, setError] = useState<SupabaseErrorInfo | null>(null)

  const loadDashboard = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const data = await fetchOperationalDashboardData()
      setMonthlyRows(data.monthlyRows)
      setDailyRows(data.dailyRows)
      setDetailRows(data.detailRows)
      setAvailableMonths(data.availableMonths)

      const years = extractAvailableYears(data.availableMonths)
      setAvailableYears(years)

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const yesterdayMonth = buildMonthKey(yesterday)
      const initialYear = years.includes(yesterday.getFullYear()) ? yesterday.getFullYear() : (years[0] ?? null)
      const initialMonth = initialYear !== null
        ? getInitialMonthForYear(data.availableMonths, initialYear, yesterdayMonth)
        : null
      const initialMonths = initialMonth ? [initialMonth] : []

      setSelectedYear(initialYear)
      setSelectedMonths(initialMonths)
      setDefaultYear(initialYear)
      setDefaultMonths(initialMonths)
      setStatus(data.monthlyRows.length === 0 && data.detailRows.length === 0 ? 'empty' : 'success')
    } catch (caughtError) {
      setStatus('error')
      setError(caughtError as SupabaseErrorInfo)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const kpis = useMemo(
    () => buildOperationalKpiSummary(monthlyRows, dailyRows, detailRows, selectedMonths, selectedClients),
    [dailyRows, detailRows, monthlyRows, selectedClients, selectedMonths],
  )

  const monthsForSelectedYear = useMemo(() => {
    if (selectedYear === null) {
      return []
    }

    return availableMonths.filter((month) => month.year === selectedYear)
  }, [availableMonths, selectedYear])

  const changeYear = useCallback((year: number) => {
    setSelectedYear(year)
    setSelectedMonths((current) => {
      const yearMonths = availableMonths.filter((month) => month.year === year)
      const yearMonthKeys = new Set(yearMonths.map((month) => month.value))
      const keptMonths = current.filter((month) => yearMonthKeys.has(month))

      if (keptMonths.length > 0) {
        return keptMonths
      }

      const fallbackMonth = yearMonths[yearMonths.length - 1]?.value
      return fallbackMonth ? [fallbackMonth] : []
    })
  }, [availableMonths])

  const toggleMonth = useCallback((monthKey: string) => {
    setSelectedMonths((current) => {
      if (current.includes(monthKey)) {
        return current.filter((value) => value !== monthKey)
      }

      return [...current, monthKey]
    })
  }, [])

  const removeMonth = useCallback((monthKey: string) => {
    setSelectedMonths((current) => current.filter((value) => value !== monthKey))
  }, [])

  const resetFilters = useCallback(() => {
    setSelectedYear(defaultYear)
    setSelectedMonths(defaultMonths)
  }, [defaultMonths, defaultYear])

  const hasActiveFilters = selectedYear !== defaultYear || !areSameMonths(selectedMonths, defaultMonths)

  return {
    kpis,
    availableYears,
    availableMonths: monthsForSelectedYear,
    selectedYear,
    selectedMonths,
    status,
    error,
    changeYear,
    toggleMonth,
    removeMonth,
    resetFilters,
    hasActiveFilters,
    isLoading: status === 'loading',
  }
}
