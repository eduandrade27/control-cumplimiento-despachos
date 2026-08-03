import type {
  ExcelImportDiagnostics,
  ExcelHeaderDiagnosticEntry,
  ExcelCauseCatalogRow,
  ExcelCauseCatalogSummary,
  ExcelImportMetadata,
  ExcelImportResult,
  ExcelImportValidationSummary,
} from '../types/excel'

export interface ExcelWorkbookLike {
  Sheets: Record<string, unknown>
  SheetNames: string[]
}

export interface ExcelParserLike {
  readFile: (file: File) => Promise<ExcelWorkbookLike>
}

export const CAUSE_CATALOG_STORAGE_KEY = 'historic:causes-catalog:v1'

interface StoredCauseCatalogPayload extends ExcelCauseCatalogSummary {
  rules?: ExcelCauseCatalogRow[]
}

interface NormalizedExcelDateResult {
  normalizedDate: string | null
  explicitYear: number | null
  hasExplicitYear: boolean
  isConsistentWithDetectedYear: boolean
  error?: string
}

export const DEFAULT_EXCEL_PARSER = {
  async readFile(file: File): Promise<ExcelWorkbookLike> {
    const { read } = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = read(buffer, { type: 'array' })

    return {
      Sheets: workbook.Sheets,
      SheetNames: workbook.SheetNames,
    }
  },
} satisfies ExcelParserLike

const REQUIRED_HEADERS = [
  'Fecha',
  'N° Orden Venta',
  'Cod. Parte',
  'OC',
  'Cliente',
  'Descripción',
  'Cant. Solicitada',
  'Ingreso Producc',
  'Ingreso almacen',
  'kardex',
  'GUIA',
  'Tm despachado',
  'Tm por despachar',
  'Tm real programado',
  'Status despacho',
  'Causas',
  'ÁREA',
  'ASISTENTE',
  'SECTOR',
  'VENDEDOR',
]

function normalizeHeaderMatchToken(value: unknown): string {
  return (value ?? '')
    .toString()
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeCauseComparisonToken(value: unknown): string {
  return normalizeHeaderMatchToken(value)
}

function mapAfectaValue(value: unknown): { affects: boolean; invalid: boolean; raw: string } {
  const raw = (value ?? '').toString().trim()
  const normalized = normalizeHeaderMatchToken(raw)

  if (normalized === 'SI') {
    return { affects: true, invalid: false, raw }
  }

  if (normalized === 'NO') {
    return { affects: false, invalid: false, raw }
  }

  return { affects: true, invalid: true, raw }
}

function readCell(row: unknown[], index: number | null): unknown {
  if (index === null || index < 0) {
    return ''
  }

  return row[index] ?? ''
}

function findCauseHeaderRow(rows: unknown[][]): {
  headerIndex: number | null
  columnIndexes: Record<'MOTIVOS' | 'AREA' | 'AFECTA AL INDICADOR' | 'JUSTIFICACIÓN', number | null>
} {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const indexes: Record<'MOTIVOS' | 'AREA' | 'AFECTA AL INDICADOR' | 'JUSTIFICACIÓN', number | null> = {
      MOTIVOS: null,
      AREA: null,
      'AFECTA AL INDICADOR': null,
      JUSTIFICACIÓN: null,
    }

    row.forEach((cellValue, index) => {
      const token = normalizeHeaderMatchToken(cellValue)
      if (token === 'MOTIVOS') {
        indexes.MOTIVOS = index
      } else if (token === 'AREA') {
        indexes.AREA = index
      } else if (token === 'AFECTA AL INDICADOR') {
        indexes['AFECTA AL INDICADOR'] = index
      } else if (token === 'JUSTIFICACION') {
        indexes.JUSTIFICACIÓN = index
      }
    })

    if (indexes.MOTIVOS !== null || indexes['AFECTA AL INDICADOR'] !== null) {
      return {
        headerIndex: rowIndex,
        columnIndexes: indexes,
      }
    }
  }

  return {
    headerIndex: null,
    columnIndexes: {
      MOTIVOS: null,
      AREA: null,
      'AFECTA AL INDICADOR': null,
      JUSTIFICACIÓN: null,
    },
  }
}

