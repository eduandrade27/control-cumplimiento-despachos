import { useState } from 'react'
import { useExcelImportLoad } from '../hooks/useExcelImportLoad'
import { importExcelFile } from '../lib/excel'
import type { ExcelImportResult } from '../types/excel'

function formatElapsedTime(startTime: number): string {
  const elapsedMilliseconds = Date.now() - startTime
  const totalSeconds = Math.floor(elapsedMilliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function ExcelImportPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<ExcelImportResult | null>(null)
  const { isLoading, progress, result: loadResult, storageDiagnostics, runLoad } = useExcelImportLoad()

  const handleImport = async () => {
    if (!selectedFile) {
      setResult({
        ok: false,
        code: 'INVALID_EXTENSION',
        message: 'Seleccione un archivo .xlsx para continuar.',
      })
      return
    }

    const outcome = await importExcelFile(selectedFile)
    setResult(outcome)

    if (!outcome.ok) {
      return
    }

    if (outcome.ok && outcome.metadata.validationSummary && !outcome.metadata.validationSummary.isValid) {
      return
    }

    await runLoad(selectedFile, outcome.metadata)
  }

  const validationSummary = result?.ok ? result.metadata.validationSummary : undefined
  const causeCatalogSummary = result?.ok ? result.metadata.causeCatalogSummary : undefined
  const diagnostics = result?.ok ? result.metadata.diagnostics : undefined
  const isBlockedByValidation = Boolean(result?.ok && validationSummary && !validationSummary.isValid)
  const failedBatch = progress && !loadResult?.ok
    ? Math.min(progress.totalBatches, Math.max(1, progress.currentBatch + 1))
    : null
  const progressPercentage = progress && progress.totalRows > 0
    ? Math.round((progress.processedRows / progress.totalRows) * 100)
    : 0

  return (
    <div className="import-panel">
      <div className="import-panel__header">
        <h3>Importador de Excel</h3>
        <p>Se valida el nombre del archivo, el año detectado y la hoja esperada antes de leer el libro.</p>
      </div>

      <label className="import-panel__field">
        <span>Archivo</span>
        <input
          type="file"
          accept=".xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            setSelectedFile(file)
            setResult(null)
          }}
        />
      </label>

      <button type="button" className="import-panel__button" onClick={handleImport} disabled={isLoading || isBlockedByValidation}>
        {isLoading ? 'Procesando…' : isBlockedByValidation ? 'Validación pendiente' : 'Actualizar información'}
      </button>

      {selectedFile && (
        <p className="import-panel__file-name">Archivo seleccionado: {selectedFile.name}</p>
      )}

      {progress && (
        <div className="import-panel__result">
          <strong>Progreso de carga</strong>
          <p>{progress.message}</p>
          <p>Lote: {progress.currentBatch || (progress.totalBatches > 0 ? 1 : 0)} de {progress.totalBatches}</p>
          <p>Filas procesadas: {progress.processedRows} / {progress.totalRows}</p>
          <p>Porcentaje: {progressPercentage}%</p>
          <p>Tiempo transcurrido: {formatElapsedTime(progress.startTime)}</p>
        </div>
      )}

      {result && (
        <div className={`import-panel__result ${result.ok ? 'is-success' : 'is-error'}`}>
          {result.ok ? (
            <>
              <strong>Información actualizada correctamente en Supabase.</strong>
              {validationSummary && (
                <ul>
                  <li>Archivo seleccionado: {validationSummary.fileName}</li>
                  <li>Año detectado: {validationSummary.detectedYear}</li>
                  <li>Hoja encontrada: {validationSummary.sheetName}</li>
                  <li>Filas leídas: {validationSummary.sheetRowCount}</li>
                  <li>Pedidos únicos: {validationSummary.uniqueOrders}</li>
                  <li>Encabezados obligatorios encontrados: {validationSummary.requiredHeadersFound.join(', ') || 'ninguno'}</li>
                  <li>Estado de validación: {validationSummary.statusMessage}</li>
                  <li>Fecha mínima detectada: {validationSummary.minDetectedDate ?? 'sin datos'}</li>
                  <li>Fecha máxima detectada: {validationSummary.maxDetectedDate ?? 'sin datos'}</li>
                  <li>Año de la fecha mínima: {validationSummary.minDetectedYear ?? 'sin datos'}</li>
                  <li>Año de la fecha máxima: {validationSummary.maxDetectedYear ?? 'sin datos'}</li>
                  <li>Filas con año inconsistente: {validationSummary.inconsistentDateRowCount}</li>
                  {validationSummary.firstInconsistentDateRows.length > 0 ? (
                    <li>
                      Primeras filas afectadas: {validationSummary.firstInconsistentDateRows.map((row) => `#${row.rowNumber} (${row.rawValue || 'vacía'})`).join(', ')}
                    </li>
                  ) : null}
                  {causeCatalogSummary ? (
                    <>
                      <li>Hoja Causas encontrada: {causeCatalogSummary.foundSheet ? 'Sí' : 'No'}</li>
                      <li>Filas válidas Causas: {causeCatalogSummary.validRows}</li>
                      <li>Causas con SÍ: {causeCatalogSummary.causesWithSi}</li>
                      <li>Causas con NO: {causeCatalogSummary.causesWithNo}</li>
                      <li>Causas con valor vacío o inválido: {causeCatalogSummary.causesWithEmptyOrInvalid}</li>
                      <li>Estado catálogo Causas: {causeCatalogSummary.message}</li>
                      {causeCatalogSummary.missingRequiredHeaders.length > 0 ? (
                        <li>Encabezados requeridos faltantes en Causas: {causeCatalogSummary.missingRequiredHeaders.join(', ')}</li>
                      ) : null}
                    </>
                  ) : null}
                </ul>
              )}

              {diagnostics ? (
                <div>
                  <strong>Diagnóstico temporal de cruce (antes de guardar)</strong>

                  <p>Hoja operativa esperada: {diagnostics.operationalSheet.expectedSheetName}</p>
                  <p>Confirmación workbook.Sheets[&quot;{diagnostics.operationalSheet.expectedSheetName}&quot;]: {diagnostics.operationalSheet.existsByExpectedName ? 'Sí' : 'No'}</p>
                  <p>Confirmación workbook.Sheets[&quot;26&quot;]: {diagnostics.operationalSheet.existsByLiteral26 ? 'Sí' : 'No'}</p>

                  <strong>Encabezados detectados hoja operativa</strong>
                  <ul>
                    {diagnostics.operationalSheet.headerRow.map((header) => (
                      <li key={`op-${header.columnIndex}`}>
                        {header.columnLabel} (posición {header.columnIndex + 1}): {header.headerValue}
                      </li>
                    ))}
                  </ul>

                  <p>Encabezado en AE: {diagnostics.operationalSheet.headerAEValue || '(vacío)'}</p>
                  <p>Propiedad mapeada para AE: {diagnostics.operationalSheet.headerAEMappedProperty ?? '(sin mapeo)'}</p>

                  <strong>Primeras 10 causas no vacías desde columna AE</strong>
                  <ol>
                    {diagnostics.operationalSheet.first10CausesFromAE.map((cause, index) => (
                      <li key={`ae-${index}`}>{cause}</li>
                    ))}
                  </ol>

                  <strong>Primeras 10 causas no vacías después del mapeo de la aplicación</strong>
                  <ol>
                    {diagnostics.operationalSheet.first10CausesFromAppMapping.map((cause, index) => (
                      <li key={`map-${index}`}>{cause}</li>
                    ))}
                  </ol>

                  <p>Cantidad de causas operativas no vacías (distintas): {diagnostics.operationalSheet.operationalCauseCount}</p>

                  <hr />

                  <p>Confirmación workbook.Sheets[&quot;Causas&quot;]: {diagnostics.causasSheet.existsByLiteralCausas ? 'Sí' : 'No'}</p>
                  <p>Fila de encabezado detectada en Causas: {diagnostics.causasSheet.headerRowIndex !== null ? diagnostics.causasSheet.headerRowIndex + 1 : 'No detectada'}</p>

                  <strong>Encabezados detectados hoja Causas</strong>
                  <ul>
                    {diagnostics.causasSheet.headerRow.map((header) => (
                      <li key={`ca-${header.columnIndex}`}>
                        {header.columnLabel} (posición {header.columnIndex + 1}): {header.headerValue}
                      </li>
                    ))}
                  </ul>

                  <strong>Primeras 10 entradas no vacías de MOTIVOS</strong>
                  <ol>
                    {diagnostics.causasSheet.first10Motivos.map((motivo, index) => (
                      <li key={`mot-${index}`}>{motivo}</li>
                    ))}
                  </ol>

                  <strong>Primeras 10 entradas normalizadas de MOTIVOS</strong>
                  <ol>
                    {diagnostics.causasSheet.first10MotivosNormalized.map((motivo, index) => (
                      <li key={`motn-${index}`}>{motivo}</li>
                    ))}
                  </ol>

                  <p>Cantidad de filas válidas leídas en Causas: {diagnostics.causasSheet.validRowsCount}</p>

                  <hr />

                  <strong>Cruce normalizado</strong>
                  <ul>
                    <li>Causas operativas no vacías (distintas): {diagnostics.cross.operationalNonEmptyCount}</li>
                    <li>Reglas del catálogo: {diagnostics.cross.catalogRulesCount}</li>
                    <li>Coincidencias exactas normalizadas: {diagnostics.cross.normalizedExactMatchesCount}</li>
                    <li>Causas operativas no encontradas: {diagnostics.cross.operationalNotFoundCount}</li>
                  </ul>

                  <strong>Primeras 10 causas operativas no encontradas</strong>
                  <ol>
                    {diagnostics.cross.first10OperationalNotFound.map((cause, index) => (
                      <li key={`nf-${index}`}>{cause}</li>
                    ))}
                  </ol>

                  {diagnostics.cross.firstOperationalSample ? (
                    <>
                      <strong>Primera causa operativa (traza de comparación)</strong>
                      <ul>
                        <li>Valor original: {diagnostics.cross.firstOperationalSample.original}</li>
                        <li>Valor normalizado: {diagnostics.cross.firstOperationalSample.normalized}</li>
                        <li>catalogMap.has(valorNormalizado): {diagnostics.cross.firstOperationalSample.inCatalog ? 'TRUE' : 'FALSE'}</li>
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}

              {storageDiagnostics ? (
                <div>
                  <strong>Persistencia de reglas para Análisis de Causas</strong>
                  <ul>
                    <li>Clave exacta de almacenamiento: {storageDiagnostics.storageKey}</li>
                    <li>Reglas completas persistidas: {storageDiagnostics.persistedCompleteRulesCount}</li>
                    <li>Reglas leídas por Análisis de Causas desde la misma clave: {storageDiagnostics.analysisReadRulesCount}</li>
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <strong>Error</strong>
              <p>{result.message}</p>
            </>
          )}
        </div>
      )}

      {!result && loadResult && (
        <div className={`import-panel__result ${loadResult.ok ? 'is-success' : 'is-error'}`}>
          <strong>{loadResult.ok ? 'Carga finalizada' : 'Error de carga'}</strong>
          <p>{loadResult.ok ? 'Información actualizada correctamente en Supabase.' : loadResult.message}</p>
          {loadResult.error ? (
            <ul>
              {failedBatch !== null ? <li>Lote donde falló: {failedBatch}</li> : null}
              {progress ? <li>Filas procesadas hasta el error: {progress.processedRows}</li> : null}
              <li>Código del error: {loadResult.error.code ?? 'No disponible'}</li>
              <li>Mensaje: {loadResult.error.message ?? 'No disponible'}</li>
              <li>Detalles: {loadResult.error.details ?? 'No disponible'}</li>
              {loadResult.error.hint ? <li>Hint: {loadResult.error.hint}</li> : null}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
