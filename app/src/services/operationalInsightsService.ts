import { aggregatePedidos, buildLineKey, buildPedidoKey, filterRowsBySelectedMonths, getDateKey, isBlankOrValue, isIncumplidoRow, matchesSelectedClients, normalizeText, readAreaName, readClientName, readCauseName, readPendingTm } from '../lib/operationalDetail'
import { fetchOperationalBaseData } from './operationalDataCache'
import type { OperationalInsightCrossFilter, OperationalInsightRow, OperationalInsightsData, OperationalInsightSeriesPoint, OperationalTopRow } from '../types/operationalInsights'

function buildKeysFromFilter(rows: OperationalInsightRow[], filter: OperationalInsightCrossFilter): Set<string> {
  const normalizedValue = normalizeText(filter.value)
  if (!normalizedValue) {
    return new Set<string>()
  }

  const keys = new Set<string>()

  for (const row of rows) {
    const rowValue = normalizeText(row[filter.key])
    if (!rowValue || rowValue !== normalizedValue) {
      continue
    }

    const pedidoKey = buildPedidoKey(row)
    if (pedidoKey) {
      keys.add(pedidoKey)
    }
  }

  return keys
}

function intersectKeySets(sets: Set<string>[]): Set<string> {
  const [first, ...rest] = sets
  const intersection = new Set(first)

  for (const currentSet of rest) {
    for (const key of Array.from(intersection)) {
      if (!currentSet.has(key)) {
        intersection.delete(key)
      }
    }
  }

  return intersection
}

function buildCauseAreaMap(causeRows: OperationalInsightRow[], areaRows: OperationalInsightRow[]): Map<string, string> {
  const areaByLine = new Map<string, string>()
  const areaByPedido = new Map<string, Set<string>>()

  for (const row of areaRows) {
    const area = readAreaName(row)?.trim()
    const pedidoKey = buildPedidoKey(row)

    if (!area || !pedidoKey) {
      continue
    }

    const normalizedArea = normalizeText(area)
    if (!normalizedArea) {
      continue
    }

    const lineKey = buildLineKey(row)
    if (lineKey) {
      areaByLine.set(`${pedidoKey}|${lineKey}`, normalizedArea)
    }

    const currentAreas = areaByPedido.get(pedidoKey) ?? new Set<string>()
    currentAreas.add(normalizedArea)
    areaByPedido.set(pedidoKey, currentAreas)
  }

  const map = new Map<string, string>()

  for (const row of causeRows) {
    const cause = readCauseName(row)?.trim()
    const pedidoKey = buildPedidoKey(row)
    if (!cause || !pedidoKey) {
      continue
    }

    const normalizedCause = normalizeText(cause)
    if (!normalizedCause || map.has(normalizedCause)) {
      continue
    }

    const lineKey = buildLineKey(row)
    const byLine = lineKey ? areaByLine.get(`${pedidoKey}|${lineKey}`) : undefined

    if (byLine) {
      map.set(normalizedCause, byLine)
      continue
    }

    const pedidoAreas = areaByPedido.get(pedidoKey)
    if (pedidoAreas && pedidoAreas.size === 1) {
      map.set(normalizedCause, Array.from(pedidoAreas)[0])
    }
  }

  return map
}

function filterRowsByPedidoKeys(rows: OperationalInsightRow[], allowedKeys: Set<string> | null): OperationalInsightRow[] {
  if (!allowedKeys) {
    return rows
  }

  return rows.filter((row) => {
    const pedidoKey = buildPedidoKey(row)
    return pedidoKey ? allowedKeys.has(pedidoKey) : false
  })
}

const operationalInsightsCache = new Map<string, OperationalInsightsData>()

function buildInsightCacheKey(selectedMonths: string[], selectedClients: string[], crossFilters: OperationalInsightCrossFilter[]): string {
  const monthsKey = [...selectedMonths].sort().join('|')
  const clientsKey = [...selectedClients].map((value) => normalizeText(value)).sort().join('|')
  const filtersKey = [...crossFilters]
    .map((filter) => `${filter.key}:${normalizeText(filter.value)}`)
    .sort()
    .join('|')

  return `${monthsKey}||${clientsKey}||${filtersKey}`
}