export async function parseCauseCatalogFromWorkbook(workbook: ExcelWorkbookLike): Promise<ExcelCauseCatalogSummary> {
  const hasSheet = workbook.SheetNames.includes('Causas')

  if (!hasSheet) {
    return {
      foundSheet: false,
      sheetName: 'Causas',
      validRows: 0,
      causesWithSi: 0,
      causesWithNo: 0,
      causesWithEmptyOrInvalid: 0,
      missingRequiredHeaders: [],
      missingOptionalHeaders: [],
      message: 'No se encontró la hoja "Causas". El modo Ajustado quedará deshabilitado y Bruto seguirá disponible.',
      headerRowIndex: null,
      rows: [],
    }
  }

  const sheet = workbook.Sheets.Causas as Record<string, unknown> | undefined
  if (!sheet) {
    return {
      foundSheet: false,
      sheetName: 'Causas',
      validRows: 0,
      causesWithSi: 0,
      causesWithNo: 0,
      causesWithEmptyOrInvalid: 0,
      missingRequiredHeaders: [],
      missingOptionalHeaders: [],
      message: 'No se encontró la hoja "Causas". El modo Ajustado quedará deshabilitado y Bruto seguirá disponible.',
      headerRowIndex: null,
      rows: [],
    }
  }

  const { utils } = await import('xlsx')
  const rangeUsed = (sheet as { '!ref'?: string })['!ref'] ?? 'A1'
  const rawRows = (utils.sheet_to_json(sheet, {
    header: 1,
    range: rangeUsed,
    defval: '',
    raw: false,
  }) as unknown[][])

  const { headerIndex, columnIndexes } = findCauseHeaderRow(rawRows)
  const missingRequiredHeaders: Array<'MOTIVOS' | 'AFECTA AL INDICADOR'> = []
  const missingOptionalHeaders: Array<'AREA' | 'JUSTIFICACIÓN'> = []

  if (columnIndexes.MOTIVOS === null) {
    missingRequiredHeaders.push('MOTIVOS')
  }
  if (columnIndexes['AFECTA AL INDICADOR'] === null) {
    missingRequiredHeaders.push('AFECTA AL INDICADOR')
  }
  if (columnIndexes.AREA === null) {
    missingOptionalHeaders.push('AREA')
  }
  if (columnIndexes.JUSTIFICACIÓN === null) {
    missingOptionalHeaders.push('JUSTIFICACIÓN')
  }

  if (headerIndex === null || missingRequiredHeaders.length > 0) {
    return {
      foundSheet: true,
      sheetName: 'Causas',
      validRows: 0,
      causesWithSi: 0,
      causesWithNo: 0,
      causesWithEmptyOrInvalid: 0,
      missingRequiredHeaders,
      missingOptionalHeaders,
      message: `No se puede calcular Ajustado: faltan encabezados requeridos en "Causas": ${missingRequiredHeaders.join(', ')}.`,
      headerRowIndex: headerIndex,
      rows: [],
    }
  }

  const parsedRows: ExcelCauseCatalogRow[] = []
  let causesWithSi = 0
  let causesWithNo = 0
  let causesWithEmptyOrInvalid = 0

  rawRows.slice(headerIndex + 1).forEach((row) => {
    const motivoOriginal = normalizeTextValue(readCell(row, columnIndexes.MOTIVOS))
    if (!motivoOriginal) {
      return
    }

    const motivoNormalizado = normalizeCauseComparisonToken(motivoOriginal)
    if (!motivoNormalizado) {
      return
    }

    const afecta = mapAfectaValue(readCell(row, columnIndexes['AFECTA AL INDICADOR']))
    const area = normalizeTextValue(readCell(row, columnIndexes.AREA))
    const justificacion = normalizeTextValue(readCell(row, columnIndexes.JUSTIFICACIÓN))

    if (afecta.invalid) {
      causesWithEmptyOrInvalid += 1
    } else if (afecta.affects) {
      causesWithSi += 1
    } else {
      causesWithNo += 1
    }

    parsedRows.push({
      motivoOriginal,
      motivoNormalizado,
      area,
      afectaIndicador: afecta.affects,
      justificacion,
      afectaValorOriginal: afecta.raw,
      isAfectaValueInvalid: afecta.invalid,
    })
  })

  return {
    foundSheet: true,
    sheetName: 'Causas',
    validRows: parsedRows.length,
    causesWithSi,
    causesWithNo,
    causesWithEmptyOrInvalid,
    missingRequiredHeaders,
    missingOptionalHeaders,
    message: 'Hoja "Causas" cargada correctamente para el cálculo Ajustado.',
    headerRowIndex: headerIndex,
    rows: parsedRows,
  }
}

