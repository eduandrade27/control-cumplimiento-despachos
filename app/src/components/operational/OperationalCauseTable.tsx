import { formatNumber, formatTm } from '../../lib/operationalFormat'
import type { CauseTableRow } from '../../types/operationalInsights'

interface OperationalCauseTableProps {
  rows: CauseTableRow[]
  onSelectCausa?: (causa: string) => void
}

export function OperationalCauseTable({ rows, onSelectCausa }: OperationalCauseTableProps) {
  return (
    <section className="operational-card operational-card--table">
      <div className="operational-card__header">
        <h3>Tabla de causas</h3>
        <p>Ordenada por TM pendiente.</p>
      </div>
      <div className="operational-card__body">
        <div className="operational-table-wrapper">
          <table className="operational-table">
            <thead>
              <tr>
                <th>Causa</th>
                <th>TM pendiente</th>
                <th>Pedidos incumplidos</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.causa}>
                  <td>
                    <button type="button" className="operational-link-button" onClick={() => onSelectCausa?.(row.causa)}>
                      {row.causa}
                    </button>
                  </td>
                  <td>{formatTm(row.tmPendiente)}</td>
                  <td>{formatNumber(row.pedidosIncumplidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
