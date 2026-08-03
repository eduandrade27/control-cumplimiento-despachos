import { ExcelImportPanel } from '../components/ExcelImportPanel'
import { SupabaseStatusCard } from '../components/SupabaseStatusCard'

export function ConfigurationPage() {
  return (
    <section className="page-card">
      <h2>Configuración</h2>
      <p>Vista provisional del módulo de configuración.</p>
      <div className="page-card__spacer" />
      <SupabaseStatusCard />
      <div className="page-card__spacer" />
      <section className="config-section">
        <h3>Actualización de información</h3>
        <p>Seleccione un archivo para validar y preparar la carga de información.</p>
        <div className="page-card__spacer" />
        <ExcelImportPanel />
      </section>
    </section>
  )
}