export function saveCauseCatalogSummary(summary: ExcelCauseCatalogSummary): void {
  if (typeof window === 'undefined') {
    return
  }

  const payload: StoredCauseCatalogPayload = {
    ...summary,
    rows: summary.rows,
    rules: summary.rows,
  }

  window.localStorage.setItem(CAUSE_CATALOG_STORAGE_KEY, JSON.stringify(payload))
}

export function loadCauseCatalogSummary(): ExcelCauseCatalogSummary | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(CAUSE_CATALOG_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredCauseCatalogPayload
    if (!parsed || parsed.sheetName !== 'Causas') {
      return null
    }

    const rows = Array.isArray(parsed.rules)
      ? parsed.rules
      : (Array.isArray(parsed.rows) ? parsed.rows : [])

    return {
      ...parsed,
      rows,
    }
  } catch {
    return null
  }
}

function normalizeHeader(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }

  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim().toLowerCase()
}

function normalizeImportHeader(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim().toLowerCase()
}

function normalizeTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  return String(value).trim()
}

function toExcelColumnLabel(index: number): string {
  let value = index + 1
  let result = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }

  return result
}

function buildHeaderDiagnosticRow(headerRow: unknown[]): ExcelHeaderDiagnosticEntry[] {
  return headerRow
    .map((cell, columnIndex) => ({
      columnIndex,
      columnLabel: toExcelColumnLabel(columnIndex),
      headerValue: normalizeTextValue(cell),
    }))
    .filter((entry) => entry.headerValue.length > 0)
}

function takeFirstNonEmptyValues(values: unknown[], limit: number): string[] {
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeTextValue(value)
    if (!normalized) {
      continue
    }

    result.push(normalized)

    if (result.length >= limit) {
      break
    }
  }

  return result
}

function detectMappedPropertyForHeader(headerValue: string): string | null {
  const normalized = normalizeImportHeader(headerValue)

  if (!normalized) {
    return null
  }

  const mappingRules: Array<{ property: string; aliases: string[] }> = [
    { property: 'fecha', aliases: ['Fecha'] },
    { property: 'orden_venta', aliases: ['N° Orden Venta'] },
    { property: 'cod_parte', aliases: ['Cod. Parte'] },
    { property: 'oc', aliases: ['OC'] },
    { property: 'cliente', aliases: ['Cliente'] },
    { property: 'descripcion', aliases: ['Descripción'] },
    { property: 'cant_solicitada', aliases: ['Cant. Solicitada'] },
    { property: 'ingreso_produccion', aliases: ['Ingreso Producc'] },
    { property: 'ingreso_almacen', aliases: ['Ingreso almacen'] },
    { property: 'kardex', aliases: ['kardex'] },
    { property: 'cant_despachada', aliases: ['GUIA', 'Guía'] },
    { property: 'tm_despachada', aliases: ['Tm despachado'] },
    { property: 'tm_pendiente', aliases: ['Tm por despachar'] },
    { property: 'tm_programada', aliases: ['Tm Proyectado'] },
    { property: 'status_despacho', aliases: ['Status despacho'] },
    { property: 'causa', aliases: ['Causas'] },
    { property: 'area', aliases: ['ÁREA'] },
    { property: 'asistente', aliases: ['ASISTENTE'] },
    { property: 'sector', aliases: ['SECTOR'] },
    { property: 'vendedor', aliases: ['VENDEDOR'] },
  ]

  for (const rule of mappingRules) {
    const matches = rule.aliases.some((alias) => normalizeImportHeader(alias) === normalized)
    if (matches) {
      return rule.property
    }
  }

  return null
}

