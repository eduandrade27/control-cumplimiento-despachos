import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildLineKey,
  buildPedidoKey,
  getDateKey,
  normalizeText,
  readNumericValue,
  readProgrammedTm,
  readCauseName,
  readTextValue,
} from '../lib/operationalDetail'
import { loadCauseCatalogSummary, normalizeCauseComparisonToken } from '../lib/excel'
import { subscribeToSupabaseRefresh } from '../lib/refreshEvents'
import { formatMonthLabel } from '../lib/operationalFormat'
import { fetchOperationalBaseData } from '../services/operationalDataCache'
import { fetchAllRowsFromView } from '../services/supabasePagination'
import type { SupabaseErrorInfo } from '../types/operational'
import type {
  HistoricComparisonRow,
  HistoricAdjustedModeInfo,
  HistoricGranularity,
  HistoricIndicatorMode,
  HistoricKpiCard,
  HistoricPeriodMetrics,
  HistoricSectorFilter,
  HistoricStatus,
  HistoricSummaryRow,
} from '../types/historic'
import type { ExcelCauseCatalogRow, ExcelCauseCatalogSummary } from '../types/excel'

type DashboardRow = Record<string, unknown>
type SectorValue = Exclude<HistoricSectorFilter, 'TODOS'>
type OrderStatus = 'FULFILLED' | 'UNFULFILLED' | 'PENDING_EVALUATION'

function normalizeFieldToken(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '')
}

function parseNumericLike(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const normalized = normalizeText(trimmed)
  if (
    normalized.includes('error')
    || normalized.includes('n/a')
    || normalized.includes('#n/a')
    || normalized.includes('na')
  ) {
    return null
  }

  const compact = trimmed.replace(/\s+/g, '')
  if (!/[0-9]/.test(compact)) {
    return null
  }

  const onlyNumericSymbols = compact.replace(/[^0-9.,-]/g, '')
  if (!onlyNumericSymbols || !/[0-9]/.test(onlyNumericSymbols)) {
    return null
  }

  const commaIndex = onlyNumericSymbols.lastIndexOf(',')
  const dotIndex = onlyNumericSymbols.lastIndexOf('.')

  let canonical = onlyNumericSymbols

  if (commaIndex !== -1 && dotIndex !== -1) {
    if (commaIndex > dotIndex) {
      canonical = onlyNumericSymbols.replace(/\./g, '').replace(',', '.')
    } else {
      canonical = onlyNumericSymbols.replace(/,/g, '')
    }
  } else if (commaIndex !== -1) {
    const parts = onlyNumericSymbols.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      canonical = onlyNumericSymbols.replace(',', '.')
    } else {
      canonical = onlyNumericSymbols.replace(/,/g, '')
    }
  } else if (dotIndex !== -1) {
    const parts = onlyNumericSymbols.split('.')
    if (parts.length > 2) {
      canonical = onlyNumericSymbols.replace(/\./g, '')
    }
  }

  const parsed = Number(canonical)
  return Number.isFinite(parsed) ? parsed : null
}

function readFieldValueByCandidates(row: DashboardRow, candidates: string[]): unknown {
  const byExactKey = readTextValue(row, candidates)
  if (byExactKey !== null) {
    return byExactKey
  }

  const normalizedCandidates = new Set(candidates.map((candidate) => normalizeFieldToken(candidate)))

  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.has(normalizeFieldToken(key))) {
      return value
    }
  }

  return null
}

function readNumericField(row: DashboardRow, candidates: string[]): number | null {
  const numericValue = readNumericValue(row, candidates)
  if (numericValue !== null) {
    return numericValue
  }

  const rawValue = readFieldValueByCandidates(row, candidates)
  return parseNumericLike(rawValue)
}

function readTextField(row: DashboardRow, candidates: string[]): string {
  const textValue = readTextValue(row, candidates)
  if (textValue !== null) {
    return textValue
  }

  const rawValue = readFieldValueByCandidates(row, candidates)
  if (rawValue === null || rawValue === undefined) {
    return ''
  }

  return String(rawValue).trim()
}

interface PedidoSummary {
  key: string
  dateKey: string
  programmedTm: number
  dispatchedTmFromValidGuia: number
  pendingTm: number
  status: OrderStatus
  hasAffectingUnfulfilledCause: boolean
  allUnfulfilledCausesAreNonAffecting: boolean
  excludedCauses: Array<{ causa: string; justificacion: string }>
}

interface CauseClassificationResult {
  matched: boolean
  affectsIndicator: boolean
  isAfectaValueInvalid: boolean
  causeOriginal: string
  motivoOriginal: string
  justificacion: string
}

interface AdjustedDiagnostics {
  matchedCauseCount: number
  unclassifiedCauses: string[]
  invalidAfectaCauses: string[]
}

const sectorLabelMap: Record<SectorValue, string> = {
  AGRO: 'AGRO',
  DOMESTICO: 'DOMESTICO',
}

