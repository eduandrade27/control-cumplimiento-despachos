import { useSupabaseCargaActual } from '../hooks/useSupabaseCargaActual'

export function SupabaseStatusCard() {
  const { status, message, rows, errorInfo } = useSupabaseCargaActual()

  return (
    <section className="config-section" aria-labelledby="supabase-status-title">
      <h3 id="supabase-status-title">Estado de Supabase</h3>
      <p>Estado de conexión</p>
      <div className="page-card__spacer" />
      <div className={`import-panel__result ${status === 'error' ? 'is-error' : status === 'ready' ? 'is-success' : ''}`}>
        <strong>{status === 'loading' ? 'Cargando...' : status === 'ready' ? 'Conectado' : 'Error'}</strong>
        <div className="page-card__spacer" />
        <p>Resultado de la consulta</p>
        <div className="page-card__spacer" />
        {status === 'loading' ? (
          <p>Cargando datos desde Supabase...</p>
        ) : status === 'error' ? (
          <>
            <p>{message}</p>
            <ul>
              <li>
                <strong>Código del error:</strong> {errorInfo?.code ?? 'No disponible'}
              </li>
              <li>
                <strong>Mensaje:</strong> {errorInfo?.message ?? 'No disponible'}
              </li>
              <li>
                <strong>Detalles:</strong> {errorInfo?.details ?? 'No disponible'}
              </li>
              {errorInfo?.hint ? (
                <li>
                  <strong>Hint:</strong> {errorInfo.hint}
                </li>
              ) : null}
            </ul>
          </>
        ) : (
          <>
            <p>{message}</p>
            {rows.length > 0 ? (
              <ul>
                {rows.map((row, index) => (
                  <li key={`${JSON.stringify(row)}-${index}`}>
                    {JSON.stringify(row)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