async function buildImportDiagnostics(
  workbook: ExcelWorkbookLike,
  operationalSheetName: string,
  causeCatalogSummary: ExcelCauseCatalogSummary,
): Promise<ExcelImportDiagnostics> {
  const { utils } = await import('xlsx')

  const operationalSheet = workbook.Sheets[operationalSheetName] as Record<string, unknown> | undefined
  const operationalRows = operationalSheet
    ? (utils.sheet_to_json(operationalSheet, {
      header: 1,
      range: (operationalSheet as { '!ref'?: string })['!ref'] ?? 'A1',
      defval: '',
      raw: false,
    }) as unknown[][])
    : []

  const operationalHeaderRow = operationalRows[0] ?? []
  const operationalHeaderDiagnostics = buildHeaderDiagnosticRow(operationalHeaderRow)
  const aeIndex = 30
  const headerAEValue = normalizeTextValue(operationalHeaderRow[aeIndex] ?? '')
  const headerAEMappedProperty = detectMappedPropertyForHeader(headerAEValue)

  const operationalDataRows = operationalRows.slice(1)
  const directAECauses = takeFirstNonEmptyValues(operationalDataRows.map((row) => row[aeIndex]), 10)

  const normalizedHeaders = operationalHeaderRow.map((header) => normalizeImportHeader(header))
  const mappedCauseIndex = normalizedHeaders.indexOf(normalizeImportHeader('Causas'))
  const mappedCauseValues = operationalDataRows.map((row) => row[mappedCauseIndex] ?? '')
  const mappedCausesFirst10 = takeFirstNonEmptyValues(mappedCauseValues, 10)

  const causasSheet = workbook.Sheets.Causas as Record<string, unknown> | undefined
  const causasRows = causasSheet
    ? (utils.sheet_to_json(causasSheet, {
      header: 1,
      range: (causasSheet as { '!ref'?: string })['!ref'] ?? 'A1',
      defval: '',
      raw: false,
    }) as unknown[][])
    : []

  const { headerIndex: causasHeaderIndex } = findCauseHeaderRow(causasRows)
  const causasHeaderRow = causasHeaderIndex !== null ? (causasRows[causasHeaderIndex] ?? []) : []
  const causasHeaderDiagnostics = buildHeaderDiagnosticRow(causasHeaderRow)
  const motivosFirst10 = causeCatalogSummary.rows.slice(0, 10).map((row) => row.motivoOriginal)
  const motivosNormalizedFirst10 = causeCatalogSummary.rows.slice(0, 10).map((row) => row.motivoNormalizado)

  const operationalCausesNonEmpty = mappedCauseValues
    .map((value) => normalizeTextValue(value))
    .filter((value) => value.length > 0)

  const operationalCauseDistinct = Array.from(new Set(operationalCausesNonEmpty))
  const catalogTokens = new Set(causeCatalogSummary.rows.map((row) => row.motivoNormalizado).filter(Boolean))
  const normalizedOperationalDistinct = operationalCauseDistinct.map((value) => ({
    original: value,
    normalized: normalizeCauseComparisonToken(value),
  }))

  const matchedDistinct = normalizedOperationalDistinct.filter((entry) => catalogTokens.has(entry.normalized))
  const notFoundDistinct = normalizedOperationalDistinct.filter((entry) => !catalogTokens.has(entry.normalized))
  const firstOperationalSample = normalizedOperationalDistinct[0]

  return {
    operationalSheet: {
      existsByExpectedName: Boolean(operationalSheet),
      existsByLiteral26: Boolean(workbook.Sheets['26']),
      expectedSheetName: operationalSheetName,
      headerRow: operationalHeaderDiagnostics,
      headerAEValue,
      headerAEMappedProperty,
      first10CausesFromAE: directAECauses,
      first10CausesFromAppMapping: mappedCausesFirst10,
      operationalCauseCount: operationalCauseDistinct.length,
    },
    causasSheet: {
      existsByLiteralCausas: Boolean(causasSheet),
      headerRowIndex: causasHeaderIndex,
      headerRow: causasHeaderDiagnostics,
      validRowsCount: causeCatalogSummary.validRows,
      first10Motivos: motivosFirst10,
      first10MotivosNormalized: motivosNormalizedFirst10,
    },
    cross: {
      operationalNonEmptyCount: operationalCauseDistinct.length,
      catalogRulesCount: catalogTokens.size,
      normalizedExactMatchesCount: matchedDistinct.length,
      operationalNotFoundCount: notFoundDistinct.length,
      first10OperationalNotFound: notFoundDistinct.slice(0, 10).map((entry) => entry.original),
      firstOperationalSample: firstOperationalSample
        ? {
          original: firstOperationalSample.original,
          normalized: firstOperationalSample.normalized,
          inCatalog: catalogTokens.has(firstOperationalSample.normalized),
        }
        : null,
    },
  }
}

