import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  aggregatePedidos,
  buildPedidoKey,
  filterRowsBySelectedMonths,
  isIncumplidoRow,
  normalizeText,
  readAreaName,
  readCauseName,
  readClientName,
  readPendingTm,
  readTextValue,
} from '../lib/operationalDetail'
import { loadCauseCatalogSummary, normalizeCauseComparisonToken } from '../lib/excel'
import { subscribeToSupabaseRefresh } from '../lib/refreshEvents'
import { loadSharedCauseCatalogSummaryWithInitialMigration } from '../services/causeCatalogService'
import { fetchOperationalBaseData } from '../services/operationalDataCache'
import type { ExcelCauseCatalogRow, ExcelCauseCatalogSummary } from '../types/excel'
import type { AvailableMonthOption, SupabaseErrorInfo } from '../types/operational'
import type {
  CauseCatalogMeta,
  CauseCatalogClassification,
  CauseOperationalRow,
  CausesAnalysisHookResult,
  CausesAdjustedModeInfo,
  CausesIndicatorMode,
  CausesYearSnapshot,
  CausesHistoricalMonthSnapshot,
  CausesAnalysisStatus,
  CausesSectorFilter,
} from '../types/causesAnalysis'

type DashboardRow = Record<string, unknown>

interface LoadedState {
  detailRows: DashboardRow[]
  causeRows: DashboardRow[]
  availableMonths: AvailableMonthOption[]
  availableYears: number[]
  selectedYear: number | null
  selectedMonths: string[]
  defaultYear: number | null
  defaultMonths: string[]
}

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

function sortMonthsByChronology(left: AvailableMonthOption, right: AvailableMonthOption): number {
  return left.year - right.year || left.month - right.month
}

function readSector(row: DashboardRow): CausesSectorFilter | null {
  const value = readTextValue(row, ['sector', 'tipo_sector', 'segmento', 'unidad_negocio'])
  const normalized = normalizeText(value)

  if (!normalized) {
    return null
  }

  if (normalized.includes('agro')) {
    return 'AGRO'
  }

  if (normalized.includes('domest')) {
    return 'DOMESTICO'
  }

  return null
}

function buildCauseCatalogMap(summary: ExcelCauseCatalogSummary | null): Map<string, ExcelCauseCatalogRow> {
  const map = new Map<string, ExcelCauseCatalogRow>()

  if (!summary || !summary.foundSheet || summary.missingRequiredHeaders.length > 0) {
    return map
  }

  for (const row of summary.rows) {
    if (!row.motivoNormalizado || map.has(row.motivoNormalizado)) {
      continue
    }

    map.set(row.motivoNormalizado, row)
  }

  return map
}

function countRealMatchedCauses(
  rows: DashboardRow[],
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
): number {
  if (causeCatalogMap.size === 0) {
    return 0
  }

  const matched = new Set<string>()

  for (const row of rows) {
    const causeRaw = readCauseValue(row)
    if (!causeRaw) {
      continue
    }

    const normalized = normalizeCauseComparisonToken(causeRaw)
    if (!normalized) {
      continue
    }

    if (causeCatalogMap.has(normalized)) {
      matched.add(normalized)
    }
  }

  return matched.size
}

function classifyCause(
  rawCause: string,
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
  fallbackArea: string,
): CauseCatalogMeta {
  const normalizedCause = normalizeCauseComparisonToken(rawCause)

  if (!normalizedCause) {
    return {
      matched: false,
      affectsIndicator: false,
      classification: 'UNCLASSIFIED',
      area: fallbackArea,
      justificacion: '',
    }
  }

  const matched = causeCatalogMap.get(normalizedCause)
  if (!matched) {
    return {
      matched: false,
      affectsIndicator: false,
      classification: 'UNCLASSIFIED',
      area: fallbackArea,
      justificacion: '',
    }
  }

  const classification: CauseCatalogClassification = matched.afectaIndicador ? 'SI' : 'NO'

  return {
    matched: true,
    affectsIndicator: matched.afectaIndicador,
    classification,
    area: matched.area.trim() || fallbackArea,
    justificacion: matched.justificacion,
  }
}

