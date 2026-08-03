import { normalizeExcelDateValue } from '../lib/excel'
import { supabase } from '../lib/supabase'
import type { ExcelImportMetadata, ExcelLineaDespachoPayload } from '../types/excel'

export interface SupabaseErrorInfo {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export interface ExcelLoadProgress {
  processedRows: number
  totalRows: number
  message: string
}

export interface ExcelLoadResult {
  ok: boolean
  message: string
  rowsRead: number
  rowsImported: number
  loadId?: string
  error?: SupabaseErrorInfo
}

interface LineaDespachoRow extends ExcelLineaDespachoPayload {
  fila_excel: number
  fecha: string | null
  orden_venta: string | null
  cod_parte: string | null
  oc: string | null
  cliente: string | null
  descripcion: string | null
  cant_solicitada: number | null
  ingreso_produccion: number | null
  ingreso_almacen: number | null
  kardex: string | null
  cant_despachada: number | null
  tm_despachada: number | null
  tm_pendiente: number | null
  tm_programada: number | null
  status_despacho: string | null
  causa: string | null
  area: string | null
  asistente: string | null
  sector: string | null
  vendedor: string | null
}

const BATCH_SIZE = 500

function normalizeHeader(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }

  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim().toLowerCase()
}

function normalizeTextValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return String(value).trim() || null
}

function normalizeNumericValue(value: unknown, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (trimmed.length === 0) {
      return fallback
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toPostgresDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toSupabaseError(error: unknown): SupabaseErrorInfo {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>

    return {
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
      hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Error desconocido al cargar el archivo.',
  }
}

function getHeaderValue(row: unknown[], headers: string[], aliases: string[]): unknown {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header))

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias)
    const index = normalizedHeaders.indexOf(normalizedAlias)

    if (index !== -1) {
      return row[index]
    }
  }

  return null
}

function buildRowFromExcel(row: unknown[], headers: string[], cargaId: string, filaExcel: number, anioPrograma: number): LineaDespachoRow {
  const fechaValue = normalizeExcelDateValue(getHeaderValue(row, headers, ['Fecha']), anioPrograma)

  return {
    fila_excel: filaExcel,
    fecha: fechaValue.normalizedDate,
    orden_venta: normalizeTextValue(getHeaderValue(row, headers, ['N° Orden Venta'])),
    cod_parte: normalizeTextValue(getHeaderValue(row, headers, ['Cod. Parte'])),
    oc: normalizeTextValue(getHeaderValue(row, headers, ['OC'])),
    cliente: normalizeTextValue(getHeaderValue(row, headers, ['Cliente'])),
    descripcion: normalizeTextValue(getHeaderValue(row, headers, ['Descripción'])),
    cant_solicitada: normalizeNumericValue(getHeaderValue(row, headers, ['Cant. Solicitada'])),
    ingreso_produccion: normalizeNumericValue(getHeaderValue(row, headers, ['Ingreso Producc'])),
    ingreso_almacen: normalizeNumericValue(getHeaderValue(row, headers, ['Ingreso almacen']), 0),
    kardex: normalizeTextValue(getHeaderValue(row, headers, ['kardex'])),
    cant_despachada: normalizeNumericValue(getHeaderValue(row, headers, ['GUIA', 'Guía'])),
    tm_despachada: normalizeNumericValue(getHeaderValue(row, headers, ['Tm despachado'])),
    tm_pendiente: normalizeNumericValue(getHeaderValue(row, headers, ['Tm por despachar'])),
    tm_programada: normalizeNumericValue(getHeaderValue(row, headers, ['Tm Proyectado'])),
    status_despacho: normalizeTextValue(getHeaderValue(row, headers, ['Status despacho'])),
    causa: normalizeTextValue(getHeaderValue(row, headers, ['Causas'])),
    area: normalizeTextValue(getHeaderValue(row, headers, ['ÁREA'])),
    asistente: normalizeTextValue(getHeaderValue(row, headers, ['ASISTENTE'])),
    sector: normalizeTextValue(getHeaderValue(row, headers, ['SECTOR'])),
    vendedor: normalizeTextValue(getHeaderValue(row, headers, ['VENDEDOR'])),
    carga_id: cargaId,
    anio_programa: anioPrograma,
  }
}

async function readRowsFromExcel(file: File, sheetName: string): Promise<unknown[][]> {
  const { read } = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[sheetName] as Record<string, unknown> | undefined

  if (!sheet) {
    throw new Error(`No se encontró la hoja ${sheetName} en el archivo.`)
  }

  const { utils } = await import('xlsx')
  const rangeUsed = (sheet as { '!ref'?: string })['!ref'] ?? 'A1'
  const rows = (utils.sheet_to_json(sheet, {
    header: 1,
    range: rangeUsed,
    defval: '',
    raw: false,
  }) as unknown[][])

  return rows
}

