import { formatNumber, formatPercent, formatTm } from '../../lib/operationalFormat'
import type { OperationalInsightSeriesPoint, OperationalTopRow } from '../../types/operationalInsights'
import { Tooltip } from '../Tooltip'
import { TopInsightTable } from './TopInsightTable'

interface OperationalChartsProps {
  temporalSeries: OperationalInsightSeriesPoint[]
  incumplimientosSeries: OperationalInsightSeriesPoint[]
  volumeSeries: OperationalInsightSeriesPoint[]
  areaIncidents: OperationalInsightSeriesPoint[]
  areaPendingTm: OperationalInsightSeriesPoint[]
  topCauseRows: OperationalTopRow[]
  topClientRows: OperationalTopRow[]
  hasAreaFilter: boolean
  onSelectCausa?: (causa: string) => void
  onSelectArea?: (area: string) => void
  onSelectCliente?: (cliente: string) => void
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="operational-card">
      <div className="operational-card__header">
        <h3>{title}</h3>
      </div>
      <div className="operational-card__body">{children}</div>
    </section>
  )
}

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-')
  if (!year || !month || !day) {
    return dateKey
  }

  return `${day}/${month}`
}

function getVisibleIndexSet(length: number, maxLabels = 6): Set<number> {
  if (length <= 0) {
    return new Set<number>()
  }

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

function ComplianceLineChart({ data }: { data: OperationalInsightSeriesPoint[] }) {
  const width = 720
  const height = 220
  const padding = { top: 12, right: 12, bottom: 36, left: 42 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom

  const points = data.map((item, index) => {
    const x = padding.left + (graphWidth * index) / Math.max(1, data.length - 1)
    const yValue = Math.max(0, Math.min(100, Number(item.value ?? 0)))
    const y = padding.top + graphHeight - (graphHeight * yValue) / 100

    return {
      ...item,
      x,
      y,
      yValue,
    }
  })

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
  const labelsToShow = getVisibleIndexSet(points.length)
  const y90 = padding.top + graphHeight - graphHeight * 0.9
  const y100 = padding.top
  const refLabelX100 = width - padding.right - 6
  const refLabelX90 = width - padding.right - 42

  return (
    <svg className="operational-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumplimiento diario últimos 30 días">
      <line x1={padding.left} y1={y90} x2={width - padding.right} y2={y90} className="operational-chart__ref operational-chart__ref--warning" />
      <line x1={padding.left} y1={y100} x2={width - padding.right} y2={y100} className="operational-chart__ref operational-chart__ref--success" />
      <line x1={padding.left} y1={padding.top + graphHeight} x2={width - padding.right} y2={padding.top + graphHeight} className="operational-chart__axis" />

      {points.length > 1 && <path d={path} className="operational-chart__line" />}

      {points.map((point, index) => (
        <g key={point.dateKey ?? point.label}>
          <Tooltip content={`Fecha: ${point.label}\nPedidos cumplidos: ${formatNumber(point.pedidosCumplidos ?? null)}\nTotal pedidos: ${formatNumber(point.totalPedidos ?? null)}\nCumplimiento: ${formatPercent(point.yValue)}`}>
            <circle cx={point.x} cy={point.y} r={3.5} className="operational-chart__dot" />
          </Tooltip>
          {labelsToShow.has(index) && (
            <text x={point.x} y={height - 12} textAnchor="middle" className="operational-chart__x-label">
              {formatDateLabel(point.label)}
            </text>
          )}
        </g>
      ))}

      <text x={refLabelX100} y={y100 + 10} textAnchor="end" className="operational-chart__ref-label">100%</text>
      <text x={refLabelX90} y={y90 + 10} textAnchor="end" className="operational-chart__ref-label">90%</text>
    </svg>
  )
}

function getIntegerYAxisTicks(maxValue: number): number[] {
  const safeMax = Math.max(1, Math.ceil(maxValue))
  const step = Math.max(1, Math.ceil(safeMax / 4))
  const ticks = new Set<number>([0, safeMax])

  for (let value = step; value < safeMax; value += step) {
    ticks.add(value)
  }

  return Array.from(ticks).sort((left, right) => left - right)
}

function IncumplimientosBarChart({ data }: { data: OperationalInsightSeriesPoint[] }) {
  const width = 720
  const height = 220
  const padding = { top: 12, right: 12, bottom: 36, left: 42 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom
  const maxValue = Math.max(1, ...data.map((item) => Number(item.value ?? 0)))
  const labelsToShow = getVisibleIndexSet(data.length)
  const groupWidth = graphWidth / Math.max(1, data.length)
  const yTicks = getIntegerYAxisTicks(maxValue)

  return (
    <svg className="operational-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Incumplimientos diarios últimos 30 días">
      <line x1={padding.left} y1={padding.top + graphHeight} x2={width - padding.right} y2={padding.top + graphHeight} className="operational-chart__axis" />

      {yTicks.map((tick) => {
        const y = padding.top + graphHeight - (Math.max(0, tick) / maxValue) * graphHeight
        return (
          <g key={tick}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="operational-chart__grid" />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" className="operational-chart__y-label">
              {tick}
            </text>
          </g>
        )
      })}

      {data.map((point, index) => {
        const groupX = padding.left + index * groupWidth
        const barWidth = Math.max(8, groupWidth - 10)
        const value = Math.max(0, Number(point.value ?? 0))
        const barHeight = (value / maxValue) * graphHeight
        const x = groupX + (groupWidth - barWidth) / 2
        const y = padding.top + graphHeight - barHeight

        return (
          <g key={point.dateKey ?? point.label}>
            <Tooltip content={`Fecha: ${point.label}\nPedidos incumplidos: ${formatNumber(value)}`}>
              <rect x={x} y={y} width={barWidth} height={Math.max(2, barHeight)} rx={3} className="operational-chart__bar operational-chart__bar--dispatched" />
            </Tooltip>
            {labelsToShow.has(index) && (
              <text x={groupX + groupWidth / 2} y={height - 12} textAnchor="middle" className="operational-chart__x-label">
                {formatDateLabel(point.label)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function GroupedTmBarChart({ data }: { data: OperationalInsightSeriesPoint[] }) {
  const width = 720
  const height = 220
  const padding = { top: 12, right: 12, bottom: 36, left: 42 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom
  const maxValue = Math.max(1, ...data.map((item) => Math.max(Number(item.value ?? 0), Number(item.secondaryValue ?? 0))))
  const labelsToShow = getVisibleIndexSet(data.length)
  const groupWidth = graphWidth / Math.max(1, data.length)

  return (
    <svg className="operational-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="TM programadas y despachadas últimos 30 días">
      <line x1={padding.left} y1={padding.top + graphHeight} x2={width - padding.right} y2={padding.top + graphHeight} className="operational-chart__axis" />

      {data.map((point, index) => {
        const groupX = padding.left + index * groupWidth
        const barGap = 4
        const innerWidth = Math.max(10, groupWidth - 8)
        const barWidth = (innerWidth - barGap) / 2
        const programmed = Number(point.value ?? 0)
        const dispatched = Number(point.secondaryValue ?? 0)
        const programmedHeight = (Math.max(0, programmed) / maxValue) * graphHeight
        const dispatchedHeight = (Math.max(0, dispatched) / maxValue) * graphHeight
        const programmedX = groupX + 4
        const dispatchedX = programmedX + barWidth + barGap
        const programmedY = padding.top + graphHeight - programmedHeight
        const dispatchedY = padding.top + graphHeight - dispatchedHeight

        return (
          <g key={point.dateKey ?? point.label}>
            <Tooltip content={`Fecha: ${point.label}\nTM programadas: ${formatTm(programmed)}\nTM despachadas: ${formatTm(dispatched)}`}>
              <rect x={programmedX} y={programmedY} width={barWidth} height={Math.max(2, programmedHeight)} rx={3} className="operational-chart__bar operational-chart__bar--programmed" />
            </Tooltip>
            <Tooltip content={`Fecha: ${point.label}\nTM programadas: ${formatTm(programmed)}\nTM despachadas: ${formatTm(dispatched)}`}>
              <rect x={dispatchedX} y={dispatchedY} width={barWidth} height={Math.max(2, dispatchedHeight)} rx={3} className="operational-chart__bar operational-chart__bar--dispatched" />
            </Tooltip>
            {labelsToShow.has(index) && (
              <text x={groupX + groupWidth / 2} y={height - 12} textAnchor="middle" className="operational-chart__x-label">
                {formatDateLabel(point.label)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function OperationalCharts({
  temporalSeries,
  incumplimientosSeries,
  volumeSeries,
  areaIncidents,
  areaPendingTm,
  topCauseRows,
  topClientRows,
  hasAreaFilter,
  onSelectCausa,
  onSelectArea,
  onSelectCliente,
}: OperationalChartsProps) {
  return (
    <div className="operational-insights">
      <div className="operational-insights__grid operational-insights__grid--two">
        <ChartCard title={hasAreaFilter ? 'Incumplimientos últimos 30 días' : 'Cumplimiento últimos 30 días'}>
          {hasAreaFilter
            ? (
              incumplimientosSeries.length === 0
                ? <div className="operational-insights__empty">No hay incumplimientos en la ventana móvil.</div>
                : <IncumplimientosBarChart data={incumplimientosSeries} />
            )
            : (
              temporalSeries.length === 0
                ? <div className="operational-insights__empty">No hay días con programación en la ventana móvil.</div>
                : <ComplianceLineChart data={temporalSeries} />
            )}
        </ChartCard>

        <ChartCard title="TM últimos 30 días">
          {volumeSeries.length === 0
            ? <div className="operational-insights__empty">No hay días con programación en la ventana móvil.</div>
            : <GroupedTmBarChart data={volumeSeries} />}
        </ChartCard>
      </div>

      <div className="operational-insights__grid operational-insights__grid--two operational-insights__grid--equal">
        <ChartCard title="Pedidos incumplidos por área">
          {areaIncidents.length === 0 ? (
            <div className="operational-insights__empty">Sin datos para áreas.</div>
          ) : (
            <div className="operational-insights__list" role="list">
              {areaIncidents.map((item) => (
                <button key={item.label} type="button" className="operational-insights__list-item" onClick={() => onSelectArea?.(item.label)}>
                  <span>{item.label}</span>
                  <strong>{formatNumber(item.value)}</strong>
                </button>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="TM pendiente por área">
          {areaPendingTm.length === 0 ? (
            <div className="operational-insights__empty">Sin datos para áreas.</div>
          ) : (
            <div className="operational-insights__list" role="list">
              {areaPendingTm.map((item) => (
                <button key={item.label} type="button" className="operational-insights__list-item" onClick={() => onSelectArea?.(item.label)}>
                  <span>{item.label}</span>
                  <strong>{formatTm(item.value)}</strong>
                </button>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="operational-insights__grid operational-insights__grid--two operational-insights__grid--equal">
        <TopInsightTable
          title="Top 5 causas por TM pendiente"
          rows={topCauseRows}
          emptyMessage="Sin causas para los filtros seleccionados."
          primaryLabel="Causa"
          onSelect={onSelectCausa}
        />

        <TopInsightTable
          title="Top 5 clientes por TM pendiente"
          rows={topClientRows}
          emptyMessage="Sin clientes para los filtros seleccionados."
          primaryLabel="Cliente"
          onSelect={onSelectCliente}
        />
      </div>
    </div>
  )
}
