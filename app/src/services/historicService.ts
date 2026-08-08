import { fetchAllRowsFromView } from './supabasePagination'

export type HistoricDashboardRow = Record<string, unknown>

let historicDashboardRowsPromise: Promise<HistoricDashboardRow[]> | null = null

export function invalidateHistoricDashboardCache(): void {
  historicDashboardRowsPromise = null
}

export function fetchHistoricDashboardRows(): Promise<HistoricDashboardRow[]> {
  if (historicDashboardRowsPromise) {
    return historicDashboardRowsPromise
  }

  historicDashboardRowsPromise = fetchAllRowsFromView<HistoricDashboardRow>(
    'lineas_despacho',
    1000,
    'fecha,orden_venta,cod_parte,cliente,sector,cant_despachada,status_despacho,tm_programada,tm_despachada,tm_pendiente,causa',
  )
    .then((rows) => rows.map((row) => ({
      ...row,
      has_guia: row.cant_despachada !== null && row.cant_despachada !== undefined,
    })))
    .catch((error) => {
      historicDashboardRowsPromise = null
      throw error
    })

  return historicDashboardRowsPromise
}
