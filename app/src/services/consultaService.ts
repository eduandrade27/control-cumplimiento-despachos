import { fetchAllRowsFromView } from './supabasePagination'

export async function fetchConsultaPedidosRows(): Promise<Record<string, unknown>[]> {
  return fetchAllRowsFromView<Record<string, unknown>>(
    'lineas_despacho',
    1000,
    'fecha,orden_venta,cliente,cod_parte,cant_solicitada,ingreso_almacen,cant_despachada,asistente,causa',
  )
}
