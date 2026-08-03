import type { OperationalInsightCrossFilter } from '../types/operationalInsights'

export type OperationalDetailRow = Record<string, unknown>

function normalizeMonthToken(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const text = String(value).trim()
  if (!text) {
    return null
  }

  if (/^\d{4}-\d{2}$/.test(text)) {
    return text
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.slice(0, 7)
  }

  return null
}

function getValue(row: OperationalDetailRow, candidates: string[]): unknown {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase())

  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.includes(key.toLowerCase())) {
      return value
    }
  }

  return null
}

export function normalizeText(value: unknown): string {
  return (value ?? '')
    .toString()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(typeof value === 'string' ? value.trim() : value)
  return Number.isFinite(parsed) ? parsed : null
}

export function readTextValue(row: OperationalDetailRow, candidates: string[]): string | null {
  const value = getValue(row, candidates)

  if (value === null || value === undefined) {
    return null
  }

  const text = String(value).trim()
  return text || null
}

export function readNumericValue(row: OperationalDetailRow, candidates: string[]): number | null {
  return toNumber(getValue(row, candidates))
}

export function getDateKey(value: unknown): string | null {
  if (!value) {
    return null
  }

  const text = String(value).trim()
  if (!text) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.slice(0, 10)
  }

  return null
}

export function getMonthKeyFromDate(value: unknown): string | null {
  const dateKey = getDateKey(value)
  return dateKey ? dateKey.slice(0, 7) : null
}

export function buildPedidoKey(row: OperationalDetailRow): string | null {
  const dateKey = getDateKey(getValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))
  const ov = readTextValue(row, ['ov', 'orden_venta', 'ordenventa', 'pedido', 'numero_pedido'])
  const pedidoId = readTextValue(row, ['pedido_id', 'id_pedido'])

  if (dateKey && ov) {
    return `${dateKey}|${ov}`
  }

  if (dateKey && pedidoId) {
    return `${dateKey}|${pedidoId}`
  }

  return pedidoId ?? null
}

export function buildLineKey(row: OperationalDetailRow): string | null {
  return readTextValue(row, [
    'linea_id',
    'id_linea',
    'linea',
    'detalle_id',
    'item',
    'item_id',
    'cod_parte',
    'codigo_parte',
    'material',
    'sku',
    'producto',
  ])
}

export function readClientName(row: OperationalDetailRow): string | null {
  return readTextValue(row, ['cliente', 'cliente_nombre', 'razon_social', 'customer'])
}

export function readAreaName(row: OperationalDetailRow): string | null {
  return readTextValue(row, ['area', 'area_nombre'])
}

export function readCauseName(row: OperationalDetailRow): string | null {
  return readTextValue(row, ['causa', 'causa_nombre'])
}

export function readProgrammedTm(row: OperationalDetailRow): number {
  return readNumericValue(row, ['tm_programada', 'tm_programadas', 'tm_programado', 'tm_programada_total']) ?? 0
}

export function readDispatchedTm(row: OperationalDetailRow): number {
  return readNumericValue(row, ['tm_despachada', 'tm_despachadas', 'tm_despa', 'tm_despachadas_total']) ?? 0
}

export function readPendingTm(row: OperationalDetailRow): number {
  const candidates = [
    'tm_pendiente_linea',
    'tm_pendiente_causa',
    'tm_pendiente_area',
    'tm_pendiente_cliente',
    'tm_pendiente_tm',
    'tm_pte',
    'tm_pend',
    'tm_pendiente',
    'tm_pendientes',
    'tm_por_despachar',
    'tm_pendiente_total',
  ]

  return readNumericValue(row, candidates) ?? 0
}

export function isBlankOrValue(value: unknown, invalidValue: string): boolean {
  const normalized = normalizeText(value)
  return !normalized || normalized === normalizeText(invalidValue)
}