function parseMonthName(value: string): number | null {
  const normalized = value.trim().toLowerCase()
  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }

  return monthMap[normalized] ?? null
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeExcelDateValue(value: unknown, detectedYear: number): NormalizedExcelDateResult {
  if (value === null || value === undefined || value === '') {
    return {
      normalizedDate: null,
      explicitYear: null,
      hasExplicitYear: false,
      isConsistentWithDetectedYear: true,
    }
  }

  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = value.getMonth() + 1
    const day = value.getDate()

    return {
      normalizedDate: formatDateParts(year, month, day),
      explicitYear: year,
      hasExplicitYear: true,
      isConsistentWithDetectedYear: year === detectedYear,
      error: year === detectedYear ? undefined : `La fecha ${formatDateParts(year, month, day)} no coincide con el año ${detectedYear}.`,
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const baseDate = new Date(Date.UTC(1899, 11, 30))
    baseDate.setUTCDate(baseDate.getUTCDate() + value)

    return {
      normalizedDate: formatDateParts(detectedYear, baseDate.getUTCMonth() + 1, baseDate.getUTCDate()),
      explicitYear: null,
      hasExplicitYear: false,
      isConsistentWithDetectedYear: true,
    }
  }

  const textValue = normalizeTextValue(value)

  if (!textValue) {
    return {
      normalizedDate: null,
      explicitYear: null,
      hasExplicitYear: false,
      isConsistentWithDetectedYear: true,
    }
  }

  const isoMatch = textValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const parsedDate = new Date(year, month - 1, day)

    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
      return {
        normalizedDate: null,
        explicitYear: year,
        hasExplicitYear: true,
        isConsistentWithDetectedYear: year === detectedYear,
        error: `La fecha ${textValue} no es válida.`,
      }
    }

    return {
      normalizedDate: formatDateParts(year, month, day),
      explicitYear: year,
      hasExplicitYear: true,
      isConsistentWithDetectedYear: year === detectedYear,
      error: year === detectedYear ? undefined : `La fecha ${textValue} no coincide con el año ${detectedYear}.`,
    }
  }

  const europeanMatch = textValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (europeanMatch) {
    const day = Number(europeanMatch[1])
    const month = Number(europeanMatch[2])
    const year = Number(europeanMatch[3])
    const parsedDate = new Date(year, month - 1, day)

    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
      return {
        normalizedDate: null,
        explicitYear: year,
        hasExplicitYear: true,
        isConsistentWithDetectedYear: year === detectedYear,
        error: `La fecha ${textValue} no es válida.`,
      }
    }

    return {
      normalizedDate: formatDateParts(year, month, day),
      explicitYear: year,
      hasExplicitYear: true,
      isConsistentWithDetectedYear: year === detectedYear,
      error: year === detectedYear ? undefined : `La fecha ${textValue} no coincide con el año ${detectedYear}.`,
    }
  }

  const monthNameMatch = textValue.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})(?:[-/ ](\d{2,4}))?$/)
  if (monthNameMatch) {
    const day = Number(monthNameMatch[1])
    const month = parseMonthName(monthNameMatch[2])
    const explicitYear = monthNameMatch[3] ? Number(monthNameMatch[3]) : null

    if (!month) {
      return {
        normalizedDate: null,
        explicitYear: explicitYear ?? null,
        hasExplicitYear: explicitYear !== null,
        isConsistentWithDetectedYear: explicitYear === null || explicitYear === detectedYear,
        error: `La fecha ${textValue} no es válida.`,
      }
    }

    const parsedYear = explicitYear ?? detectedYear
    const parsedDate = new Date(parsedYear, month - 1, day)

    if (parsedDate.getFullYear() !== parsedYear || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
      return {
        normalizedDate: null,
        explicitYear: explicitYear ?? null,
        hasExplicitYear: explicitYear !== null,
        isConsistentWithDetectedYear: explicitYear === null || explicitYear === detectedYear,
        error: `La fecha ${textValue} no es válida.`,
      }
    }

    return {
      normalizedDate: formatDateParts(parsedYear, month, day),
      explicitYear: explicitYear ?? null,
      hasExplicitYear: explicitYear !== null,
      isConsistentWithDetectedYear: explicitYear === null || explicitYear === detectedYear,
      error: explicitYear !== null && explicitYear !== detectedYear
        ? `La fecha ${textValue} no coincide con el año ${detectedYear}.`
        : undefined,
    }
  }

  return {
    normalizedDate: null,
    explicitYear: null,
    hasExplicitYear: false,
    isConsistentWithDetectedYear: true,
    error: `La fecha ${textValue} no es válida.`,
  }
}

