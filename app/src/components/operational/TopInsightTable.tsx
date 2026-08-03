import { formatNumber, formatTm } from '../../lib/operationalFormat'
import type { OperationalTopRow } from '../../types/operationalInsights'
import { Tooltip } from '../Tooltip'

interface TopInsightTableProps {
  title: string
  rows: OperationalTopRow[]
  emptyMessage: string
  primaryLabel: string
  onSelect?: (value: string) => void
}

export function TopInsightTable({ title, rows, emptyMessage, primaryLabel, onSelect }: TopInsightTableProps) {
  return (
    <section className="operational-card operational-card--table">
      <div className="operational-card__header">
        <h3>{title}</h3>
      </div>
      <div className="operational-card__body">
        {rows.length === 0 ? (
          <div className="operational-insights__empty">{emptyMessage}</div>
        ) : (
          <div className="operational-table-wrapper operational-table-wrapper--top5">
            <table className="operational-table operational-table--compact operational-table--top5">
              <colgroup>
                <col className="operational-table__col-main" />
                <col className="operational-table__col-metric" />
                <col className="operational-table__col-metric" />
              </colgroup>
              <thead>
                <tr>
                  <th className="operational-table__head-main">{primaryLabel}</th>
                  <th className="operational-table__head-metric">
                    <span className="operational-table__head-label">TM<br />pendiente</span>
                  </th>
                  <th className="operational-table__head-metric">
                    <span className="operational-table__head-label">Pedidos<br />incumplidos</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td className="operational-table__cell-main">
                      <Tooltip content={row.name}>
                        <button type="button" className="operational-link-button operational-link-button--multiline" onClick={() => onSelect?.(row.name)}>
                          {row.name}
                        </button>
                      </Tooltip>
                    </td>
                    <td className="operational-table__cell-metric">
                      <span className="operational-table__metric-value">{formatTm(row.tmPendiente)}</span>
                    </td>
                    <td className="operational-table__cell-metric">
                      <span className="operational-table__metric-value">{formatNumber(row.pedidosIncumplidos)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}