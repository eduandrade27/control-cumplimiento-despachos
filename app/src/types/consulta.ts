import type { AvailableMonthOption } from './operational'

export interface ConsultaPedidoRow {
  id: string
  sourceIndex: number
  dateKey: string
  fechaLabel: string
  year: number
  month: number
  day: number
  ordenVenta: string
  codigoParte: string
  cliente: string
  cantSolicitada: number | null
  ingresoAlmacen: number | null
  cantDespachada: number | null
  asistente: string
  causa: string
}

export interface ConsultaFiltersState {
  availableYears: number[]
  availableMonths: AvailableMonthOption[]
  selectedYear: number | null
  selectedMonths: string[]
  selectedDay: number | null
  selectedAssistant: string
  selectedClients: string[]
}
