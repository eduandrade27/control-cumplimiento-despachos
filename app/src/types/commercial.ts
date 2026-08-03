import type { AvailableMonthOption } from './operational'

export interface CommercialKpis {
  tmPendientes: number
  pedidosIncumplidos: number
  clientesAfectados: number
  vendedoresInvolucrados: number
}

export interface CommercialCauseRow {
  causa: string
  tmPendiente: number
  pedidosIncumplidos: number
}

export interface CommercialDetailCauseRow {
  causa: string
  tmPendiente: number
  pedidosIncumplidos: number
}

export interface CommercialDetailRow {
  key: string
  cliente: string
  vendedor: string
  tmPendiente: number
  causes: CommercialDetailCauseRow[]
}

export interface CommercialDashboardData {
  detailRows: Record<string, unknown>[]
  causeRows: Record<string, unknown>[]
  areaRows: Record<string, unknown>[]
  availableMonths: AvailableMonthOption[]
}
