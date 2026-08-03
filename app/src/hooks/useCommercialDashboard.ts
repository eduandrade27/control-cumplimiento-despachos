import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildPedidoKey, filterRowsBySelectedMonths, isBlankOrValue, isIncumplidoRow, matchesSelectedClients, normalizeText, readAreaName, readCauseName, readClientName, readPendingTm, readTextValue } from '../lib/operationalDetail'
import { fetchCommercialDashboardData } from '../services/commercialService'
import type { CommercialCauseRow, CommercialDetailCauseRow, CommercialDetailRow, CommercialKpis } from '../types/commercial'
import type { AvailableMonthOption, SupabaseErrorInfo } from '../types/operational'

type CommercialDashboardStatus = 'loading' | 'success' | 'empty' | 'error'

function buildMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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

function areSameMonths(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function readVendorName(row: Record<string, unknown>): string | null {
  const value = readTextValue(row, ['vendedor', 'vendedor_nombre', 'comercial'])?.trim() ?? null
  if (!value) {
    return null
  }

  const normalized = normalizeText(value)
  if (!normalized || normalized === 'sin vendedor' || normalized.includes('asistente')) {
    return null
  }

  return value
}

function readClientNameSafe(row: Record<string, unknown>): string | null {
  const value = readClientName(row)?.trim() ?? null
  if (!value) {
    return null
  }

  const normalized = normalizeText(value)
  if (!normalized || normalized === 'sin cliente') {
    return null
  }

  return value
}

function readCauseNameSafe(row: Record<string, unknown>): string | null {
  const value = readCauseName(row)?.trim() ?? null
  if (!value) {
    return null
  }

  const normalized = normalizeText(value)
  if (!normalized || normalized === 'sin causa') {
    return null
  }

  return value
}

function readAreaNameSafe(row: Record<string, unknown>): string | null {
  const value = readAreaName(row)?.trim() ?? null
  if (!value || isBlankOrValue(value, 'Sin área')) {
    return null
  }

  return value
}

function buildDetailKey(cliente: string, vendedor: string): string {
  return `${normalizeText(cliente)}|${normalizeText(vendedor)}`
}

function buildAvailableClients(rows: Record<string, unknown>[]): string[] {
  const uniqueClients = new Map<string, string>()

  for (const row of rows) {
    const client = readClientNameSafe(row)
    if (!client) {
      continue
    }

    const normalized = normalizeText(client)

    if (!uniqueClients.has(normalized)) {
      uniqueClients.set(normalized, client)
    }
  }

  return Array.from(uniqueClients.values()).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function buildAvailableAreas(rows: Record<string, unknown>[]): string[] {
  const uniqueAreas = new Map<string, string>()

  for (const row of rows) {
    const area = readAreaNameSafe(row)
    if (!area) {
      continue
    }

    const normalized = normalizeText(area)
    if (!uniqueAreas.has(normalized)) {
      uniqueAreas.set(normalized, area)
    }
  }

  return Array.from(uniqueAreas.values()).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function buildPedidoKeysByArea(rows: Record<string, unknown>[]): Map<string, Set<string>> {
  const areaIndex = new Map<string, Set<string>>()

  for (const row of rows) {
    const area = readAreaNameSafe(row)
    const pedidoKey = buildPedidoKey(row)

    if (!area || !pedidoKey) {
      continue
    }

    const normalizedArea = normalizeText(area)
    const keys = areaIndex.get(normalizedArea) ?? new Set<string>()
    keys.add(pedidoKey)
    areaIndex.set(normalizedArea, keys)
  }

  return areaIndex
}

function buildCommercialKpis(rows: Record<string, unknown>[]): CommercialKpis {
  const tmPendientes = rows.reduce((accumulator, row) => accumulator + (readPendingTm(row) || 0), 0)
  const pedidosIncumplidos = new Set<string>()
  const clientesAfectados = new Set<string>()
  const vendedoresInvolucrados = new Set<string>()

  for (const row of rows) {
    const pedidoKey = buildPedidoKey(row)
    if (pedidoKey && isIncumplidoRow(row)) {
      pedidosIncumplidos.add(pedidoKey)
    }

    const client = readClientNameSafe(row)
    if (client) {
      clientesAfectados.add(normalizeText(client))
    }

    const vendor = readVendorName(row)
    if (vendor) {
      vendedoresInvolucrados.add(normalizeText(vendor))
    }
  }

  return {
    tmPendientes,
    pedidosIncumplidos: pedidosIncumplidos.size,
    clientesAfectados: clientesAfectados.size,
    vendedoresInvolucrados: vendedoresInvolucrados.size,
  }
}

function buildCauseRows(rows: Record<string, unknown>[]): CommercialCauseRow[] {
  const map = new Map<string, { tmPendiente: number; pedidos: Set<string> }>()

  for (const row of rows) {
    const cause = readCauseNameSafe(row)
    if (!cause) {
      continue
    }

    const current = map.get(cause) ?? { tmPendiente: 0, pedidos: new Set<string>() }
    const pedidoKey = buildPedidoKey(row)

    current.tmPendiente += Number(readPendingTm(row)) || 0

    if (pedidoKey && isIncumplidoRow(row)) {
      current.pedidos.add(pedidoKey)
    }

    map.set(cause, current)
  }

  return Array.from(map.entries())
    .map(([causa, values]) => ({
      causa,
      tmPendiente: values.tmPendiente,
      pedidosIncumplidos: values.pedidos.size,
    }))
    .sort((left, right) => right.tmPendiente - left.tmPendiente || right.pedidosIncumplidos - left.pedidosIncumplidos)
}

function buildDetailRows(
  detailRows: Record<string, unknown>[],
  causeRows: Record<string, unknown>[],
): CommercialDetailRow[] {
  const groupedDetails = new Map<string, CommercialDetailRow>()

  for (const row of detailRows) {
    const cliente = readClientNameSafe(row)
    const vendedor = readVendorName(row)

    if (!cliente || !vendedor) {
      continue
    }

    const key = buildDetailKey(cliente, vendedor)

    const current = groupedDetails.get(key) ?? {
      key,
      cliente,
      vendedor,
      tmPendiente: 0,
      causes: [],
    }

    current.tmPendiente += Number(readPendingTm(row)) || 0
    groupedDetails.set(key, current)
  }

  const causesByDetail = new Map<string, Map<string, { tmPendiente: number; pedidos: Set<string> }>>()

  for (const row of causeRows) {
    const cliente = readClientNameSafe(row)
    const vendedor = readVendorName(row)

    if (!cliente || !vendedor) {
      continue
    }

    const detailKey = buildDetailKey(cliente, vendedor)
    const cause = readCauseNameSafe(row)
    if (!cause) {
      continue
    }

    const pedidoKey = buildPedidoKey(row)

    const detailMap = causesByDetail.get(detailKey) ?? new Map<string, { tmPendiente: number; pedidos: Set<string> }>()
    const causeValues = detailMap.get(cause) ?? { tmPendiente: 0, pedidos: new Set<string>() }

    causeValues.tmPendiente += Number(readPendingTm(row)) || 0

    if (pedidoKey && isIncumplidoRow(row)) {
      causeValues.pedidos.add(pedidoKey)
    }

    detailMap.set(cause, causeValues)
    causesByDetail.set(detailKey, detailMap)
  }

  return Array.from(groupedDetails.values())
    .map((row) => {
      const detailCauses = causesByDetail.get(row.key)
      const causes: CommercialDetailCauseRow[] = detailCauses
        ? Array.from(detailCauses.entries())
          .map(([causa, values]) => ({
            causa,
            tmPendiente: values.tmPendiente,
            pedidosIncumplidos: values.pedidos.size,
          }))
          .sort((left, right) => right.tmPendiente - left.tmPendiente || right.pedidosIncumplidos - left.pedidosIncumplidos)
        : []

      return {
        ...row,
        causes,
      }
    })
    .sort((left, right) => right.tmPendiente - left.tmPendiente)
}

export function useCommercialDashboard(selectedClients: string[], selectedArea: string | null) {
  const [detailRows, setDetailRows] = useState<Record<string, unknown>[]>([])
  const [causeRows, setCauseRows] = useState<Record<string, unknown>[]>([])
  const [areaRows, setAreaRows] = useState<Record<string, unknown>[]>([])
  const [availableMonths, setAvailableMonths] = useState<AvailableMonthOption[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [defaultYear, setDefaultYear] = useState<number | null>(null)
  const [defaultMonths, setDefaultMonths] = useState<string[]>([])
  const [status, setStatus] = useState<CommercialDashboardStatus>('loading')
  const [error, setError] = useState<SupabaseErrorInfo | null>(null)

  const loadDashboard = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const data = await fetchCommercialDashboardData()
      setDetailRows(data.detailRows)
      setCauseRows(data.causeRows)
      setAreaRows(data.areaRows)
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
      setStatus(data.detailRows.length === 0 && data.causeRows.length === 0 && data.areaRows.length === 0 ? 'empty' : 'success')
    } catch (caughtError) {
      setStatus('error')
      setError(caughtError as SupabaseErrorInfo)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

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

  const resetFilters = useCallback(() => {
    setSelectedYear(defaultYear)
    setSelectedMonths(defaultMonths)
  }, [defaultMonths, defaultYear])

  const hasActiveFilters = selectedYear !== defaultYear || !areSameMonths(selectedMonths, defaultMonths)

  const filteredDetailRows = useMemo(
    () => filterRowsBySelectedMonths(detailRows, selectedMonths).filter((row) => matchesSelectedClients(row, selectedClients)),
    [detailRows, selectedClients, selectedMonths],
  )

  const filteredCauseRows = useMemo(
    () => filterRowsBySelectedMonths(causeRows, selectedMonths).filter((row) => matchesSelectedClients(row, selectedClients)),
    [causeRows, selectedClients, selectedMonths],
  )

  const pedidoKeysByArea = useMemo(() => buildPedidoKeysByArea(areaRows), [areaRows])

  const areaFilteredDetailRows = useMemo(() => {
    if (!selectedArea) {
      return filteredDetailRows
    }

    const normalizedArea = normalizeText(selectedArea)
    const pedidoKeys = pedidoKeysByArea.get(normalizedArea)

    if (!pedidoKeys || pedidoKeys.size === 0) {
      return []
    }

    return filteredDetailRows.filter((row) => {
      const pedidoKey = buildPedidoKey(row)
      return pedidoKey ? pedidoKeys.has(pedidoKey) : false
    })
  }, [filteredDetailRows, pedidoKeysByArea, selectedArea])

  const areaFilteredCauseRows = useMemo(() => {
    if (!selectedArea) {
      return filteredCauseRows
    }

    const normalizedArea = normalizeText(selectedArea)
    const pedidoKeys = pedidoKeysByArea.get(normalizedArea)

    if (!pedidoKeys || pedidoKeys.size === 0) {
      return []
    }

    return filteredCauseRows.filter((row) => {
      const pedidoKey = buildPedidoKey(row)
      return pedidoKey ? pedidoKeys.has(pedidoKey) : false
    })
  }, [filteredCauseRows, pedidoKeysByArea, selectedArea])

  const kpis = useMemo(() => buildCommercialKpis(areaFilteredDetailRows), [areaFilteredDetailRows])
  const causeTableRows = useMemo(() => buildCauseRows(areaFilteredCauseRows), [areaFilteredCauseRows])
  const commercialDetailRows = useMemo(
    () => buildDetailRows(areaFilteredDetailRows, areaFilteredCauseRows),
    [areaFilteredCauseRows, areaFilteredDetailRows],
  )
  const availableClients = useMemo(() => buildAvailableClients(detailRows), [detailRows])
  const availableAreas = useMemo(() => buildAvailableAreas(areaRows), [areaRows])

  return {
    status,
    error,
    kpis,
    causeTableRows,
    commercialDetailRows,
    availableClients,
    availableAreas,
    availableYears,
    availableMonths: monthsForSelectedYear,
    selectedYear,
    selectedMonths,
    changeYear,
    toggleMonth,
    resetFilters,
    hasActiveFilters,
  }
}