function buildAvailableClients(rows: DashboardRow[]): string[] {
  const uniqueClients = new Map<string, string>()

  for (const row of rows) {
    const client = readClientName(row)?.trim()
    if (!client) {
      continue
    }

    const key = normalizeText(client)
    if (!key || uniqueClients.has(key)) {
      continue
    }

    uniqueClients.set(key, client)
  }

  return Array.from(uniqueClients.values()).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function readCauseValue(row: DashboardRow): string {
  return (
    readCauseName(row)?.trim()
    ?? readTextValue(row, ['causas', 'motivo', 'motivos'])?.trim()
    ?? ''
  )
}

interface CauseAggregationResult {
  rows: CauseOperationalRow[]
  pedidosIncumplidos: number
  tmPendientes: number
  matchedCauseCount: number
}

interface CauseParetoRow extends CauseOperationalRow {
  partPct: number | null
  acumPct: number | null
}

function buildParetoRows(rows: CauseOperationalRow[]): CauseParetoRow[] {
  const sorted = [...rows].sort((left, right) => right.tmPendiente - left.tmPendiente || right.pedidos - left.pedidos)
  const total = sorted.reduce((sum, row) => sum + row.tmPendiente, 0)
  let cumulative = 0

  return sorted.map((row) => {
    const partPct = total > 0 ? (row.tmPendiente / total) * 100 : null
    cumulative += row.tmPendiente

    return {
      ...row,
      partPct,
      acumPct: total > 0 ? (cumulative / total) * 100 : null,
    }
  })
}

function getCriticalCauseRows(rows: CauseParetoRow[], targetPct = 80): CauseParetoRow[] {
  if (rows.length === 0) {
    return []
  }

  const result: CauseParetoRow[] = []

  for (const row of rows) {
    result.push(row)
    if ((row.acumPct ?? 0) >= targetPct) {
      break
    }
  }

  return result
}

function aggregateRowsByCause(
  rows: DashboardRow[],
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
): CauseAggregationResult {
  const pendingTmByPedido = new Map<string, number>()

  for (const row of rows) {
    if (!isIncumplidoRow(row)) {
      continue
    }

    const pedidoKey = buildPedidoKey(row)
    if (!pedidoKey) {
      continue
    }

    const currentPending = pendingTmByPedido.get(pedidoKey) ?? 0
    pendingTmByPedido.set(pedidoKey, currentPending + readPendingTm(row))
  }

  const rowsByCause = new Map<string, CauseOperationalRow>()
  const dedupeByPedidoCause = new Set<string>()
  const matchedCauseTokens = new Set<string>()

  for (const row of rows) {
    if (!isIncumplidoRow(row)) {
      continue
    }

    const pedidoKey = buildPedidoKey(row)
    if (!pedidoKey || !pendingTmByPedido.has(pedidoKey)) {
      continue
    }

    const causeRaw = readCauseValue(row)
    if (!causeRaw) {
      continue
    }

    const normalizedCause = normalizeCauseComparisonToken(causeRaw) || normalizeText(causeRaw)
    if (!normalizedCause) {
      continue
    }

    const dedupeKey = `${pedidoKey}|${normalizedCause}`
    if (dedupeByPedidoCause.has(dedupeKey)) {
      continue
    }
    dedupeByPedidoCause.add(dedupeKey)

    const fallbackArea = readAreaName(row)?.trim() || 'Sin área'
    const classification = classifyCause(causeRaw, causeCatalogMap, fallbackArea)
    const displayCause = classification.matched
      ? (causeCatalogMap.get(normalizedCause)?.motivoOriginal ?? causeRaw)
      : causeRaw

    const existing = rowsByCause.get(normalizedCause) ?? {
      causa: displayCause,
      area: classification.area || 'Sin área',
      affectsIndicator: classification.affectsIndicator,
      catalogClassification: classification.classification,
      justificacion: classification.justificacion,
      pedidos: 0,
      tmPendiente: 0,
    }

    if (classification.matched) {
      matchedCauseTokens.add(normalizedCause)
    }

    existing.pedidos += 1
    existing.tmPendiente += pendingTmByPedido.get(pedidoKey) ?? 0

    if (!existing.justificacion && classification.justificacion) {
      existing.justificacion = classification.justificacion
    }

    if ((!existing.area || existing.area === 'Sin área') && classification.area) {
      existing.area = classification.area
    }

    rowsByCause.set(normalizedCause, existing)
  }

  const orderedRows = Array.from(rowsByCause.values())
    .sort((left, right) => right.tmPendiente - left.tmPendiente || right.pedidos - left.pedidos)

  const pedidosIncumplidos = pendingTmByPedido.size
  const tmPendientes = Array.from(pendingTmByPedido.values()).reduce((sum, value) => sum + value, 0)

  return {
    rows: orderedRows,
    pedidosIncumplidos,
    tmPendientes,
    matchedCauseCount: matchedCauseTokens.size,
  }
}

function matchesClient(row: DashboardRow, selectedClients: string[]): boolean {
  if (selectedClients.length === 0) {
    return true
  }

  const client = normalizeText(readClientName(row))
  if (!client) {
    return false
  }

  const selected = new Set(selectedClients.map((value) => normalizeText(value)).filter(Boolean))
  return selected.has(client)
}

function matchesSector(row: DashboardRow, selectedSector: CausesSectorFilter): boolean {
  if (selectedSector === 'TODOS') {
    return true
  }

  return readSector(row) === selectedSector
}

function getCauseIdentity(value: string): string {
  return normalizeCauseComparisonToken(value) || normalizeText(value)
}

export function useCausesAnalysisDashboard(selectedClients: string[]): CausesAnalysisHookResult {
  const [detailRows, setDetailRows] = useState<DashboardRow[]>([])
  const [causeRows, setCauseRows] = useState<DashboardRow[]>([])
  const [availableMonths, setAvailableMonths] = useState<AvailableMonthOption[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [defaultYear, setDefaultYear] = useState<number | null>(null)
  const [defaultMonths, setDefaultMonths] = useState<string[]>([])
  const [selectedSector, setSelectedSector] = useState<CausesSectorFilter>('TODOS')
  const [indicatorMode, setIndicatorMode] = useState<CausesIndicatorMode>('BRUTO')
  const [status, setStatus] = useState<CausesAnalysisStatus>('loading')
  const [error, setError] = useState<SupabaseErrorInfo | null>(null)
  const [causeCatalogSummary, setCauseCatalogSummary] = useState<ExcelCauseCatalogSummary | null>(null)

  const loadDashboard = useCallback(async (): Promise<LoadedState> => {
    const baseData = await fetchOperationalBaseData()
    const years = extractAvailableYears(baseData.availableMonths)

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const yesterdayMonth = buildMonthKey(yesterday)
    const initialYear = years.includes(yesterday.getFullYear()) ? yesterday.getFullYear() : (years[0] ?? null)
    const initialMonth = initialYear !== null
      ? getInitialMonthForYear(baseData.availableMonths, initialYear, yesterdayMonth)
      : null
    const initialMonths = initialMonth ? [initialMonth] : []

    return {
      detailRows: baseData.detailRows,
      causeRows: baseData.causeRows,
      availableMonths: baseData.availableMonths,
      availableYears: years,
      selectedYear: initialYear,
      selectedMonths: initialMonths,
      defaultYear: initialYear,
      defaultMonths: initialMonths,
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const runLoad = async () => {
      setStatus('loading')
      setError(null)

      try {
        const loaded = await loadDashboard()
        const sharedCauseCatalog = await loadSharedCauseCatalogSummaryWithInitialMigration(loadCauseCatalogSummary)

        if (!mounted) {
          return
        }

        setDetailRows(loaded.detailRows)
        setCauseRows(loaded.causeRows)
        setAvailableMonths(loaded.availableMonths)
        setAvailableYears(loaded.availableYears)
        setSelectedYear(loaded.selectedYear)
        setSelectedMonths(loaded.selectedMonths)
        setDefaultYear(loaded.defaultYear)
        setDefaultMonths(loaded.defaultMonths)
        setCauseCatalogSummary(sharedCauseCatalog)
        setStatus(loaded.detailRows.length > 0 ? 'success' : 'empty')
      } catch (caughtError) {
        if (!mounted) {
          return
        }

        setError(caughtError as SupabaseErrorInfo)
        setStatus('error')
      }
    }

    void runLoad()

    const unsubscribe = subscribeToSupabaseRefresh(() => {
      void runLoad()
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [loadDashboard])

  useEffect(() => {
    if (selectedYear === null) {
      return
    }

    const yearMonths = availableMonths.filter((month) => month.year === selectedYear).map((month) => month.value)
    const normalizedYearMonths = yearMonths.sort()

    setSelectedMonths((current) => {
      const validCurrent = current.filter((month) => normalizedYearMonths.includes(month))

      if (validCurrent.length > 0) {
        const currentSorted = [...validCurrent].sort()
        return areSameMonths(currentSorted, validCurrent) ? validCurrent : currentSorted
      }

      const fallbackMonth = normalizedYearMonths[normalizedYearMonths.length - 1]
      if (!fallbackMonth) {
        return []
      }

      return [fallbackMonth]
    })
  }, [availableMonths, selectedYear])

  const filteredRowsByMainFilters = useMemo(() => {
    const byMonths = filterRowsBySelectedMonths(causeRows, selectedMonths)

    return byMonths.filter((row) => {
      if (!matchesClient(row, selectedClients)) {
        return false
      }

      return matchesSector(row, selectedSector)
    })
  }, [causeRows, selectedClients, selectedMonths, selectedSector])

  const filteredDetailRowsByMainFilters = useMemo(() => {
    const byMonths = filterRowsBySelectedMonths(detailRows, selectedMonths)

    return byMonths.filter((row) => {
      if (!matchesClient(row, selectedClients)) {
        return false
      }

      return matchesSector(row, selectedSector)
    })
  }, [detailRows, selectedClients, selectedMonths, selectedSector])

  const causeCatalogMap = useMemo(() => buildCauseCatalogMap(causeCatalogSummary), [causeCatalogSummary])
  const rowsForGlobalMatch = useMemo(
    () => (causeRows.length > 0 ? causeRows : detailRows),
    [causeRows, detailRows],
  )
  const realMatchedCauseCount = useMemo(
    () => countRealMatchedCauses(rowsForGlobalMatch, causeCatalogMap),
    [causeCatalogMap, rowsForGlobalMatch],
  )

  const aggregated = useMemo(
    () => aggregateRowsByCause(filteredRowsByMainFilters, causeCatalogMap),
    [causeCatalogMap, filteredRowsByMainFilters],
  )

  const adjustedModeInfo = useMemo<CausesAdjustedModeInfo>(() => {
    if (!causeCatalogSummary || !causeCatalogSummary.foundSheet) {
      return {
        enabled: false,
        message: 'No se encontró la hoja "Causas". El modo Ajustado no está disponible.',
      }
    }

    if (causeCatalogSummary.missingRequiredHeaders.length > 0) {
      return {
        enabled: false,
        message: `No se puede calcular Ajustado: faltan encabezados en "Causas": ${causeCatalogSummary.missingRequiredHeaders.join(', ')}.`,
      }
    }

    if (causeCatalogMap.size === 0) {
      return {
        enabled: false,
        message: 'No se puede calcular Ajustado: el catálogo de la hoja "Causas" está vacío.',
      }
    }

    if (realMatchedCauseCount === 0) {
      return {
        enabled: false,
        message: 'No existen coincidencias entre la columna Causa de la hoja "26" y la columna MOTIVOS de la hoja "Causas".',
      }
    }

    return {
      enabled: true,
      message: causeCatalogSummary.message,
    }
  }, [causeCatalogMap.size, causeCatalogSummary, realMatchedCauseCount])

  useEffect(() => {
    if (indicatorMode === 'AJUSTADO' && !adjustedModeInfo.enabled) {
      setIndicatorMode('BRUTO')
    }
  }, [adjustedModeInfo.enabled, indicatorMode])

  const effectiveMode: CausesIndicatorMode = indicatorMode === 'AJUSTADO' && !adjustedModeInfo.enabled
    ? 'BRUTO'
    : indicatorMode

  const visibleRows = useMemo(() => {
    if (effectiveMode === 'BRUTO') {
      return aggregated.rows
    }

    return aggregated.rows.filter((row) => row.catalogClassification === 'SI')
  }, [aggregated.rows, effectiveMode])

  const excludedRows = useMemo(() => {
    if (effectiveMode !== 'AJUSTADO') {
      return []
    }

    return aggregated.rows.filter((row) => row.catalogClassification === 'NO')
  }, [aggregated.rows, effectiveMode])

  const criticalVisibleRows = useMemo(() => getCriticalCauseRows(buildParetoRows(visibleRows)), [visibleRows])

  const tmPendientesTotales = useMemo(() => {
    const pedidos = aggregatePedidos(filteredDetailRowsByMainFilters)
    return pedidos.reduce((sum, pedido) => sum + pedido.pendingTm, 0)
  }, [filteredDetailRowsByMainFilters])

  const impactoTotalTm = useMemo(() => {
    const criticalCauseKeys = new Set(
      criticalVisibleRows
        .map((row) => getCauseIdentity(row.causa))
        .filter(Boolean),
    )

    if (criticalCauseKeys.size === 0) {
      return 0
    }

    const pendingTmByPedido = new Map<string, number>(
      aggregatePedidos(filteredDetailRowsByMainFilters).map((pedido) => [pedido.key, pedido.pendingTm] as const),
    )

    const coveredPedidoKeys = new Set<string>()

    for (const row of filteredRowsByMainFilters) {
      if (!isIncumplidoRow(row)) {
        continue
      }

      const pedidoKey = buildPedidoKey(row)
      if (!pedidoKey || !pendingTmByPedido.has(pedidoKey)) {
        continue
      }

      const causeRaw = readCauseValue(row)
      if (!causeRaw) {
        continue
      }

      const causeKey = getCauseIdentity(causeRaw)
      if (!causeKey || !criticalCauseKeys.has(causeKey)) {
        continue
      }

      coveredPedidoKeys.add(pedidoKey)
    }

    return Array.from(coveredPedidoKeys).reduce((sum, pedidoKey) => sum + (pendingTmByPedido.get(pedidoKey) ?? 0), 0)
  }, [criticalVisibleRows, filteredDetailRowsByMainFilters, filteredRowsByMainFilters])

  const yearSnapshots = useMemo<CausesYearSnapshot[]>(() => {
    if (selectedYear === null) {
      return []
    }

    const yearMonths = availableMonths
      .filter((month) => month.year === selectedYear)
      .sort((left, right) => left.month - right.month)

    return yearMonths.map((month) => {
      const monthRows = filterRowsBySelectedMonths(causeRows, [month.value]).filter((row) => {
        if (!matchesClient(row, selectedClients)) {
          return false
        }

        if (selectedSector !== 'TODOS') {
          return readSector(row) === selectedSector
        }

        return true
      })

      const monthAggregated = aggregateRowsByCause(monthRows, causeCatalogMap)
      const monthVisibleRows = effectiveMode === 'BRUTO'
        ? monthAggregated.rows
        : monthAggregated.rows.filter((row) => row.catalogClassification === 'SI')

      return {
        monthKey: month.value,
        month: month.month,
        rows: monthVisibleRows,
      }
    })
  }, [availableMonths, causeCatalogMap, causeRows, effectiveMode, selectedClients, selectedSector, selectedYear])

  const historicalMonthSnapshots = useMemo<CausesHistoricalMonthSnapshot[]>(() => {
    const sortedMonths = [...availableMonths].sort(sortMonthsByChronology)

    return sortedMonths.map((month) => {
      const monthRows = filterRowsBySelectedMonths(causeRows, [month.value]).filter((row) => {
        if (!matchesClient(row, selectedClients)) {
          return false
        }

        if (selectedSector !== 'TODOS') {
          return readSector(row) === selectedSector
        }

        return true
      })

      const monthAggregated = aggregateRowsByCause(monthRows, causeCatalogMap)
      const monthVisibleRows = effectiveMode === 'BRUTO'
        ? monthAggregated.rows
        : monthAggregated.rows.filter((row) => row.catalogClassification === 'SI')

      return {
        monthKey: month.value,
        month: month.month,
        rows: monthVisibleRows,
      }
    })
  }, [availableMonths, causeCatalogMap, causeRows, effectiveMode, selectedClients, selectedSector])

  const availableClients = useMemo(() => buildAvailableClients(filteredRowsByMainFilters), [filteredRowsByMainFilters])

  const changeYear = useCallback((year: number) => {
    setSelectedYear(year)
  }, [])

  const toggleMonth = useCallback((monthKey: string) => {
    setSelectedMonths((current) => {
      if (current.includes(monthKey)) {
        const next = current.filter((month) => month !== monthKey)

        return next.length > 0 ? next : current
      }

      return [...current, monthKey].sort((left, right) => left.localeCompare(right))
    })
  }, [])

  const resetFilters = useCallback(() => {
    setSelectedYear(defaultYear)
    setSelectedMonths(defaultMonths)
    setSelectedSector('TODOS')
    setIndicatorMode('BRUTO')
  }, [defaultMonths, defaultYear])

  const hasActiveFilters = useMemo(() => {
    const hasYearChange = selectedYear !== defaultYear
    const hasMonthChange = !areSameMonths(selectedMonths, defaultMonths)

    return hasYearChange
      || hasMonthChange
      || selectedSector !== 'TODOS'
      || effectiveMode !== 'BRUTO'
      || selectedClients.length > 0
  }, [defaultMonths, defaultYear, effectiveMode, selectedClients.length, selectedMonths, selectedSector, selectedYear])

  const totalsByVisibleRows = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      acc.pedidos += row.pedidos
      acc.tm += row.tmPendiente
      return acc
    }, { pedidos: 0, tm: 0 })
  }, [visibleRows])

  return {
    status,
    error,
    pedidosIncumplidos: totalsByVisibleRows.pedidos,
    tmPendientes: totalsByVisibleRows.tm,
    tmPendientesTotales,
    impactoTotalTm,
    availableMonths: availableMonths.filter((month) => month.year === selectedYear),
    availableYears,
    selectedYear,
    selectedMonths,
    selectedSector,
    indicatorMode: effectiveMode,
    adjustedModeInfo,
    availableClients,
    rows: visibleRows,
    yearSnapshots,
    historicalMonthSnapshots,
    excludedRows,
    hasActiveFilters,
    changeYear,
    toggleMonth,
    setSelectedSector,
    setIndicatorMode,
    resetFilters,
  }
}
