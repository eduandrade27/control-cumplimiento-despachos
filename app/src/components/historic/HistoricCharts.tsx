import { memo, useState } from 'react'
import { Tooltip } from '../Tooltip'
import { formatNumber, formatPercent } from '../../lib/operationalFormat'
import type { HistoricComparisonRow, HistoricEvolutionMetric } from '../../types/historic'

interface HistoricChartsProps {
  rows: HistoricComparisonRow[]
  highlightedPeriodKey: string | null
  onSelectPeriod: (periodKey: string) => void
}

interface ComplianceLineChartProps {
  rows: HistoricComparisonRow[]
  highlightedPeriodKey: string | null
  onSelectPeriod: (periodKey: string) => void
  yMax: number
}

interface GroupedBarChartProps {
  rows: HistoricComparisonRow[]
  highlightedPeriodKey: string | null
  onSelectPeriod: (periodKey: string) => void
  firstKey: 'tmProgramadas' | 'programmedOrders'
  secondKey: 'tmDespachadas' | 'fulfilledOrders'
  thirdKey: 'tmPendientes' | 'unfulfilledOrders'
  firstLabel: string
  secondLabel: string
  thirdLabel: string
  unit: 'TM' | 'pedidos'
  firstClassName: string
  secondClassName: string
  thirdClassName: string
}

function asChartPercent(value: number | null, yMax: number): number {
  if (value === null || Number.isNaN(value)) {
    return 0
  }

  return Math.max(0, Math.min(yMax, value))
}

function ChartCard({ title, description, actions, children }: {
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="operational-card">
      <header className="operational-card__header historic-page__chart-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {actions}
      </header>
      <div className="operational-card__body">{children}</div>
    </section>
  )
}

function getVisibleIndexSet(length: number, maxLabels = 7): Set<number> {
  if (length <= maxLabels) {
    return new Set(Array.from({ length }, (_, index) => index))
  }

  const set = new Set<number>()
  const step = Math.ceil(length / maxLabels)

  for (let index = 0; index < length; index += step) {
    set.add(index)
  }

  set.add(length - 1)
  return set
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
}