function readSector(row: DashboardRow): SectorValue | null {
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

function readClient(row: DashboardRow): string {
  return readTextValue(row, ['cliente', 'cliente_nombre', 'razon_social']) ?? ''
}

function normalizeMonthValue(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : ''
}

function getMonthDateRange(monthKey: string): { from: string; to: string } {
  const normalized = normalizeMonthValue(monthKey)
  if (!normalized) {
    return { from: '', to: '' }
  }

  const parts = normalized.split('-')
  const yearText = parts?.[0] ?? ''
  const monthText = parts?.[1] ?? ''

  if (!yearText || !monthText) {
    return { from: '', to: '' }
  }

  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return { from: '', to: '' }
  }

  const from = `${yearText}-${monthText}-01`
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const to = `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`

  return { from, to }
}

function listUniqueOptions(rows: DashboardRow[], reader: (row: DashboardRow) => string): string[] {
  const values = new Map<string, string>()

  for (const row of rows) {
    const raw = reader(row).trim()
    if (!raw) {
      continue
    }

    const key = normalizeText(raw)
    if (!key || values.has(key)) {
      continue
    }

    values.set(key, raw)
  }

  return Array.from(values.values()).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function formatDayLabel(dateKey: string): string {
  if (typeof dateKey !== 'string') {
    return ''
  }

  const parts = dateKey.split('-')
  const year = parts?.[0] ?? ''
  const month = parts?.[1] ?? ''
  const day = parts?.[2] ?? ''

  if (!year || !month || !day) {
    return dateKey
  }

  return `${day}/${month}/${year}`
}

function formatPeriodLabel(periodKey: string, granularity: HistoricGranularity): string {
  if (granularity === 'month') {
    return formatMonthLabel(periodKey)
  }

  return formatDayLabel(periodKey)
}

function buildPeriodKey(dateKey: string, granularity: HistoricGranularity): string {
  return granularity === 'day' ? dateKey : dateKey.slice(0, 7)
}

function hasEvaluatedGuia(row: DashboardRow): boolean {
  return readNumericField(row, [
    'cant_despachada',
    'cant despachada',
    'guia',
    'guia despacho',
    'guia_cantidad',
    'cantidad_guiada',
    'cant_guiada',
  ]) !== null
}

function readStatus(row: DashboardRow): string {
  return normalizeText(readTextField(row, [
    'status_despacho',
    'status despacho',
    'estado',
    'estado_pedido',
    'status',
    'estatus',
    'seguimiento',
  ]))
}

function isUnfulfilledStatus(row: DashboardRow): boolean {
  const status = readStatus(row)
  return status.includes('seguimiento') || status.includes('incumpl')
}

function isFulfilledStatus(row: DashboardRow): boolean {
  const status = readStatus(row)
  return status.includes('despach')
}

function readDispatchedTmHistoric(row: DashboardRow): number {
  return readNumericField(row, ['tm_despachada']) ?? 0
}

function readPendingTmHistoric(row: DashboardRow): number {
  return readNumericField(row, ['tm_pendiente']) ?? 0
}

function readCause(row: DashboardRow): string {
  return readCauseName(row)?.trim() ?? readTextField(row, ['causa', 'causas', 'motivo', 'motivos'])
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
    const cause = readCause(row)?.trim()
    if (!cause) {
      continue
    }

    const normalized = normalizeCauseComparisonToken(cause)
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
  causeValue: string,
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
): CauseClassificationResult {
  const normalizedCause = normalizeCauseComparisonToken(causeValue)

  if (!normalizedCause) {
    return {
      matched: false,
      affectsIndicator: true,
      isAfectaValueInvalid: false,
      causeOriginal: causeValue,
      motivoOriginal: causeValue,
      justificacion: '',
    }
  }

  const matched = causeCatalogMap.get(normalizedCause)
  if (!matched) {
    return {
      matched: false,
      affectsIndicator: true,
      isAfectaValueInvalid: false,
      causeOriginal: causeValue,
      motivoOriginal: causeValue,
      justificacion: '',
    }
  }

  return {
    matched: true,
    affectsIndicator: matched.afectaIndicador,
    isAfectaValueInvalid: matched.isAfectaValueInvalid,
    causeOriginal: causeValue,
    motivoOriginal: matched.motivoOriginal,
    justificacion: matched.justificacion,
  }
}

function buildPedidoSummaries(
  rows: DashboardRow[],
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
): { pedidos: PedidoSummary[]; diagnostics: AdjustedDiagnostics } {
  const map = new Map<string, {
    key: string
    dateKey: string
    programmedTm: number
    dispatchedTmFromValidGuia: number
    pendingTm: number
    evaluatedLineCount: number
    hasUnfulfilledEvaluatedLine: boolean
    allEvaluatedLinesFulfilled: boolean
    hasAffectingUnfulfilledCause: boolean
    hasAnyUnfulfilledCause: boolean
    excludedCauses: Map<string, { causa: string; justificacion: string }>
    seenLines: Set<string>
  }>()

  const matchedCauses = new Set<string>()
  const unclassifiedCauses = new Set<string>()
  const invalidAfectaCauses = new Set<string>()

  rows.forEach((row, index) => {
    const pedidoKey = buildPedidoKey(row)
    const dateKey = getDateKey(readTextValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))

    if (!pedidoKey || !dateKey) {
      return
    }

    const dedupeLine = buildLineKey(row) ?? `${pedidoKey}|__${index}`

    const current = map.get(pedidoKey) ?? {
      key: pedidoKey,
      dateKey,
      programmedTm: 0,
      dispatchedTmFromValidGuia: 0,
      pendingTm: 0,
      evaluatedLineCount: 0,
      hasUnfulfilledEvaluatedLine: false,
      allEvaluatedLinesFulfilled: true,
      hasAffectingUnfulfilledCause: false,
      hasAnyUnfulfilledCause: false,
      excludedCauses: new Map<string, { causa: string; justificacion: string }>(),
      seenLines: new Set<string>(),
    }

    if (current.seenLines.has(dedupeLine)) {
      map.set(pedidoKey, current)
      return
    }

    current.seenLines.add(dedupeLine)
    current.programmedTm += readProgrammedTm(row)
    current.pendingTm += readPendingTmHistoric(row)

    if (hasEvaluatedGuia(row)) {
      const lineDispatchedTm = readDispatchedTmHistoric(row)
      const fulfilledLine = isFulfilledStatus(row)
      const unfulfilledLine = isUnfulfilledStatus(row) || !fulfilledLine

      current.evaluatedLineCount += 1
      current.dispatchedTmFromValidGuia += lineDispatchedTm

      if (unfulfilledLine) {
        current.hasUnfulfilledEvaluatedLine = true
        current.hasAnyUnfulfilledCause = true

        const classification = classifyCause(readCause(row), causeCatalogMap)

        if (classification.matched) {
          matchedCauses.add(classification.motivoOriginal)
          if (classification.isAfectaValueInvalid) {
            invalidAfectaCauses.add(classification.motivoOriginal)
          }
        } else if (classification.causeOriginal.trim()) {
          unclassifiedCauses.add(classification.causeOriginal.trim())
        }

        if (classification.affectsIndicator) {
          current.hasAffectingUnfulfilledCause = true
        } else {
          const key = normalizeCauseComparisonToken(classification.motivoOriginal)
          if (key && !current.excludedCauses.has(key)) {
            current.excludedCauses.set(key, {
              causa: classification.motivoOriginal,
              justificacion: classification.justificacion,
            })
          }
        }
      } else {
      }

      if (!fulfilledLine) {
        current.allEvaluatedLinesFulfilled = false
      }
    }

    map.set(pedidoKey, current)
  })

  return {
    pedidos: Array.from(map.values()).map((pedido) => {
    let status: OrderStatus = 'PENDING_EVALUATION'

    if (pedido.evaluatedLineCount > 0) {
      if (pedido.hasUnfulfilledEvaluatedLine) {
        status = 'UNFULFILLED'
      } else if (pedido.allEvaluatedLinesFulfilled) {
        status = 'FULFILLED'
      } else {
        status = 'UNFULFILLED'
      }
    }

    return {
      key: pedido.key,
      dateKey: pedido.dateKey,
      programmedTm: pedido.programmedTm,
      dispatchedTmFromValidGuia: pedido.dispatchedTmFromValidGuia,
      pendingTm: pedido.pendingTm,
      status,
      hasAffectingUnfulfilledCause: pedido.hasAffectingUnfulfilledCause,
      allUnfulfilledCausesAreNonAffecting: pedido.hasAnyUnfulfilledCause && !pedido.hasAffectingUnfulfilledCause,
      excludedCauses: Array.from(pedido.excludedCauses.values()),
    }
    }),
    diagnostics: {
      matchedCauseCount: matchedCauses.size,
      unclassifiedCauses: Array.from(unclassifiedCauses.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      invalidAfectaCauses: Array.from(invalidAfectaCauses.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    },
  }
}

function summarizeRows(
  detailRows: DashboardRow[],
  mode: HistoricIndicatorMode,
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
): Omit<HistoricPeriodMetrics, 'periodKey' | 'periodLabel'> {
  const { pedidos } = buildPedidoSummaries(detailRows, causeCatalogMap)

  let programmedOrders = 0
  let pendingEvaluationOrders = 0
  let fulfilledOrders = 0
  let unfulfilledOrders = 0
  let excludedOrdersAdjusted = 0
  let tmProgramadas = 0
  let tmDespachadas = 0
  let tmPendientes = 0

  let complianceEvaluatedOrders = 0
  let complianceFulfilledOrders = 0
  let complianceProgrammedTm = 0
  let complianceDispatchedTm = 0
  const excludedCausesAdjustedMap = new Map<string, { causa: string; justificacion: string }>()
  const excludedCauseOrderCounts = new Map<string, { causa: string; justificacion: string; count: number }>()

  const tmByPedido = new Map<string, { programmed: number; dispatched: number }>()
  detailRows.forEach((row, index) => {
    const pedidoKey = buildPedidoKey(row)
    if (!pedidoKey) {
      return
    }

    const lineKey = buildLineKey(row) ?? `${pedidoKey}|__${index}`
    const key = `${pedidoKey}|${lineKey}`
    if (tmByPedido.has(key)) {
      return
    }

    tmByPedido.set(key, {
      programmed: readProgrammedTm(row),
      dispatched: hasEvaluatedGuia(row) ? readDispatchedTmHistoric(row) : 0,
    })

    if (!hasEvaluatedGuia(row)) {
      return
    }

    const lineProgrammedTm = readProgrammedTm(row)
    const lineDispatchedTm = readDispatchedTmHistoric(row)
    const fulfilledLine = isFulfilledStatus(row)
    const unfulfilledLine = isUnfulfilledStatus(row) || !fulfilledLine

    if (mode === 'BRUTO') {
      complianceProgrammedTm += lineProgrammedTm
      complianceDispatchedTm += lineDispatchedTm
      return
    }

    if (!unfulfilledLine) {
      complianceProgrammedTm += lineProgrammedTm
      complianceDispatchedTm += lineDispatchedTm
      return
    }

    const classification = classifyCause(readCause(row), causeCatalogMap)
    if (classification.affectsIndicator) {
      complianceProgrammedTm += lineProgrammedTm
      complianceDispatchedTm += lineDispatchedTm
    }
  })

  for (const pedido of pedidos) {
    programmedOrders += 1
    tmProgramadas += pedido.programmedTm
    tmDespachadas += pedido.dispatchedTmFromValidGuia
    tmPendientes += pedido.pendingTm

    if (pedido.status === 'PENDING_EVALUATION') {
      pendingEvaluationOrders += 1
    } else if (pedido.status === 'FULFILLED') {
      fulfilledOrders += 1
    } else if (pedido.status === 'UNFULFILLED') {
      const shouldExcludeFromAdjusted = mode === 'AJUSTADO' && pedido.allUnfulfilledCausesAreNonAffecting

      if (shouldExcludeFromAdjusted) {
        excludedOrdersAdjusted += 1
        pedido.excludedCauses.forEach((excludedCause) => {
          const key = normalizeCauseComparisonToken(excludedCause.causa)
          if (!key) {
            return
          }

          const currentCount = excludedCauseOrderCounts.get(key)
          if (currentCount) {
            currentCount.count += 1
          } else {
            excludedCauseOrderCounts.set(key, {
              causa: excludedCause.causa,
              justificacion: excludedCause.justificacion,
              count: 1,
            })
          }

          if (excludedCausesAdjustedMap.has(key)) {
            return
          }

          excludedCausesAdjustedMap.set(key, excludedCause)
        })
      } else {
        unfulfilledOrders += 1
      }
    }

    const shouldParticipate = pedido.status !== 'PENDING_EVALUATION' && (
      mode === 'BRUTO'
      || pedido.status === 'FULFILLED'
      || pedido.hasAffectingUnfulfilledCause
      || !pedido.allUnfulfilledCausesAreNonAffecting
    )

    if (shouldParticipate) {
      complianceEvaluatedOrders += 1

      if (pedido.status === 'FULFILLED') {
        complianceFulfilledOrders += 1
      }
    }
  }

  const complianceOrdersPct = complianceEvaluatedOrders > 0
    ? (complianceFulfilledOrders / complianceEvaluatedOrders) * 100
    : (mode === 'AJUSTADO' ? null : 0)
  const complianceTmPct = complianceProgrammedTm > 0
    ? (Math.min(complianceProgrammedTm, complianceDispatchedTm) / complianceProgrammedTm) * 100
    : (mode === 'AJUSTADO' ? null : 0)

  return {
    programmedOrders,
    fulfilledOrders,
    unfulfilledOrders,
    pendingEvaluationOrders,
    complianceOrdersPct,
    complianceTmPct,
    tmProgramadas,
    tmDespachadas,
    tmPendientes,
    excludedOrdersAdjusted,
    excludedCausesAdjusted: Array.from(excludedCauseOrderCounts.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count
      }

      return left.causa.localeCompare(right.causa, 'es', { sensitivity: 'base' })
    }),
  }
}

