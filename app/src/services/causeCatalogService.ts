import { supabase } from '../lib/supabase'
import type { ExcelCauseCatalogSummary } from '../types/excel'

const SHARED_CAUSE_CATALOG_TABLE = 'catalogo_causas_compartido'
const SHARED_CAUSE_CATALOG_KEY = 'default'

interface SharedCauseCatalogRow {
  catalog_key: string
  summary: unknown
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function normalizeCauseCatalogSummary(value: unknown): ExcelCauseCatalogSummary | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (candidate.sheetName !== 'Causas') {
    return null
  }

  if (!Array.isArray(candidate.rows)) {
    return null
  }

  const rows = (candidate.rows as unknown[])
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      motivoOriginal: typeof row.motivoOriginal === 'string' ? row.motivoOriginal : '',
      motivoNormalizado: typeof row.motivoNormalizado === 'string' ? row.motivoNormalizado : '',
      area: typeof row.area === 'string' ? row.area : '',
      afectaIndicador: Boolean(row.afectaIndicador),
      justificacion: typeof row.justificacion === 'string' ? row.justificacion : '',
      afectaValorOriginal: typeof row.afectaValorOriginal === 'string' ? row.afectaValorOriginal : '',
      isAfectaValueInvalid: Boolean(row.isAfectaValueInvalid),
    }))

  return {
    foundSheet: Boolean(candidate.foundSheet),
    sheetName: 'Causas',
    validRows: typeof candidate.validRows === 'number' ? candidate.validRows : rows.length,
    causesWithSi: typeof candidate.causesWithSi === 'number' ? candidate.causesWithSi : 0,
    causesWithNo: typeof candidate.causesWithNo === 'number' ? candidate.causesWithNo : 0,
    causesWithEmptyOrInvalid: typeof candidate.causesWithEmptyOrInvalid === 'number' ? candidate.causesWithEmptyOrInvalid : 0,
    missingRequiredHeaders: isStringArray(candidate.missingRequiredHeaders)
      ? candidate.missingRequiredHeaders.filter((value): value is 'MOTIVOS' | 'AFECTA AL INDICADOR' => {
        return value === 'MOTIVOS' || value === 'AFECTA AL INDICADOR'
      })
      : [],
    missingOptionalHeaders: isStringArray(candidate.missingOptionalHeaders)
      ? candidate.missingOptionalHeaders.filter((value): value is 'AREA' | 'JUSTIFICACIÓN' => {
        return value === 'AREA' || value === 'JUSTIFICACIÓN'
      })
      : [],
    message: typeof candidate.message === 'string' ? candidate.message : '',
    headerRowIndex: typeof candidate.headerRowIndex === 'number' ? candidate.headerRowIndex : null,
    rows,
  }
}

export async function saveSharedCauseCatalogSummary(summary: ExcelCauseCatalogSummary): Promise<void> {
  const { error } = await supabase
    .schema('despachos')
    .from(SHARED_CAUSE_CATALOG_TABLE)
    .upsert(
      {
        catalog_key: SHARED_CAUSE_CATALOG_KEY,
        summary,
      },
      {
        onConflict: 'catalog_key',
      },
    )

  if (error) {
    throw error
  }
}

export async function loadSharedCauseCatalogSummary(): Promise<ExcelCauseCatalogSummary | null> {
  const { data, error } = await supabase
    .schema('despachos')
    .from(SHARED_CAUSE_CATALOG_TABLE)
    .select('catalog_key, summary')
    .eq('catalog_key', SHARED_CAUSE_CATALOG_KEY)
    .maybeSingle<SharedCauseCatalogRow>()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return normalizeCauseCatalogSummary(data.summary)
}

export async function loadSharedCauseCatalogSummaryWithInitialMigration(
  loadLegacyLocalSummary: () => ExcelCauseCatalogSummary | null,
): Promise<ExcelCauseCatalogSummary | null> {
  const sharedSummary = await loadSharedCauseCatalogSummary()

  if (sharedSummary) {
    return sharedSummary
  }

  const legacySummary = loadLegacyLocalSummary()

  if (!legacySummary) {
    return null
  }

  await saveSharedCauseCatalogSummary(legacySummary)
  return legacySummary
}

export function getSharedCauseCatalogStorageKey(): string {
  return `supabase:despachos.${SHARED_CAUSE_CATALOG_TABLE}/${SHARED_CAUSE_CATALOG_KEY}`
}