function buildRolling30DayRange(endDateKey: string): { startDate: string; endDate: string } {
  const endDate = new Date(`${endDateKey}T00:00:00Z`)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - 29)

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  }
}

function buildDailySeries(rows: OperationalInsightRow[]): { temporalSeries: OperationalInsightSeriesPoint[]; volumeSeries: OperationalInsightSeriesPoint[] } {
  const latestDateKey = rows.reduce<string | null>((latest, row) => {
    const dateKey = getDateKey(row.fecha)
    if (!dateKey) {
      return latest
    }

    return !latest || dateKey > latest ? dateKey : latest
  }, null)

  if (!latestDateKey) {
    return { temporalSeries: [], volumeSeries: [] }
  }

  const rollingRange = buildRolling30DayRange(latestDateKey)
  const rollingRows = rows.filter((row) => {
    const dateKey = getDateKey(row.fecha)
    return dateKey ? dateKey >= rollingRange.startDate && dateKey <= rollingRange.endDate : false
  })
  const pedidos = aggregatePedidos(rollingRows)
  const grouped = new Map<string, { programmed: number; dispatched: number; fulfilled: number; total: number }>()

  for (const pedido of pedidos) {
    if (!pedido.dateKey) {
      continue
    }

    const current = grouped.get(pedido.dateKey) ?? { programmed: 0, dispatched: 0, fulfilled: 0, total: 0 }
    current.programmed += pedido.programmedTm
    current.dispatched += pedido.dispatchedTm
    current.total += 1
    current.fulfilled += pedido.isIncumplido ? 0 : 1
    grouped.set(pedido.dateKey, current)
  }

  const entries = Array.from(grouped.entries())
    .filter(([, values]) => values.programmed > 0)
    .sort((left, right) => left[0].localeCompare(right[0]))

  return {
    temporalSeries: entries.map(([dateKey, values]) => ({
      label: dateKey,
      dateKey,
      value: values.total > 0 ? (values.fulfilled / values.total) * 100 : null,
      pedidosCumplidos: values.fulfilled,
      totalPedidos: values.total,
    })),
    volumeSeries: entries.map(([dateKey, values]) => ({
      label: dateKey,
      dateKey,
      value: values.programmed,
      secondaryValue: values.dispatched,
    })),
  }
}

function buildIncumplimientosSeries(rows: OperationalInsightRow[]): OperationalInsightSeriesPoint[] {
  const latestDateKey = rows.reduce<string | null>((latest, row) => {
    const dateKey = getDateKey(row.fecha)
    if (!dateKey) {
      return latest
    }

    return !latest || dateKey > latest ? dateKey : latest
  }, null)

  if (!latestDateKey) {
    return []
  }

  const rollingRange = buildRolling30DayRange(latestDateKey)
  const rollingRows = rows.filter((row) => {
    const dateKey = getDateKey(row.fecha)
    return dateKey ? dateKey >= rollingRange.startDate && dateKey <= rollingRange.endDate : false
  })

  const pedidos = aggregatePedidos(rollingRows)
  const grouped = new Map<string, { incumplidos: number; total: number }>()

  for (const pedido of pedidos) {
    if (!pedido.dateKey) {
      continue
    }

    const current = grouped.get(pedido.dateKey) ?? { incumplidos: 0, total: 0 }
    current.total += 1
    current.incumplidos += pedido.isIncumplido ? 1 : 0
    grouped.set(pedido.dateKey, current)
  }

  return Array.from(grouped.entries())
    .filter(([, values]) => values.total > 0)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([dateKey, values]) => ({
      label: dateKey,
      dateKey,
      value: values.incumplidos,
      totalPedidos: values.total,
    }))
}

