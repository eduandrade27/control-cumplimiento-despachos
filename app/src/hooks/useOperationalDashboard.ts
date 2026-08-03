import { useCallback, useEffect, useMemo, useState } from 'react'
import { aggregatePedidos, filterRowsBySelectedMonths, matchesSelectedClients } from '../lib/operationalDetail'
import { fetchOperationalDashboardData } from '../services/operationalService'
import type { AvailableMonthOption, OperationalDashboardStatus, OperationalKpiSummary, SupabaseErrorInfo } from '../types/operational'

function buildMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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

function buildDetailSummary(
  detailRows: Record<string, unknown>[],
  selectedMonths: string[],
  selectedClients: string[],
): OperationalKpiSummary {
  const filteredRows = filterRowsBySelectedMonths(detailRows, selectedMonths).filter((row) => matchesSelectedClients(row, selectedClients))
  const pedidos = aggregatePedidos(filteredRows)
  const totalPedidos = pedidos.length
  const pedidosIncumplidosCount = pedidos.filter((pedido) => pedido.isIncumplido).length
  const pedidosCumplidosCount = totalPedidos - pedidosIncumplidosCount
  const tmProgramadas = pedidos.reduce((accumulator, pedido) => accumulator + pedido.programmedTm, 0)
  const tmDespachadas = pedidos.reduce((accumulator, pedido) => accumulator + pedido.dispatchedTm, 0)
  const tmPendientes = pedidos.reduce((accumulator, pedido) => accumulator + pedido.pendingTm, 0)
  const clientesAfectados = new Set(pedidos.map((pedido) => pedido.client?.trim()).filter(Boolean)).size
  const daysWithProgramming = new Set(pedidos.filter((pedido) => pedido.programmedTm > 0 && pedido.dateKey).map((pedido) => pedido.dateKey as string))
  const cumplimientoPct = totalPedidos > 0 ? (pedidosCumplidosCount / totalPedidos) * 100 : null
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
    pedidosCumplidos: totalPedidos > 0 ? pedidosCumplidosCount : null,
    pedidosIncumplidos: totalPedidos > 0 ? pedidosIncumplidosCount : null,
    clientesAfectados,
    cumplimientoPct,
    promedioDiarioTmProgramadas,
  }
}

function buildOperationalKpiSummary(
  detailRows: Record<string, unknown>[],
  selectedMonths: string[],
  selectedClients: string[],
): OperationalKpiSummary {
  return buildDetailSummary(detailRows, selectedMonths, selectedClients)
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
    () => buildOperationalKpiSummary(detailRows, selectedMonths, selectedClients),
    [detailRows, selectedClients, selectedMonths],
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
