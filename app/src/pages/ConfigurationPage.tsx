import { useAuth } from '../contexts/AuthContext'
import { AdminUsersPanel } from '../components/AdminUsersPanel'
import { ExcelImportPanel } from '../components/ExcelImportPanel'

export function ConfigurationPage() {
  const { isAdmin } = useAuth()

  return (
    <section className="page-card">
      <h2>Configuración (Administrador)</h2>
      <p>Administra usuarios y la actualización de información del sistema.</p>

      {isAdmin ? (
        <>
          <div className="page-card__spacer" />
          <AdminUsersPanel />
        </>
      ) : null}

      <div className="page-card__spacer" />
      <section className="config-section">
        <h3>Actualización de información</h3>
        <p>Seleccione un archivo para validar y actualizar la información.</p>
        <div className="page-card__spacer" />
        <ExcelImportPanel />
      </section>
    </section>
  )
}
