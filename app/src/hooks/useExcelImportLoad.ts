import { useCallback, useState } from 'react'
import { dispatchSupabaseRefresh } from '../lib/refreshEvents'
import { invalidateCommercialDashboardCache } from '../services/commercialService'
import { getSharedCauseCatalogStorageKey, loadSharedCauseCatalogSummary, saveSharedCauseCatalogSummary } from '../services/causeCatalogService'
import { invalidateHistoricDashboardCache } from '../services/historicService'
import { invalidateOperationalBaseDataCache } from '../services/operationalDataCache'
import { clearSupabaseRowsCache } from '../services/supabasePagination'
import { uploadExcelToSupabase, type ExcelLoadProgress, type ExcelLoadResult } from '../services/excelLoadService'
import type { CauseCatalogStorageDiagnostics, ExcelImportMetadata } from '../types/excel'

const BATCH_SIZE = 500

export interface ExcelLoadUiProgress extends ExcelLoadProgress {
  startTime: number
  currentBatch: number
  totalBatches: number
}

interface UseExcelImportLoadResult {
  isLoading: boolean
  progress: ExcelLoadUiProgress | null
  result: ExcelLoadResult | null
  storageDiagnostics: CauseCatalogStorageDiagnostics | null
  runLoad: (file: File, metadata: ExcelImportMetadata) => Promise<void>
}

function buildUiProgress(progress: ExcelLoadProgress, startTime: number): ExcelLoadUiProgress {
  const totalBatches = Math.max(1, Math.ceil(progress.totalRows / BATCH_SIZE))
  const currentBatch = progress.processedRows === 0
    ? 0
    : Math.min(totalBatches, Math.floor((progress.processedRows - 1) / BATCH_SIZE) + 1)

  const message = progress.processedRows === 0
    ? 'Preparando carga...'
    : `Insertando lote ${currentBatch} de ${totalBatches}...`

  return {
    ...progress,
    startTime,
    currentBatch,
    totalBatches,
    message,
  }
}

export function useExcelImportLoad(): UseExcelImportLoadResult {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<ExcelLoadUiProgress | null>(null)
  const [result, setResult] = useState<ExcelLoadResult | null>(null)
  const [storageDiagnostics, setStorageDiagnostics] = useState<CauseCatalogStorageDiagnostics | null>(null)

  const runLoad = useCallback(async (file: File, metadata: ExcelImportMetadata) => {
    const loadStart = Date.now()
    setIsLoading(true)
    setProgress({
      processedRows: 0,
      totalRows: 0,
      message: 'Validando archivo...',
      startTime: loadStart,
      currentBatch: 0,
      totalBatches: 0,
    })
    setResult(null)
    setStorageDiagnostics(null)

    try {
      setProgress((previous) => previous && ({
        ...previous,
        message: 'Preparando carga...',
      }))

      const outcome = await uploadExcelToSupabase(file, metadata, (nextProgress) => {
        setProgress(buildUiProgress(nextProgress, loadStart))
      })

      setProgress((previous) => previous && ({
        ...previous,
        message: 'Finalizando...',
      }))

      if (outcome.ok && metadata.causeCatalogSummary) {
        await saveSharedCauseCatalogSummary(metadata.causeCatalogSummary)
        clearSupabaseRowsCache()
        invalidateOperationalBaseDataCache()
        invalidateCommercialDashboardCache()
        invalidateHistoricDashboardCache()
        const persistedCompleteRulesCount = metadata.causeCatalogSummary.rows.filter((row) => {
          return row.motivoOriginal.trim().length > 0 && row.motivoNormalizado.trim().length > 0
        }).length
        const readSummary = await loadSharedCauseCatalogSummary()

        setStorageDiagnostics({
          storageKey: getSharedCauseCatalogStorageKey(),
          persistedCompleteRulesCount,
          analysisReadRulesCount: readSummary?.rows.length ?? 0,
        })
      }

      setResult(outcome)

      if (outcome.ok) {
        dispatchSupabaseRefresh()
      }
    } catch (error) {
      setProgress((previous) => previous && ({
        ...previous,
        message: 'Finalizando...',
      }))

      const fallbackResult: ExcelLoadResult = {
        ok: false,
        message: error instanceof Error ? error.message : 'Error inesperado al cargar el archivo.',
        rowsRead: 0,
        rowsImported: 0,
      }

      setResult(fallbackResult)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isLoading,
    progress,
    result,
    storageDiagnostics,
    runLoad,
  }
}
