export interface OperationalInsightRow {
  id?: string | number
  fecha?: string | null
  mes?: string | null
  anio?: number | string | null
  causa?: string | null
  area?: string | null
  cliente?: string | null
  ov?: string | null
  pedido_id?: string | number | null
  pedidos_incumplidos?: number | null
  tm_pendiente?: number | null
  tm_pendiente_linea?: number | null
  tm_pendiente_causa?: number | null
  tm_pendiente_tm?: number | null
  tm_pte?: number | null
  tm_programada?: number | null
  tm_despachada?: number | null
  cumplimiento_pct?: number | null
  cumplimiento?: number | null
  pedidos_cumplidos?: number | null
  total_pedidos?: number | null
  linea_id?: string | number | null
  [key: string]: unknown
}

export interface OperationalInsightSeriesPoint {
  label: string
  value: number | null
  secondaryValue?: number | null
  pedidosCumplidos?: number | null
  totalPedidos?: number | null
  dateKey?: string
}

export interface OperationalInsightCrossFilter {
  key: 'causa' | 'area' | 'cliente'
  value: string
}

export interface CauseTableRow {
  causa: string
  tmPendiente: number
  pedidosIncumplidos: number
  pedidosUnicos: number
}

export interface OperationalTopRow {
  name: string
  tmPendiente: number
  pedidosIncumplidos: number
}

export interface OperationalInsightsData {
  temporalSeries: OperationalInsightSeriesPoint[]
  incumplimientosSeries: OperationalInsightSeriesPoint[]
  volumeSeries: OperationalInsightSeriesPoint[]
  areaIncidents: OperationalInsightSeriesPoint[]
  areaPendingTm: OperationalInsightSeriesPoint[]
  topCauseRows: OperationalTopRow[]
  topClientRows: OperationalTopRow[]
  availableClients: string[]
}