export function matchesSelectedClients(row: OperationalDetailRow, selectedClients: string[]): boolean {
  if (selectedClients.length === 0) {
    return true
  }

  const client = normalizeText(readClientName(row))
  if (!client) {
    return false
  }

  const selectedClientSet = new Set(selectedClients.map((item) => normalizeText(item)).filter(Boolean))
  return selectedClientSet.has(client)
}

export function filterRowsBySelectedMonths<T extends OperationalDetailRow>(rows: T[], selectedMonths: string[]): T[] {
  if (selectedMonths.length === 0) {
    return rows
  }

  const monthSet = new Set(
    selectedMonths
      .map((month) => normalizeMonthToken(month))
      .filter((month): month is string => Boolean(month)),
  )

  if (monthSet.size === 0) {
    return rows
  }

  return rows.filter((row) => {
    const monthFromDate = getMonthKeyFromDate(getValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))
    const monthFromToken = normalizeMonthToken(getValue(row, ['mes', 'month', 'periodo', 'period', 'periodo_mes', 'mes_numero', 'month_number']))
    const monthKey = monthFromDate ?? monthFromToken
    return monthKey ? monthSet.has(monthKey) : false
  })
}

export function applyCrossFilters<T extends OperationalDetailRow>(rows: T[], crossFilters: OperationalInsightCrossFilter[]): T[] {
  if (crossFilters.length === 0) {
    return rows
  }

  return rows.filter((row) => crossFilters.every((filter) => normalizeText(row[filter.key]) === normalizeText(filter.value)))
}

export function isIncumplidoRow(row: OperationalDetailRow): boolean {
  if ((readNumericValue(row, ['pedidos_incumplidos', 'incumplidos']) ?? 0) > 0) {
    return true
  }

  const statusText = normalizeText(readTextValue(row, ['estado', 'estado_pedido', 'status', 'estatus', 'seguimiento']))
  if (statusText.includes('seguimiento') || statusText.includes('incumpl')) {
    return true
  }

  const totalPedidos = readNumericValue(row, ['total_pedidos', 'pedidos_total', 'cantidad_pedidos'])
  const pedidosCumplidos = readNumericValue(row, ['pedidos_cumplidos', 'cumplidos'])

  if (totalPedidos !== null && totalPedidos > 0 && pedidosCumplidos !== null) {
    return pedidosCumplidos < totalPedidos
  }

  return false
}

export interface AggregatedPedido {
  key: string
  dateKey: string | null
  client: string | null
  programmedTm: number
  dispatchedTm: number
  pendingTm: number
  isIncumplido: boolean
}

export function aggregatePedidos(rows: OperationalDetailRow[]): AggregatedPedido[] {
  const map = new Map<string, AggregatedPedido & { seenLineKeys: Set<string> }>()

  for (const row of rows) {
    const pedidoKey = buildPedidoKey(row)
    if (!pedidoKey) {
      continue
    }

    const lineKey = buildLineKey(row) ?? '__pedido__'
    const current = map.get(pedidoKey) ?? {
      key: pedidoKey,
      dateKey: getDateKey(readTextValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido'])),
      client: readClientName(row),
      programmedTm: 0,
      dispatchedTm: 0,
      pendingTm: 0,
      isIncumplido: false,
      seenLineKeys: new Set<string>(),
    }

    if (!current.seenLineKeys.has(lineKey)) {
      current.seenLineKeys.add(lineKey)
      current.programmedTm += readProgrammedTm(row)
      current.dispatchedTm += readDispatchedTm(row)
      current.pendingTm += readPendingTm(row)
    }

    current.isIncumplido = current.isIncumplido || isIncumplidoRow(row)
    current.client = current.client ?? readClientName(row)
    current.dateKey = current.dateKey ?? getDateKey(readTextValue(row, ['fecha', 'fecha_programacion', 'fecha_pedido']))
    map.set(pedidoKey, current)
  }

  return Array.from(map.values()).map(({ seenLineKeys: _seenLineKeys, ...pedido }) => pedido)
}