function buildSortedCauseRows(rows: OperationalInsightRow[]): OperationalTopRow[] {
  const map = new Map<string, { tmPendiente: number; pedidos: Set<string> }>()

  for (const row of rows) {
    const causeName = readCauseName(row)

    if (isBlankOrValue(causeName, 'Sin causa') || !causeName) {
      continue
    }

    const entry = map.get(causeName) ?? { tmPendiente: 0, pedidos: new Set<string>() }
    const pedidoKey = buildPedidoKey(row)
    const normalizedCause = causeName.toLowerCase()

    if (pedidoKey && isIncumplidoRow(row)) {
      entry.pedidos.add(`${pedidoKey}|${normalizedCause}`)
    }

    entry.tmPendiente += Number(readPendingTm(row)) || 0

    map.set(causeName, entry)
  }

  return Array.from(map.entries())
    .map(([name, details]) => ({
      name,
      tmPendiente: Number(details.tmPendiente),
      pedidosIncumplidos: details.pedidos.size,
    }))
    .sort((left, right) => right.tmPendiente - left.tmPendiente || right.pedidosIncumplidos - left.pedidosIncumplidos)
}

function buildTopCauseRows(rows: OperationalInsightRow[]): OperationalTopRow[] {
  return buildSortedCauseRows(rows).slice(0, 5)
}

function buildAreaSeries(rows: OperationalInsightRow[], mode: 'incidents' | 'pending'): OperationalInsightSeriesPoint[] {
  const map = new Map<string, { pedidos: Set<string>; pendingTm: number }>()

  for (const row of rows) {
    if (isBlankOrValue(row.area, 'Sin área')) {
      continue
    }

    const area = String(row.area).trim()
    const current = map.get(area) ?? { pedidos: new Set<string>(), pendingTm: 0 }
    const pedidoKey = buildPedidoKey(row)
    const normalizedArea = area.toLowerCase()

    if (pedidoKey && isIncumplidoRow(row)) {
      current.pedidos.add(`${pedidoKey}|${normalizedArea}`)
    }

    if (mode === 'pending') {
      current.pendingTm += Number(readPendingTm(row)) || 0
    }

    map.set(area, current)
  }

  return Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      value: mode === 'incidents' ? value.pedidos.size : Number(value.pendingTm),
    }))
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0))
}

function buildSortedClientRows(rows: OperationalInsightRow[]): OperationalTopRow[] {
  const map = new Map<string, { tmPendiente: number; pedidos: Set<string> }>()
  const pedidos = aggregatePedidos(rows)

  for (const row of rows) {
    const client = readClientName(row)?.trim()
    if (!client) {
      continue
    }

    const current = map.get(client) ?? { tmPendiente: 0, pedidos: new Set<string>() }

    current.tmPendiente += Number(readPendingTm(row)) || 0

    map.set(client, current)
  }

  for (const pedido of pedidos) {
    const client = pedido.client?.trim()
    if (!client || !pedido.hasGuideInformation || !pedido.isIncumplido) {
      continue
    }

    const current = map.get(client)
    if (!current) {
      continue
    }

    current.pedidos.add(pedido.key)
  }

  return Array.from(map.entries())
    .map(([name, values]) => ({
      name,
      tmPendiente: values.tmPendiente,
      pedidosIncumplidos: values.pedidos.size,
    }))
    .sort((left, right) => right.tmPendiente - left.tmPendiente || right.pedidosIncumplidos - left.pedidosIncumplidos)
}

function buildTopClientRows(rows: OperationalInsightRow[]): OperationalTopRow[] {
  return buildSortedClientRows(rows).slice(0, 5)
}

