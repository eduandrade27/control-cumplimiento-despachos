export type HistoricStatus = 'loading' | 'success' | 'empty' | 'error'

export type HistoricGranularity = 'day' | 'month'

export type HistoricSectorFilter = 'TODOS' | 'AGRO' | 'DOMESTICO'

export type HistoricIndicatorMode = 'BRUTO' | 'AJUSTADO'

export type HistoricEvolutionMetric = 'TM' | 'PEDIDOS'

export interface HistoricPeriodMetrics {
  periodKey: string
  periodLabel: string
  programmedOrders: number
  fulfilledOrders: number | null
  unfulfilledOrders: number | null
  pendingEvaluationOrders: number
  complianceOrdersPct: number | null
  complianceTmPct: number | null
  tmProgramadas: number
  tmDespachadas: number
  tmPendientes: number | null
  excludedOrdersAdjusted: number
  excludedCausesAdjusted: Array<{
    causa: string
    justificacion: string
    count: number
  }>
}

export interface HistoricComparisonRow extends HistoricPeriodMetrics {
  variationVsPreviousPp: number | null
}

export interface HistoricSummaryRow {
  label: 'TM PROGRAMADAS' | 'TM DESPACHADAS' | 'TM PENDIENTES' | '% CUMPLIMIENTO'
  totalValue: number | null
  agroValue: number | null
  domesticoValue: number | null
  agroPartPct: number | null
  domesticoPartPct: number | null
}

export interface HistoricKpiCard {
  title: string
  mainValue: number | null
  unit?: 'count' | 'percent' | 'tm'
}

export interface HistoricAdjustedModeInfo {
  enabled: boolean
  message: string
  foundSheet: boolean
  validRows: number
  causesWithSi: number
  causesWithNo: number
  causesWithEmptyOrInvalid: number
  matchedCauses: number
}
