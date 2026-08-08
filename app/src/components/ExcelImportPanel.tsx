import { useState } from 'react'
import { useExcelImportLoad } from '../hooks/useExcelImportLoad'
import { importExcelFile } from '../lib/excel'
import type { ExcelImportResult } from '../types/excel'

export function ExcelImportPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<ExcelImportResult | null>(null)
  const { isLoading, result: loadResult, runLoad } = useExcelImportLoad()

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
  const isBlockedByValidation = Boolean(result?.ok && validationSummary && !validationSummary.isValid)
  const validationErrorMessage = result?.ok && validationSummary && !validationSummary.isValid
    ? validationSummary.statusMessage
    : ''

  return (
    <div className="import-panel">
      <div className="import-panel__header">
        <h3>Importador de Excel</h3>
        <p>Cargue el archivo para actualizar la información en Supabase.</p>
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

      {isLoading ? (
        <div className="import-panel__result">
          <strong>Procesando archivo...</strong>
          <p>La carga está en curso.</p>
        </div>
      ) : null}

      {loadResult ? (
        <div className={`import-panel__result ${loadResult.ok ? 'is-success' : 'is-error'}`}>
          <strong>{loadResult.ok ? 'Carga finalizada correctamente' : 'Error de carga'}</strong>
          <p>{loadResult.ok ? 'Información actualizada correctamente en Supabase.' : loadResult.message}</p>
        </div>
      ) : null}

      {!loadResult && result && !result.ok ? (
        <div className="import-panel__result is-error">
          <strong>Error</strong>
          <p>{result.message}</p>
        </div>
      ) : null}

      {!loadResult && validationErrorMessage ? (
        <div className="import-panel__result is-error">
          <strong>Archivo no válido</strong>
          <p>{validationErrorMessage}</p>
        </div>
      ) : null}
    </div>
  )
}