function buildAvailableClients(rows: OperationalInsightRow[]): string[] {
  const uniqueClients = new Map<string, string>()

  for (const row of rows) {
    const value = readClientName(row) ?? ''
    const normalized = normalizeText(value)

    if (!normalized || normalized === 'sin cliente') {
      continue
    }

    if (!uniqueClients.has(normalized)) {
      uniqueClients.set(normalized, value.trim())
    }
  }

  return Array.from(uniqueClients.values()).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

export async function fetchOperationalInsightsData(
  selectedMonths: string[],
  selectedClients: string[],
  crossFilters: OperationalInsightCrossFilter[],
): Promise<OperationalInsightsData> {
  const cacheKey = buildInsightCacheKey(selectedMonths, selectedClients, crossFilters)
  const cached = operationalInsightsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const baseData = await fetchOperationalBaseData()
  const { causeRows, areaRows, detailRows: pedidoRows } = baseData

  const pedidoRowsForMonths = filterRowsBySelectedMonths(pedidoRows, selectedMonths)
  const causeRowsForMonths = filterRowsBySelectedMonths(causeRows, selectedMonths)
  const areaRowsForMonths = filterRowsBySelectedMonths(areaRows, selectedMonths)
  const pedidoRowsForClients = pedidoRowsForMonths.filter((row) => matchesSelectedClients(row, selectedClients))
  const causeRowsForClients = causeRowsForMonths.filter((row) => matchesSelectedClients(row, selectedClients))
  const areaRowsForClients = areaRowsForMonths.filter((row) => matchesSelectedClients(row, selectedClients))

  const keySets = crossFilters
    .map((filter) => {
      if (filter.key === 'area') {
        return buildKeysFromFilter(areaRowsForClients, filter)
      }

      if (filter.key === 'causa') {
        return buildKeysFromFilter(causeRowsForClients, filter)
      }

      return buildKeysFromFilter(pedidoRowsForClients, filter)
    })
    .filter((set) => set.size > 0)

  const allowedPedidoKeys = keySets.length > 0 ? intersectKeySets(keySets) : null
  const filteredPedidoRows = filterRowsByPedidoKeys(pedidoRowsForClients, allowedPedidoKeys)
  const filteredCauseRows = filterRowsByPedidoKeys(causeRowsForClients, allowedPedidoKeys)
  const filteredAreaRows = filterRowsByPedidoKeys(areaRowsForClients, allowedPedidoKeys)
  const selectedAreaFilters = crossFilters
    .filter((filter) => filter.key === 'area')
    .map((filter) => normalizeText(filter.value))
    .filter(Boolean)
  const selectedCauseFilters = crossFilters
    .filter((filter) => filter.key === 'causa')
    .map((filter) => normalizeText(filter.value))
    .filter(Boolean)

  const selectedAreasSet = new Set(selectedAreaFilters)
  const selectedCausesSet = new Set(selectedCauseFilters)
  const causeAreaMap = buildCauseAreaMap(causeRowsForClients, areaRowsForClients)
  const areasFromSelectedCauses = new Set(
    selectedCauseFilters
      .map((cause) => causeAreaMap.get(cause))
      .filter((area): area is string => Boolean(area)),
  )

  const visibleCauseRows = filteredCauseRows.filter((row) => {
    const causeKey = normalizeText(readCauseName(row))
    if (!causeKey) {
      return false
    }

    if (selectedCausesSet.size > 0 && !selectedCausesSet.has(causeKey)) {
      return false
    }

    if (selectedAreasSet.size === 0) {
      return true
    }

    const mappedArea = causeAreaMap.get(causeKey)
    return Boolean(mappedArea && selectedAreasSet.has(mappedArea))
  })

  const visibleAreaRows = filteredAreaRows.filter((row) => {
    const areaKey = normalizeText(readAreaName(row))
    if (!areaKey) {
      return false
    }

    if (selectedAreasSet.size > 0 && !selectedAreasSet.has(areaKey)) {
      return false
    }

    if (selectedCausesSet.size === 0) {
      return true
    }

    return areasFromSelectedCauses.has(areaKey)
  })
  const { temporalSeries, volumeSeries } = buildDailySeries(filteredPedidoRows)
  const incumplimientosSeries = buildIncumplimientosSeries(filteredPedidoRows)

  const result = {
    temporalSeries,
    incumplimientosSeries,
    volumeSeries,
    areaIncidents: buildAreaSeries(visibleAreaRows, 'incidents'),
    areaPendingTm: buildAreaSeries(visibleAreaRows, 'pending'),
    topCauseRows: buildTopCauseRows(visibleCauseRows),
    topClientRows: buildTopClientRows(filteredPedidoRows),
    fullCauseRows: buildSortedCauseRows(filteredCauseRows),
    fullClientRows: buildSortedClientRows(filteredPedidoRows),
    availableClients: buildAvailableClients(filteredPedidoRows),
  }

  operationalInsightsCache.set(cacheKey, result)
  return result
}