function ComplianceLineChart({
  rows,
  highlightedPeriodKey,
  onSelectPeriod,
  yMax,
}: ComplianceLineChartProps) {
  if (!rows.some((row) => row.complianceOrdersPct !== null || row.complianceTmPct !== null)) {
    return <div className="operational-insights__empty">Sin información evaluable.</div>
  }

  const width = 820
  const height = 250
  const padding = { top: 16, right: 16, bottom: 44, left: 48 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom
  const labelsToShow = getVisibleIndexSet(rows.length)

  const points = rows.map((row, index) => {
    const x = padding.left + (graphWidth * index) / Math.max(1, rows.length - 1)
    const complianceOrders = asChartPercent(row.complianceOrdersPct, yMax)
    const complianceTm = asChartPercent(row.complianceTmPct, yMax)

    return {
      periodKey: row.periodKey,
      label: row.periodLabel,
      ordersValue: complianceOrders,
      tmValue: complianceTm,
      x,
      ordersY: padding.top + graphHeight - (complianceOrders / yMax) * graphHeight,
      tmY: padding.top + graphHeight - (complianceTm / yMax) * graphHeight,
    }
  })

  const yTicks = [0, 20, 40, 60, 80, 100]

  return (
    <svg className="operational-chart historic-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución del cumplimiento por pedidos y por TM">
      {yTicks.map((tick) => {
        const y = padding.top + graphHeight - (tick / yMax) * graphHeight
        return (
          <g key={tick}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="operational-chart__grid" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" className="operational-chart__y-label">{tick}%</text>
          </g>
        )
      })}

      {points.length > 1 && (
        <>
          <path d={buildLinePath(points.map((point) => ({ x: point.x, y: point.ordersY })))} className="historic-chart__line historic-chart__line--orders-compliance" />
          <path d={buildLinePath(points.map((point) => ({ x: point.x, y: point.tmY })))} className="historic-chart__line historic-chart__line--tm-compliance" />
        </>
      )}

      {points.map((point, index) => {
        const isHighlighted = highlightedPeriodKey === point.periodKey
        return (
          <g key={point.periodKey}>
            <Tooltip content={`Período: ${point.label}\nCumplimiento pedidos: ${formatPercent(point.ordersValue)}`}>
              <circle
                cx={point.x}
                cy={point.ordersY}
                r={isHighlighted ? 5 : 4}
                className={`historic-chart__dot historic-chart__dot--orders ${isHighlighted ? 'is-highlighted' : ''}`}
                onClick={() => onSelectPeriod(point.periodKey)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectPeriod(point.periodKey)
                  }
                }}
              />
            </Tooltip>

            <Tooltip content={`Período: ${point.label}\nCumplimiento TM: ${formatPercent(point.tmValue)}`}>
              <circle
                cx={point.x}
                cy={point.tmY}
                r={isHighlighted ? 5 : 4}
                className={`historic-chart__dot historic-chart__dot--tm ${isHighlighted ? 'is-highlighted' : ''}`}
                onClick={() => onSelectPeriod(point.periodKey)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectPeriod(point.periodKey)
                  }
                }}
              />
            </Tooltip>

            {labelsToShow.has(index) && (
              <text x={point.x} y={height - 14} textAnchor="middle" className="operational-chart__x-label">{point.label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function GroupedBarChart({
  rows,
  highlightedPeriodKey,
  onSelectPeriod,
  firstKey,
  secondKey,
  thirdKey,
  firstLabel,
  secondLabel,
  thirdLabel,
  unit,
  firstClassName,
  secondClassName,
  thirdClassName,
}: GroupedBarChartProps) {
  if (unit === 'pedidos' && !rows.some((row) => row.fulfilledOrders !== null || row.unfulfilledOrders !== null)) {
    return <div className="operational-insights__empty">Sin información evaluable.</div>
  }

  const width = 820
  const height = 250
  const padding = { top: 16, right: 16, bottom: 44, left: 48 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom
  const groupWidth = graphWidth / Math.max(1, rows.length)
  const labelsToShow = getVisibleIndexSet(rows.length)

  const maxValue = Math.max(1, ...rows.map((row) => Math.max(
    Number(row[firstKey]),
    Number(row[secondKey]),
    Number(row[thirdKey]),
  )))

  const yTicks = [0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue].map((value) => Number(value.toFixed(2)))

  return (
    <svg className="operational-chart historic-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución de series agrupadas">
      {yTicks.map((tick) => {
        const y = padding.top + graphHeight - (Math.max(0, tick) / maxValue) * graphHeight
        return (
          <g key={tick}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="operational-chart__grid" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" className="operational-chart__y-label">{formatNumber(tick, unit === 'TM' ? 1 : 0)}</text>
          </g>
        )
      })}

      {rows.map((row, index) => {
        const values = [
          { key: firstLabel, value: Number(row[firstKey]), className: firstClassName },
          { key: secondLabel, value: Number(row[secondKey]), className: secondClassName },
          { key: thirdLabel, value: Number(row[thirdKey]), className: thirdClassName },
        ]
        const innerWidth = Math.max(14, groupWidth - 10)
        const barGap = 4
        const barWidth = (innerWidth - barGap * 2) / 3
        const groupX = padding.left + index * groupWidth
        const baseX = groupX + (groupWidth - innerWidth) / 2
        const isHighlighted = highlightedPeriodKey === row.periodKey

        return (
          <g key={row.periodKey} className={isHighlighted ? 'historic-chart__group is-highlighted' : 'historic-chart__group'}>
            {values.map((entry, valueIndex) => {
              const value = Math.max(0, entry.value)
              const barHeight = (value / maxValue) * graphHeight
              const x = baseX + valueIndex * (barWidth + barGap)
              const y = padding.top + graphHeight - barHeight

              return (
                <Tooltip content={`Período: ${row.periodLabel}\n${entry.key}: ${formatNumber(value, unit === 'TM' ? 2 : 0)} ${unit}`}>
                  <rect
                    key={`${row.periodKey}-${entry.key}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, barHeight)}
                    rx={3}
                    className={`historic-chart__bar ${entry.className}`}
                    onClick={() => onSelectPeriod(row.periodKey)}
                  />
                </Tooltip>
              )
            })}

            {labelsToShow.has(index) && (
              <text x={groupX + groupWidth / 2} y={height - 14} textAnchor="middle" className="operational-chart__x-label">{row.periodLabel}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Legend({ items }: { items: Array<{ label: string; className: string }> }) {
  return (
    <div className="historic-chart__legend" role="list" aria-label="Leyenda del gráfico">
      {items.map((item) => (
        <div key={item.label} className="historic-chart__legend-item" role="listitem">
          <span className={`historic-chart__legend-dot ${item.className}`} aria-hidden="true" />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export const HistoricCharts = memo(function HistoricCharts({ rows, highlightedPeriodKey, onSelectPeriod }: HistoricChartsProps) {
  const [evolutionMetric, setEvolutionMetric] = useState<HistoricEvolutionMetric>('TM')

  if (rows.length === 0) {
    return (
      <div className="historic-page__charts-grid">
        <section className="operational-card">
          <header className="operational-card__header">
            <h3>Evolución de cumplimiento</h3>
          </header>
          <div className="operational-insights__empty">No existen datos para los filtros seleccionados.</div>
        </section>
        <section className="operational-card">
          <header className="operational-card__header">
            <h3>Evolución de volumen</h3>
          </header>
          <div className="operational-insights__empty">No existen datos para los filtros seleccionados.</div>
        </section>
      </div>
    )
  }

  const isTmMetric = evolutionMetric === 'TM'

  return (
    <div className="historic-page__charts-grid">
      <ChartCard
        title="Evolución de cumplimiento"
        description="Seguimiento por período para cumplimiento por pedidos y por TM."
      >
        <Legend
          items={[
            { label: 'Cumplimiento por pedidos', className: 'historic-chart__series--orders-compliance' },
            { label: 'Cumplimiento por TM', className: 'historic-chart__series--tm-compliance' },
          ]}
        />
        <ComplianceLineChart
          rows={rows}
          highlightedPeriodKey={highlightedPeriodKey}
          onSelectPeriod={onSelectPeriod}
          yMax={100}
        />
      </ChartCard>

      <ChartCard
        title="Evolución comparativa"
        description={isTmMetric
          ? 'TM Programadas, TM Despachadas y TM Pendientes por período.'
          : 'Pedidos programados, cumplidos e incumplidos por período.'}
        actions={(
          <div className="historic-page__chart-toggle" role="group" aria-label="Métrica de evolución">
            <button
              type="button"
              className={`historic-page__chart-toggle-button ${isTmMetric ? 'is-active' : ''}`}
              onClick={() => setEvolutionMetric('TM')}
            >
              TM
            </button>
            <button
              type="button"
              className={`historic-page__chart-toggle-button ${!isTmMetric ? 'is-active' : ''}`}
              onClick={() => setEvolutionMetric('PEDIDOS')}
            >
              Pedidos
            </button>
          </div>
        )}
      >
        {isTmMetric ? (
          <>
            <Legend
              items={[
                { label: 'TM Programadas', className: 'historic-chart__series--programmed' },
                { label: 'TM Despachadas', className: 'historic-chart__series--dispatched' },
                { label: 'TM Pendientes', className: 'historic-chart__series--pending' },
              ]}
            />
            <GroupedBarChart
              rows={rows}
              highlightedPeriodKey={highlightedPeriodKey}
              onSelectPeriod={onSelectPeriod}
              firstKey="tmProgramadas"
              secondKey="tmDespachadas"
              thirdKey="tmPendientes"
              firstLabel="TM Programadas"
              secondLabel="TM Despachadas"
              thirdLabel="TM Pendientes"
              unit="TM"
              firstClassName="historic-chart__series--programmed"
              secondClassName="historic-chart__series--dispatched"
              thirdClassName="historic-chart__series--pending"
            />
          </>
        ) : (
          <>
            <Legend
              items={[
                { label: 'Pedidos programados', className: 'historic-chart__series--programmed' },
                { label: 'Pedidos cumplidos', className: 'historic-chart__series--fulfilled' },
                { label: 'Pedidos incumplidos', className: 'historic-chart__series--unfulfilled' },
              ]}
            />
            <GroupedBarChart
              rows={rows}
              highlightedPeriodKey={highlightedPeriodKey}
              onSelectPeriod={onSelectPeriod}
              firstKey="programmedOrders"
              secondKey="fulfilledOrders"
              thirdKey="unfulfilledOrders"
              firstLabel="Pedidos programados"
              secondLabel="Pedidos cumplidos"
              thirdLabel="Pedidos incumplidos"
              unit="pedidos"
              firstClassName="historic-chart__series--programmed"
              secondClassName="historic-chart__series--fulfilled"
              thirdClassName="historic-chart__series--unfulfilled"
            />
          </>
        )}
      </ChartCard>
    </div>
  )
})
