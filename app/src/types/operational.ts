export interface SupabaseErrorInfo {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export interface AvailableMonthOption {
  value: string
  label: string
  year: number
  month: number
}

export interface OperationalKpiSummary {
  monthKey: string | null
  year: number | null
  month: number | null
  monthLabel: string | null
  tmProgramadas: number | null
  tmDespachadas: number | null
  tmPendientes: number | null
  totalPedidos: number | null
  pedidosCumplidos: number | null
  pedidosIncumplidos: number | null
  clientesAfectados: number | null
  cumplimientoPct: number | null
  promedioDiarioTmProgramadas: number | null
}

export interface OperationalDashboardData {
  monthlyRows: Record<string, unknown>[]
  dailyRows: Record<string, unknown>[]
  detailRows: Record<string, unknown>[]
  availableMonths: AvailableMonthOption[]
}

export type OperationalDashboardStatus = 'loading' | 'success' | 'empty' | 'error'