function buildPeriodRows(
  detailRows: DashboardRow[],
  granularity: HistoricGranularity,
  mode: HistoricIndicatorMode,
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
  previousComplianceByPeriod?: Map<string, number>,
): HistoricComparisonRow[] {
  const detailGrouped = new Map<string, DashboardRow[]>()

  for (const row of detailRows) {
    const dateKey = getDateKey(readTextValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))
    if (!dateKey) {
      continue
    }

    const periodKey = buildPeriodKey(dateKey, granularity)
    const group = detailGrouped.get(periodKey) ?? []
    group.push(row)
    detailGrouped.set(periodKey, group)
  }

  const orderedKeys = Array.from(detailGrouped.keys()).sort((left, right) => left.localeCompare(right))

  return orderedKeys.map((periodKey, index) => {
    const base = summarizeRows(detailGrouped.get(periodKey) ?? [], mode, causeCatalogMap)

    let previousCompliance: number | null = null

    if (index > 0) {
      const previousPeriodKey = orderedKeys[index - 1]
      const previousSummary = summarizeRows(
        detailGrouped.get(previousPeriodKey) ?? [],
        mode,
        causeCatalogMap,
      )
      previousCompliance = previousSummary.complianceOrdersPct
    } else if (previousComplianceByPeriod) {
      previousCompliance = previousComplianceByPeriod.get(periodKey) ?? null
    }

    return {
      periodKey,
      periodLabel: formatPeriodLabel(periodKey, granularity),
      ...base,
      variationVsPreviousPp:
        previousCompliance === null || base.complianceOrdersPct === null
          ? null
          : base.complianceOrdersPct - previousCompliance,
    }
  })
}