export async function uploadExcelToSupabase(
  file: File,
  metadata: ExcelImportMetadata,
  onProgress?: (progress: ExcelLoadProgress) => void,
): Promise<ExcelLoadResult> {
  const rows = await readRowsFromExcel(file, metadata.sheetName)
  const headerRow = rows[0] ?? []
  const headers = (headerRow as unknown[]).map((value) => normalizeHeader(value))
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value !== '' && value !== null && value !== undefined))

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const fechaValidacionHasta = toPostgresDate(yesterday)

  const anioPrograma = metadata.detectedYear
  const invalidDates = dataRows.flatMap((row, rowIndex) => {
    const dateResult = normalizeExcelDateValue(getHeaderValue(row as unknown[], headers, ['Fecha']), anioPrograma)

    if (!dateResult.isConsistentWithDetectedYear && dateResult.normalizedDate) {
      return [{ rowNumber: rowIndex + 2, message: dateResult.error ?? 'Fecha inconsistente' }]
    }

    return []
  })

  if (invalidDates.length > 0) {
    throw {
      code: 'DATE_YEAR_MISMATCH',
      message: `Se encontraron ${invalidDates.length} fechas con año inconsistente respecto a ${anioPrograma}.`,
      details: invalidDates.slice(0, 10).map((item) => `Fila ${item.rowNumber}: ${item.message}`).join(' | '),
      hint: 'Ajuste las fechas del Excel para que coincidan con el año del archivo.',
    }
  }

  const cargaPayload = {
    nombre_archivo: metadata.fileName,
    nombre_hoja: metadata.sheetName,
    fecha_validacion_hasta: fechaValidacionHasta,
    filas_leidas: dataRows.length,
    filas_importadas: 0,
    filas_con_error: 0,
    estado: 'procesando',
    anio_programa: anioPrograma,
    observaciones: 'Carga en proceso.',
  }

  const { data: cargaData, error: cargaError } = await supabase.schema('despachos').from('cargas').insert(cargaPayload).select('id').single()

  if (cargaError || !cargaData?.id) {
    throw {
      code: cargaError?.code,
      message: cargaError?.message ?? 'No se pudo crear la carga en Supabase.',
      details: cargaError?.details,
      hint: cargaError?.hint,
    }
  }

  const cargaId = String(cargaData.id)
  let importedRows = 0

  try {
    for (let index = 0; index < dataRows.length; index += BATCH_SIZE) {
      const batch = dataRows.slice(index, index + BATCH_SIZE)
      const mappedBatch = batch.map((row, rowIndex) => buildRowFromExcel(row as unknown[], headers, cargaId, index + rowIndex + 1, anioPrograma))
      const { error: insertError } = await supabase.schema('despachos').from('lineas_despacho').insert(mappedBatch)

      if (insertError) {
        throw {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        }
      }

      importedRows += mappedBatch.length
      onProgress?.({
        processedRows: importedRows,
        totalRows: dataRows.length,
        message: `Procesadas ${importedRows} de ${dataRows.length} filas.`,
      })
    }

    await supabase.schema('despachos').from('cargas').update({
      estado: 'completada',
      filas_importadas: importedRows,
      filas_con_error: 0,
      observaciones: `${importedRows} filas importadas correctamente.`,
    }).eq('id', cargaId)

    await supabase.schema('despachos').from('lineas_despacho').delete()
      .eq('anio_programa', anioPrograma)
      .neq('carga_id', cargaId)

    return {
      ok: true,
      message: 'Información actualizada correctamente en Supabase.',
      rowsRead: dataRows.length,
      rowsImported: importedRows,
      loadId: cargaId,
    }
  } catch (error) {
    const normalizedError = toSupabaseError(error)

    try {
      await supabase.schema('despachos').from('cargas').update({
        estado: 'fallida',
        filas_importadas: importedRows,
        filas_con_error: Math.max(0, dataRows.length - importedRows),
        observaciones: normalizedError.message ?? 'La carga falló.',
      }).eq('id', cargaId)
    } catch (updateError) {
      const updateInfo = toSupabaseError(updateError)
      console.error('Error al actualizar el estado de la carga fallida:', updateInfo)
    }

    try {
      await supabase.schema('despachos').from('lineas_despacho').delete().eq('carga_id', cargaId)
    } catch (cleanupError) {
      const cleanupInfo = toSupabaseError(cleanupError)
      console.error('Error al limpiar las líneas parciales de la carga fallida:', cleanupInfo)
    }

    return {
      ok: false,
      message: normalizedError.message ?? 'La carga falló.',
      rowsRead: dataRows.length,
      rowsImported: importedRows,
      loadId: cargaId,
      error: normalizedError,
    }
  }
}
