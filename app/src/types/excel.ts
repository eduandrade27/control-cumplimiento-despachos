export type ExcelImportCode =
  | 'INVALID_EXTENSION'
  | 'YEAR_NOT_FOUND'
  | 'SHEET_NOT_FOUND'
  | 'READ_FAILED'
  | 'DATE_YEAR_MISMATCH'

export interface ExcelInconsistentDateRow {
  rowNumber: number
  rawValue: string
  normalizedDate: string | null
  parsedYear: number | null
  detectedYear: number
}

export interface ExcelImportValidationSummary {
  fileName: string
  detectedYear: number
  sheetName: string
  sheetRowCount: number
  uniqueOrders: number
  requiredHeadersFound: string[]
  isValid: boolean
  statusMessage: string
  minDetectedDate: string | null
  maxDetectedDate: string | null
  minDetectedYear: number | null
  maxDetectedYear: number | null
  inconsistentDateRowCount: number
  firstInconsistentDateRows: ExcelInconsistentDateRow[]
  hasDateYearMismatch: boolean
}

export interface ExcelCauseCatalogRow {
  motivoOriginal: string
  motivoNormalizado: string
  area: string
  afectaIndicador: boolean
  justificacion: string
  afectaValorOriginal: string
  isAfectaValueInvalid: boolean
}

export interface ExcelCauseCatalogSummary {
  foundSheet: boolean
  sheetName: 'Causas'
  validRows: number
  causesWithSi: number
  causesWithNo: number
  causesWithEmptyOrInvalid: number
  missingRequiredHeaders: Array<'MOTIVOS' | 'AFECTA AL INDICADOR'>
  missingOptionalHeaders: Array<'AREA' | 'JUSTIFICACIÓN'>
  message: string
  headerRowIndex: number | null
  rows: ExcelCauseCatalogRow[]
}

export interface ExcelHeaderDiagnosticEntry {
  columnIndex: number
  columnLabel: string
  headerValue: string
}

export interface ExcelSheetOperationalDiagnostics {
  existsByExpectedName: boolean
  existsByLiteral26: boolean
  expectedSheetName: string
  headerRow: ExcelHeaderDiagnosticEntry[]
  headerAEValue: string
  headerAEMappedProperty: string | null
  first10CausesFromAE: string[]
  first10CausesFromAppMapping: string[]
  operationalCauseCount: number
}

export interface ExcelSheetCausasDiagnostics {
  existsByLiteralCausas: boolean
  headerRowIndex: number | null
  headerRow: ExcelHeaderDiagnosticEntry[]
  validRowsCount: number
  first10Motivos: string[]
  first10MotivosNormalized: string[]
}

export interface ExcelCauseCrossFirstSample {
  original: string
  normalized: string
  inCatalog: boolean
}

export interface ExcelCauseCrossDiagnostics {
  operationalNonEmptyCount: number
  catalogRulesCount: number
  normalizedExactMatchesCount: number
  operationalNotFoundCount: number
  first10OperationalNotFound: string[]
  firstOperationalSample: ExcelCauseCrossFirstSample | null
}

export interface ExcelImportDiagnostics {
  operationalSheet: ExcelSheetOperationalDiagnostics
  causasSheet: ExcelSheetCausasDiagnostics
  cross: ExcelCauseCrossDiagnostics
}

export interface CauseCatalogStorageDiagnostics {
  storageKey: string
  persistedCompleteRulesCount: number
  analysisReadRulesCount: number
}

export interface ExcelImportMetadata {
  fileName: string
  fileSize: number
  detectedYear: number
  expectedSheetName: string
  sheetName: string
  sheetNames: string[]
  sheetRowCount: number
  workbookSheetCount: number
  loadedAt: string
  validationSummary?: ExcelImportValidationSummary
  causeCatalogSummary?: ExcelCauseCatalogSummary
  diagnostics?: ExcelImportDiagnostics
}

export interface ExcelLineaDespachoPayload {
  anio_programa: number
  carga_id: string | null
}

export interface ExcelImportSuccess {
  ok: true
  metadata: ExcelImportMetadata
}

export interface ExcelImportFailure {
  ok: false
  code: ExcelImportCode
  message: string
}

export type ExcelImportResult = ExcelImportSuccess | ExcelImportFailure
