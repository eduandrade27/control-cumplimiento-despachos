import type { AvailableMonthOption, SupabaseErrorInfo } from './operational'

export type CausesAnalysisStatus = 'loading' | 'success' | 'empty' | 'error'

export type CausesIndicatorMode = 'BRUTO' | 'AJUSTADO'

export type CauseCatalogClassification = 'SI' | 'NO' | 'UNCLASSIFIED'

export type CausesSectorFilter = 'TODOS' | 'AGRO' | 'DOMESTICO'

export type CausesTableSortKey = 'TM' | 'PEDIDOS'

export type CausesPrioritizationCategory =
  | 'ALTA_FRECUENCIA_ALTO_IMPACTO'
  | 'ALTA_FRECUENCIA_BAJO_IMPACTO'
  | 'BAJA_FRECUENCIA_ALTO_IMPACTO'
  | 'BAJA_FRECUENCIA_BAJO_IMPACTO'

export interface CauseCatalogMeta {
  matched: boolean
  affectsIndicator: boolean
  classification: CauseCatalogClassification
  area: string
  justificacion: string
}

export interface CauseOperationalRow {
  causa: string
  area: string
  affectsIndicator: boolean
  catalogClassification: CauseCatalogClassification
  justificacion: string
  pedidos: number
  tmPendiente: number
}

export interface CausesYearSnapshot {
  monthKey: string
  month: number
  rows: CauseOperationalRow[]
}

export interface CausesHistoricalMonthSnapshot {
  monthKey: string
  month: number
  rows: CauseOperationalRow[]
}

export interface CausesAdjustedModeInfo {
  enabled: boolean
  message: string
}

export interface CausesAnalysisSummary {
  pedidosIncumplidos: number
  tmPendientes: number
  tmPendientesTotales: number
  impactoTotalTm: number
  availableMonths: AvailableMonthOption[]
  availableYears: number[]
  selectedYear: number | null
  selectedMonths: string[]
  selectedSector: CausesSectorFilter
  indicatorMode: CausesIndicatorMode
  adjustedModeInfo: CausesAdjustedModeInfo
  availableClients: string[]
  rows: CauseOperationalRow[]
  yearSnapshots: CausesYearSnapshot[]
  historicalMonthSnapshots: CausesHistoricalMonthSnapshot[]
  excludedRows: CauseOperationalRow[]
  hasActiveFilters: boolean
}

export interface CausesAnalysisHookResult extends CausesAnalysisSummary {
  status: CausesAnalysisStatus
  error: SupabaseErrorInfo | null
  changeYear: (year: number) => void
  toggleMonth: (monthKey: string) => void
  setSelectedSector: (sector: CausesSectorFilter) => void
  setIndicatorMode: (mode: CausesIndicatorMode) => void
  resetFilters: () => void
}