function buildPreviousComplianceMap(
  fullDetailRows: DashboardRow[],
  granularity: HistoricGranularity,
  mode: HistoricIndicatorMode,
  causeCatalogMap: Map<string, ExcelCauseCatalogRow>,
  visibleFirstPeriodKey: string | null,
): Map<string, number> {
  const map = new Map<string, number>()

  if (!visibleFirstPeriodKey) {
    return map
  }

  const allRows = buildPeriodRows(fullDetailRows, granularity, mode, causeCatalogMap)
  const firstIndex = allRows.findIndex((row) => row.periodKey === visibleFirstPeriodKey)

  if (firstIndex > 0) {
    const previousCompliance = allRows[firstIndex - 1].complianceOrdersPct
    if (previousCompliance !== null) {
      map.set(visibleFirstPeriodKey, previousCompliance)
    }
  }

  return map
}

export function useHistoricDashboard() {
  const [detailRows, setDetailRows] = useState<DashboardRow[]>([])
  const [status, setStatus] = useState<HistoricStatus>('loading')
  const [error, setError] = useState<SupabaseErrorInfo | null>(null)
  const [monthFrom, setMonthFrom] = useState('')
  const [monthTo, setMonthTo] = useState('')
  const [selectedSector, setSelectedSector] = useState<HistoricSectorFilter>('TODOS')
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [clientQuery, setClientQuery] = useState('')
  const [defaultMonthFrom, setDefaultMonthFrom] = useState('')
  const [defaultMonthTo, setDefaultMonthTo] = useState('')
  const [indicatorMode, setIndicatorMode] = useState<HistoricIndicatorMode>('BRUTO')
  const [causeCatalogSummary, setCauseCatalogSummary] = useState<ExcelCauseCatalogSummary | null>(() => loadCauseCatalogSummary())

  const loadData = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const baseData = await fetchOperationalBaseData()
      const lineasDespachoRows = await fetchAllRowsFromView<DashboardRow>(
        'lineas_despacho',
        1000,
        'fecha,orden_venta,cod_parte,cliente,sector,cant_despachada,status_despacho,tm_programada,tm_despachada,tm_pendiente,causa',
      )
      const rowsWithDate = lineasDespachoRows.filter((row) => {
        const dateKey = getDateKey(readTextValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))
        return Boolean(dateKey)
      })

      setDetailRows(rowsWithDate)
      setCauseCatalogSummary(loadCauseCatalogSummary())

      const monthKeys = baseData.availableMonths
        .map((month) => normalizeMonthValue(month.value))
        .filter((value) => value.length > 0)
        .sort((left, right) => left.localeCompare(right))

      const now = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const defaultMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const initialMonth = monthKeys.includes(defaultMonthKey)
        ? defaultMonthKey
        : (monthKeys[monthKeys.length - 1] ?? '')

      setMonthFrom(initialMonth)
      setMonthTo(initialMonth)
      setDefaultMonthFrom(initialMonth)
      setDefaultMonthTo(initialMonth)

      setStatus(rowsWithDate.length > 0 ? 'success' : 'empty')
    } catch (caughtError) {
      setStatus('error')
      setError(caughtError as SupabaseErrorInfo)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const unsubscribe = subscribeToSupabaseRefresh(() => {
      void loadData()
    })

    return unsubscribe
  }, [loadData])

  const monthRange = useMemo(() => {
    const fromRange = getMonthDateRange(monthFrom)
    const toRange = getMonthDateRange(monthTo)

    if (!fromRange.from || !toRange.to) {
      return { from: '', to: '', fromMonth: '', toMonth: '' }
    }

    if (fromRange.from <= toRange.to) {
      return { from: fromRange.from, to: toRange.to, fromMonth: monthFrom, toMonth: monthTo }
    }

    return { from: toRange.from, to: fromRange.to, fromMonth: monthTo, toMonth: monthFrom }
  }, [monthFrom, monthTo])

  const granularity: HistoricGranularity = useMemo(() => {
    if (!monthRange.fromMonth || !monthRange.toMonth) {
      return 'month'
    }

    return monthRange.fromMonth === monthRange.toMonth ? 'day' : 'month'
  }, [monthRange.fromMonth, monthRange.toMonth])

  const rowsByTemporalScope = useMemo(() => detailRows.filter((row) => {
    const dateKey = getDateKey(readTextValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))
    if (!dateKey) {
      return false
    }

    if (monthRange.from && dateKey < monthRange.from) {
      return false
    }

    if (monthRange.to && dateKey > monthRange.to) {
      return false
    }

    return true
  }), [detailRows, monthRange.from, monthRange.to])

  const selectedClientSector = useMemo<SectorValue | null>(() => {
    if (!selectedClient) {
      return null
    }

    const normalizedClient = normalizeText(selectedClient)
    if (!normalizedClient) {
      return null
    }

    for (const row of detailRows) {
      if (normalizeText(readClient(row)) !== normalizedClient) {
        continue
      }

      const sector = readSector(row)
      if (sector) {
        return sector
      }
    }

    return null
  }, [detailRows, selectedClient])

  const effectiveSector = selectedClientSector ?? selectedSector

  const rowsBySectorScope = useMemo(() => {
    if (effectiveSector === 'TODOS') {
      return rowsByTemporalScope
    }

    return rowsByTemporalScope.filter((row) => readSector(row) === effectiveSector)
  }, [effectiveSector, rowsByTemporalScope])

  const rowsByContextFilters = useMemo(() => rowsBySectorScope.filter((row) => {
    if (!selectedClient) {
      return true
    }

    return normalizeText(readClient(row)) === normalizeText(selectedClient)
  }), [rowsBySectorScope, selectedClient])

  const fullRowsBySector = useMemo(() => {
    if (effectiveSector === 'TODOS') {
      return detailRows
    }

    return detailRows.filter((row) => readSector(row) === effectiveSector)
  }, [detailRows, effectiveSector])

  const fullRowsByContext = useMemo(() => fullRowsBySector.filter((row) => {
    if (!selectedClient) {
      return true
    }

    return normalizeText(readClient(row)) === normalizeText(selectedClient)
  }), [fullRowsBySector, selectedClient])

  const availableClients = useMemo(() => listUniqueOptions(rowsBySectorScope, readClient), [rowsBySectorScope])

  const matchingClients = useMemo(() => {
    const normalizedQuery = normalizeText(clientQuery)
    const selectable = availableClients.filter((client) => client !== selectedClient)

    if (!normalizedQuery) {
      return selectable.slice(0, 8)
    }

    return selectable.filter((client) => normalizeText(client).includes(normalizedQuery)).slice(0, 8)
  }, [availableClients, clientQuery, selectedClient])

  const causeCatalogMap = useMemo(() => buildCauseCatalogMap(causeCatalogSummary), [causeCatalogSummary])
  const realMatchedCauseCount = useMemo(
    () => countRealMatchedCauses(detailRows, causeCatalogMap),
    [causeCatalogMap, detailRows],
  )

  const adjustedDiagnostics = useMemo(() => buildPedidoSummaries(fullRowsByContext, causeCatalogMap).diagnostics, [causeCatalogMap, fullRowsByContext])

  const adjustedModeInfo = useMemo<HistoricAdjustedModeInfo>(() => {
    if (!causeCatalogSummary || !causeCatalogSummary.foundSheet) {
      return {
        enabled: false,
        message: 'No se encontró la hoja "Causas". El modo Ajustado no está disponible.',
        foundSheet: false,
        validRows: 0,
        causesWithSi: 0,
        causesWithNo: 0,
        causesWithEmptyOrInvalid: 0,
        matchedCauses: 0,
      }
    }

    if (causeCatalogSummary.missingRequiredHeaders.length > 0) {
      return {
        enabled: false,
        message: `No se puede calcular Ajustado: faltan encabezados en "Causas": ${causeCatalogSummary.missingRequiredHeaders.join(', ')}.`,
        foundSheet: true,
        validRows: causeCatalogSummary.validRows,
        causesWithSi: causeCatalogSummary.causesWithSi,
        causesWithNo: causeCatalogSummary.causesWithNo,
        causesWithEmptyOrInvalid: causeCatalogSummary.causesWithEmptyOrInvalid,
        matchedCauses: adjustedDiagnostics.matchedCauseCount,
      }
    }

    if (causeCatalogMap.size === 0) {
      return {
        enabled: false,
        message: 'No se puede calcular Ajustado: el catálogo de la hoja "Causas" está vacío.',
        foundSheet: true,
        validRows: causeCatalogSummary.validRows,
        causesWithSi: causeCatalogSummary.causesWithSi,
        causesWithNo: causeCatalogSummary.causesWithNo,
        causesWithEmptyOrInvalid: causeCatalogSummary.causesWithEmptyOrInvalid,
        matchedCauses: 0,
      }
    }

    if (realMatchedCauseCount === 0) {
      return {
        enabled: false,
        message: 'No existen coincidencias entre la columna Causa de la hoja "26" y la columna MOTIVOS de la hoja "Causas".',
        foundSheet: true,
        validRows: causeCatalogSummary.validRows,
        causesWithSi: causeCatalogSummary.causesWithSi,
        causesWithNo: causeCatalogSummary.causesWithNo,
        causesWithEmptyOrInvalid: causeCatalogSummary.causesWithEmptyOrInvalid,
        matchedCauses: 0,
      }
    }

    return {
      enabled: true,
      message: causeCatalogSummary.message,
      foundSheet: true,
      validRows: causeCatalogSummary.validRows,
      causesWithSi: causeCatalogSummary.causesWithSi,
      causesWithNo: causeCatalogSummary.causesWithNo,
      causesWithEmptyOrInvalid: causeCatalogSummary.causesWithEmptyOrInvalid,
      matchedCauses: realMatchedCauseCount,
    }
  }, [adjustedDiagnostics.matchedCauseCount, causeCatalogMap.size, causeCatalogSummary, realMatchedCauseCount])

  useEffect(() => {
    adjustedDiagnostics.unclassifiedCauses.forEach((cause) => {
      console.warn(`[Historico][Ajustado] Causa no clasificada en hoja Causas: ${cause}`)
    })

    adjustedDiagnostics.invalidAfectaCauses.forEach((cause) => {
      console.warn(`[Historico][Ajustado] Clasificación incompleta en Causas (AFECTA AL INDICADOR vacío o inválido): ${cause}`)
    })
  }, [adjustedDiagnostics.invalidAfectaCauses, adjustedDiagnostics.unclassifiedCauses])

  const effectiveIndicatorMode: HistoricIndicatorMode = indicatorMode === 'AJUSTADO' && !adjustedModeInfo.enabled
    ? 'BRUTO'
    : indicatorMode

  useEffect(() => {
    if (indicatorMode === 'AJUSTADO' && !adjustedModeInfo.enabled) {
      setIndicatorMode('BRUTO')
    }
  }, [adjustedModeInfo.enabled, indicatorMode])

  const provisionalRows = useMemo(
    () => buildPeriodRows(rowsByContextFilters, granularity, effectiveIndicatorMode, causeCatalogMap),
    [causeCatalogMap, effectiveIndicatorMode, granularity, rowsByContextFilters],
  )

  const previousComplianceByPeriod = useMemo(
    () => buildPreviousComplianceMap(
      fullRowsByContext,
      granularity,
      effectiveIndicatorMode,
      causeCatalogMap,
      provisionalRows[0]?.periodKey ?? null,
    ),
    [causeCatalogMap, effectiveIndicatorMode, fullRowsByContext, granularity, provisionalRows],
  )

  const comparisonRows = useMemo(
    () => buildPeriodRows(rowsByContextFilters, granularity, effectiveIndicatorMode, causeCatalogMap, previousComplianceByPeriod),
    [causeCatalogMap, effectiveIndicatorMode, granularity, previousComplianceByPeriod, rowsByContextFilters],
  )

  const comparisonRowsForCharts = useMemo(() => {
    const chartRows = rowsByContextFilters.filter((row) => hasEvaluatedGuia(row))
    return buildPeriodRows(chartRows, granularity, effectiveIndicatorMode, causeCatalogMap, previousComplianceByPeriod)
  }, [causeCatalogMap, effectiveIndicatorMode, granularity, previousComplianceByPeriod, rowsByContextFilters])

  const totalSummary = useMemo(
    () => summarizeRows(rowsByContextFilters, effectiveIndicatorMode, causeCatalogMap),
    [causeCatalogMap, effectiveIndicatorMode, rowsByContextFilters],
  )

  const cards = useMemo<HistoricKpiCard[]>(() => [
    { title: 'Pedidos programados', mainValue: totalSummary.programmedOrders, unit: 'count' },
    { title: 'Pedidos cumplidos', mainValue: totalSummary.fulfilledOrders, unit: 'count' },
    { title: 'Pedidos incumplidos', mainValue: totalSummary.unfulfilledOrders, unit: 'count' },
    { title: 'Cumplimiento por pedidos', mainValue: totalSummary.complianceOrdersPct, unit: 'percent' },
    { title: 'TM programadas', mainValue: totalSummary.tmProgramadas, unit: 'tm' },
    { title: 'TM despachadas', mainValue: totalSummary.tmDespachadas, unit: 'tm' },
    { title: 'TM pendientes', mainValue: totalSummary.tmPendientes, unit: 'tm' },
    { title: 'Cumplimiento por TM', mainValue: totalSummary.complianceTmPct, unit: 'percent' },
  ], [
    totalSummary.complianceOrdersPct,
    totalSummary.complianceTmPct,
    totalSummary.fulfilledOrders,
    totalSummary.programmedOrders,
    totalSummary.tmDespachadas,
    totalSummary.tmPendientes,
    totalSummary.tmProgramadas,
    totalSummary.unfulfilledOrders,
  ])

  const sectorSummary = useMemo<HistoricSummaryRow[]>(() => {
    const allSummary = summarizeRows(rowsByContextFilters, effectiveIndicatorMode, causeCatalogMap)
    const agroRows = rowsByContextFilters.filter((row) => readSector(row) === 'AGRO')
    const domesticoRows = rowsByContextFilters.filter((row) => readSector(row) === 'DOMESTICO')
    const agroSummary = summarizeRows(agroRows, effectiveIndicatorMode, causeCatalogMap)
    const domesticoSummary = summarizeRows(domesticoRows, effectiveIndicatorMode, causeCatalogMap)

    const part = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0)

    return [
      {
        label: 'TM PROGRAMADAS',
        totalValue: allSummary.tmProgramadas,
        agroValue: agroSummary.tmProgramadas,
        domesticoValue: domesticoSummary.tmProgramadas,
        agroPartPct: part(agroSummary.tmProgramadas, allSummary.tmProgramadas),
        domesticoPartPct: part(domesticoSummary.tmProgramadas, allSummary.tmProgramadas),
      },
      {
        label: 'TM DESPACHADAS',
        totalValue: allSummary.tmDespachadas,
        agroValue: agroSummary.tmDespachadas,
        domesticoValue: domesticoSummary.tmDespachadas,
        agroPartPct: part(agroSummary.tmDespachadas, allSummary.tmDespachadas),
        domesticoPartPct: part(domesticoSummary.tmDespachadas, allSummary.tmDespachadas),
      },
      {
        label: 'TM PENDIENTES',
        totalValue: allSummary.tmPendientes,
        agroValue: agroSummary.tmPendientes,
        domesticoValue: domesticoSummary.tmPendientes,
        agroPartPct: part(agroSummary.tmPendientes, allSummary.tmPendientes),
        domesticoPartPct: part(domesticoSummary.tmPendientes, allSummary.tmPendientes),
      },
      {
        label: '% CUMPLIMIENTO',
        totalValue: allSummary.complianceTmPct,
        agroValue: agroSummary.complianceTmPct,
        domesticoValue: domesticoSummary.complianceTmPct,
        agroPartPct: null,
        domesticoPartPct: null,
      },
    ]
  }, [causeCatalogMap, effectiveIndicatorMode, rowsByContextFilters])

  const addClient = useCallback((client: string) => {
    const trimmed = client.trim()
    if (!trimmed) {
      return
    }

    setSelectedClient(trimmed)
    setClientQuery('')
    const normalizedClient = normalizeText(trimmed)
    if (!normalizedClient) {
      return
    }

    const clientRow = detailRows.find((row) => normalizeText(readClient(row)) === normalizedClient)
    const clientSector = clientRow ? readSector(clientRow) : null
    if (clientSector) {
      setSelectedSector(clientSector)
    }
  }, [detailRows])

  const removeClient = useCallback(() => {
    setSelectedClient(null)
    setSelectedSector('TODOS')
  }, [])

  useEffect(() => {
    if (!selectedClient) {
      return
    }

    const existsInScope = rowsByTemporalScope.some((row) => normalizeText(readClient(row)) === normalizeText(selectedClient))
    if (!existsInScope) {
      setSelectedClient(null)
      setSelectedSector('TODOS')
      setClientQuery('')
      return
    }

    if (selectedClientSector && selectedSector !== selectedClientSector) {
      setSelectedSector(selectedClientSector)
    }
  }, [rowsByTemporalScope, selectedClient, selectedClientSector, selectedSector])

  useEffect(() => {
    if (!selectedClient) {
      return
    }

    const stillAvailable = availableClients.some((client) => normalizeText(client) === normalizeText(selectedClient))
    if (!stillAvailable) {
      setSelectedClient(null)
      setSelectedSector('TODOS')
    }
  }, [availableClients, selectedClient])

  const handleSectorChange = useCallback((sector: HistoricSectorFilter) => {
    if (selectedClient) {
      return
    }

    setSelectedSector(sector)
  }, [selectedClient])

  const resetFilters = useCallback(() => {
    setMonthFrom(defaultMonthFrom)
    setMonthTo(defaultMonthTo)
    setSelectedSector('TODOS')
    setSelectedClient(null)
    setClientQuery('')
  }, [defaultMonthFrom, defaultMonthTo])

  const hasActiveFilters = useMemo(() => (
    monthFrom !== defaultMonthFrom
    || monthTo !== defaultMonthTo
    || selectedSector !== 'TODOS'
    || selectedClient !== null
    || clientQuery.trim().length > 0
  ), [
    clientQuery,
    defaultMonthFrom,
    defaultMonthTo,
    monthFrom,
    monthTo,
    selectedClient,
    selectedSector,
  ])

  const selectedSectorLabel = effectiveSector === 'TODOS' ? 'Todos los sectores' : sectorLabelMap[effectiveSector]

  return {
    status,
    error,
    cards,
    comparisonRows,
    comparisonRowsForCharts,
    sectorSummary,
    indicatorMode,
    setIndicatorMode,
    adjustedModeInfo,
    selectedSector,
    selectedSectorLabel,
    monthFrom,
    monthTo,
    setMonthFrom,
    setMonthTo,
    selectedClient,
    clientQuery,
    setClientQuery,
    matchingClients,
    addClient,
    removeClient,
    setSelectedSector: handleSectorChange,
    hasActiveFilters,
    resetFilters,
    isEmptyData: rowsByContextFilters.length === 0,
    isClientSectorLocked: Boolean(selectedClientSector),
  }
}