export function verifyExcelDateNormalization(): boolean {
  const expectations = [
    { value: '2-Jan', year: 2026, expected: '2026-01-02' },
    { value: '15-Jul', year: 2026, expected: '2026-07-15' },
    { value: '2-Jan', year: 2027, expected: '2027-01-02' },
  ]

  for (const expectation of expectations) {
    const result = normalizeExcelDateValue(expectation.value, expectation.year)

    if (result.normalizedDate !== expectation.expected) {
      throw new Error(`La normalización falló para ${expectation.value} con año ${expectation.year}: ${result.normalizedDate}`)
    }
  }

  return true
}

verifyExcelDateNormalization()

function normalizeOrderValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function buildValidationSummary(rawRows: unknown[][], sheetName: string, detectedYear: number): ExcelImportValidationSummary {
  const normalizedHeaders = (rawRows[0] ?? []).map((value) => normalizeHeader(value))
  const requiredHeadersFound = REQUIRED_HEADERS.filter((requiredHeader) =>
    normalizedHeaders.includes(requiredHeader.toLowerCase()),
  )

  const dataRows = rawRows.slice(1)
  const uniqueOrderKeys = new Set<string>()
  const inconsistentDateRows: ExcelImportValidationSummary['firstInconsistentDateRows'] = []
  let minDetectedDate: string | null = null
  let maxDetectedDate: string | null = null
  let minDetectedYear: number | null = null
  let maxDetectedYear: number | null = null

  dataRows.forEach((row, rowIndex) => {
    const dateValue = row[normalizedHeaders.indexOf('fecha')] ?? ''
    const orderValue = row[normalizedHeaders.indexOf('n° orden venta')] ?? ''
    const normalizedDateResult = normalizeExcelDateValue(dateValue, detectedYear)
    const normalizedOrder = normalizeOrderValue(orderValue)

    if (normalizedDateResult.normalizedDate || normalizedOrder) {
      uniqueOrderKeys.add(`${normalizedDateResult.normalizedDate ?? ''}::${normalizedOrder}`)
    }

    if (normalizedDateResult.normalizedDate) {
      const normalizedDate = normalizedDateResult.normalizedDate
      if (minDetectedDate === null || normalizedDate < minDetectedDate) {
        minDetectedDate = normalizedDate
      }
      if (maxDetectedDate === null || normalizedDate > maxDetectedDate) {
        maxDetectedDate = normalizedDate
      }
      const dateYear = Number(normalizedDate.slice(0, 4))
      if (minDetectedYear === null || dateYear < minDetectedYear) {
        minDetectedYear = dateYear
      }
      if (maxDetectedYear === null || dateYear > maxDetectedYear) {
        maxDetectedYear = dateYear
      }
    }

    if (!normalizedDateResult.isConsistentWithDetectedYear && inconsistentDateRows.length < 10) {
      inconsistentDateRows.push({
        rowNumber: rowIndex + 2,
        rawValue: normalizeTextValue(dateValue),
        normalizedDate: normalizedDateResult.normalizedDate,
        parsedYear: normalizedDateResult.explicitYear ?? normalizedDateResult.normalizedDate?.slice(0, 4) ? Number(normalizedDateResult.normalizedDate?.slice(0, 4)) : null,
        detectedYear,
      })
    }
  })

  const hasDateYearMismatch = inconsistentDateRows.length > 0
  const isValid = requiredHeadersFound.length === REQUIRED_HEADERS.length && !hasDateYearMismatch
  const statusMessage = isValid
    ? 'Archivo validado correctamente. Listo para actualizar la información.'
    : hasDateYearMismatch
      ? 'Hay fechas con años inconsistentes respecto al año detectado del archivo.'
      : 'El archivo no cumple con los encabezados obligatorios.'

  return {
    fileName: '',
    detectedYear,
    sheetName,
    sheetRowCount: dataRows.length,
    uniqueOrders: uniqueOrderKeys.size,
    requiredHeadersFound,
    isValid,
    statusMessage,
    minDetectedDate,
    maxDetectedDate,
    minDetectedYear,
    maxDetectedYear,
    inconsistentDateRowCount: inconsistentDateRows.length,
    firstInconsistentDateRows: inconsistentDateRows,
    hasDateYearMismatch,
  }
}

export function validateExcelFile(file: File): { isValid: boolean; message?: string } {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return {
      isValid: false,
      message: 'El archivo debe tener extensión .xlsx.',
    }
  }

  return { isValid: true }
}

export function detectYearFromFileName(fileName: string): { year?: number; message?: string } {
  const match = fileName.match(/PROGRAMA\s(\d{4})\.xlsx$/i)

  if (!match?.[1]) {
    return {
      message: 'No se pudo detectar el año del archivo. El nombre debe seguir el formato PROGRAMA AAAA.xlsx.',
    }
  }

  return { year: Number(match[1]) }
}

export function resolveExpectedSheetName(fileName: string): { expectedSheetName?: string; message?: string } {
  const yearResult = detectYearFromFileName(fileName)

  if (yearResult.message || yearResult.year === undefined) {
    return { message: yearResult.message }
  }

  return { expectedSheetName: String(yearResult.year).slice(-2) }
}

export async function importExcelFile(
  file: File,
  parser: ExcelParserLike = DEFAULT_EXCEL_PARSER,
): Promise<ExcelImportResult> {
  const extensionValidation = validateExcelFile(file)

  if (!extensionValidation.isValid) {
    return {
      ok: false,
      code: 'INVALID_EXTENSION',
      message: extensionValidation.message ?? 'Extensión no permitida.',
    }
  }

  const yearDetection = detectYearFromFileName(file.name)

  if (yearDetection.message || yearDetection.year === undefined) {
    return {
      ok: false,
      code: 'YEAR_NOT_FOUND',
      message: yearDetection.message ?? 'No se pudo determinar el año del archivo.',
    }
  }

  const expectedSheetName = resolveExpectedSheetName(file.name)

  if (expectedSheetName.message || expectedSheetName.expectedSheetName === undefined) {
    return {
      ok: false,
      code: 'YEAR_NOT_FOUND',
      message: expectedSheetName.message ?? 'No se pudo determinar el nombre de la hoja esperada.',
    }
  }

  try {
    const workbook = await parser.readFile(file)
    const causeCatalogSummary = await parseCauseCatalogFromWorkbook(workbook)
    const sheetNames = workbook.SheetNames
    const sheetName = sheetNames.find((name) => name === expectedSheetName.expectedSheetName)

    if (!sheetName) {
      return {
        ok: false,
        code: 'SHEET_NOT_FOUND',
        message: `No se encontró la hoja esperada "${expectedSheetName.expectedSheetName}". Hojas disponibles: ${sheetNames.join(', ') || 'sin hojas'}.`,
      }
    }

    const sheet = workbook.Sheets[sheetName] as Record<string, unknown>
    const { utils } = await import('xlsx')
    const rangeUsed = (sheet as { '!ref'?: string })['!ref'] ?? 'A1'
    const rawRows = (utils.sheet_to_json(sheet, {
      header: 1,
      range: rangeUsed,
      defval: '',
      raw: false,
    }) as unknown[][])
    const sheetRowCount = Math.max(0, rawRows.length - 1)
    const validationSummary = buildValidationSummary(rawRows, sheetName, yearDetection.year)

    const metadata: ExcelImportMetadata = {
      fileName: file.name,
      fileSize: file.size,
      detectedYear: yearDetection.year,
      expectedSheetName: expectedSheetName.expectedSheetName,
      sheetName,
      sheetNames,
      sheetRowCount,
      workbookSheetCount: sheetNames.length,
      loadedAt: new Date().toISOString(),
      validationSummary: {
        ...validationSummary,
        fileName: file.name,
      },
      causeCatalogSummary,
      diagnostics: await buildImportDiagnostics(workbook, sheetName, causeCatalogSummary),
    }

    return {
      ok: true,
      metadata,
    }
  } catch (error) {
    return {
      ok: false,
      code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'No se pudo leer el libro de Excel.',
    }
  }
}
