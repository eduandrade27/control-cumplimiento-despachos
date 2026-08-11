import { useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from '../components/Tooltip'
import { GlobalMonthFilter, GlobalYearFilter } from '../components/GlobalPeriodFilters'
import { useCausesAnalysisDashboard } from '../hooks/useCausesAnalysisDashboard'
import type {
  CauseOperationalRow,
  CausesIndicatorMode,
  CausesSectorFilter,
} from '../types/causesAnalysis'

interface ParetoRow extends CauseOperationalRow {
  partPct: number | null
  acumPct: number | null
}

interface TableRow extends CauseOperationalRow {
  partPct: number | null
  acumPct: number | null
}

type SeverityLevel = 'Bajo' | 'Medio' | 'Medio-Alto' | 'Alto'

interface SeverityReference {
  referencePct: number
  effectiveReferencePct: number
  q1: number
  q3: number
  iqr: number
  upperLimit: number
  outlierCount: number
}

interface CauseSeverityRow {
  causa: string
  impactPct: number
  coveragePct: number | null
  severityIndex: number
  level: SeverityLevel
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function formatNumber(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  return `${value.toFixed(digits)}%`
}

function computeMedian(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle] ?? 0
}

function buildParetoRows(rows: CauseOperationalRow[]): ParetoRow[] {
  const sorted = [...rows].sort((left, right) => {
    return right.tmPendiente - left.tmPendiente || right.pedidos - left.pedidos
  })

  const total = sorted.reduce((sum, row) => sum + row.tmPendiente, 0)
  let cumulative = 0

  return sorted.map((row) => {
    const partPct = total > 0 ? (row.tmPendiente / total) * 100 : null

    cumulative += row.tmPendiente

    return {
      ...row,
      partPct,
      acumPct: total > 0 ? (cumulative / total) * 100 : null,
    }
  })
}

function getCriticalCauseRows(rows: ParetoRow[], targetPct = 80): ParetoRow[] {
  if (rows.length === 0) {
    return []
  }

  const result: ParetoRow[] = []

  for (const row of rows) {
    result.push(row)
    if ((row.acumPct ?? 0) >= targetPct) {
      break
    }
  }

  return result
}

function getTopAreaByTm(rows: CauseOperationalRow[]): string | null {
  if (rows.length === 0) {
    return null
  }

  const areaTotals = rows.reduce<Record<string, number>>((acc, row) => {
    const areaKey = row.area?.trim() || 'Sin área'
    acc[areaKey] = (acc[areaKey] ?? 0) + row.tmPendiente
    return acc
  }, {})

  const sorted = Object.entries(areaTotals).sort((left, right) => right[1] - left[1])
  return sorted[0]?.[0] ?? null
}

function getImpactTm(rows: CauseOperationalRow[]): number {
  return rows.reduce((sum, row) => sum + row.tmPendiente, 0)
}

function getSeverityLevel(impactPct: number): SeverityLevel {
  if (impactPct < 2) {
    return 'Bajo'
  }

  if (impactPct < 5) {
    return 'Medio'
  }

  if (impactPct < 10) {
    return 'Medio-Alto'
  }

  return 'Alto'
}

function computeQuantile(sortedValues: number[], quantile: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  if (sortedValues.length === 1) {
    return sortedValues[0] ?? 0
  }

  const position = (sortedValues.length - 1) * quantile
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const lowerValue = sortedValues[lower] ?? 0
  const upperValue = sortedValues[upper] ?? lowerValue

  if (lower === upper) {
    return lowerValue
  }

  return lowerValue + (upperValue - lowerValue) * (position - lower)
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function buildSeverityReference(
  snapshots: Array<{ monthKey: string; rows: CauseOperationalRow[] }>,
): SeverityReference | null {
  if (snapshots.length === 0) {
    return null
  }

  const topImpacts = snapshots
    .map((snapshot) => {
      if (snapshot.rows.length === 0) {
        return null
      }

      const totalTm = snapshot.rows.reduce((sum, row) => sum + row.tmPendiente, 0)
      if (totalTm <= 0) {
        return null
      }

      const principalCause = snapshot.rows[0]
      if (!principalCause) {
        return null
      }

      return (principalCause.tmPendiente / totalTm) * 100
    })
    .filter((value): value is number => value !== null)

  if (topImpacts.length === 0) {
    return null
  }

  const sorted = [...topImpacts].sort((left, right) => left - right)
  const q1 = computeQuantile(sorted, 0.25)
  const q3 = computeQuantile(sorted, 0.75)
  const iqr = q3 - q1
  const upperLimit = q3 + 1.5 * iqr
  const nonOutlierValues = sorted.filter((value) => value <= upperLimit)
  const referencePct = nonOutlierValues.length > 0
    ? Math.max(...nonOutlierValues)
    : Math.max(...sorted)

  return {
    referencePct,
    effectiveReferencePct: referencePct <= 10 ? 10 : referencePct,
    q1,
    q3,
    iqr,
    upperLimit,
    outlierCount: sorted.length - nonOutlierValues.length,
  }
}

function computeSeverityIndex(impactPct: number, reference: SeverityReference | null): number {
  if (!Number.isFinite(impactPct) || impactPct < 0) {
    return 1
  }

  if (impactPct < 2) {
    const ratio = clamp(impactPct / 2, 0, 1)
    return roundToOneDecimal(1 + ratio * 1.9)
  }

  if (impactPct < 5) {
    const ratio = clamp((impactPct - 2) / 3, 0, 1)
    return roundToOneDecimal(3 + ratio * 2.9)
  }

  if (impactPct < 10) {
    const ratio = clamp((impactPct - 5) / 5, 0, 1)
    return roundToOneDecimal(6 + ratio * 1.9)
  }

  if (!reference || reference.effectiveReferencePct <= 10) {
    return 10
  }

  if (impactPct > reference.upperLimit) {
    return 10
  }

  if (impactPct >= reference.effectiveReferencePct) {
    return 10
  }

  const ratio = clamp((impactPct - 10) / (reference.effectiveReferencePct - 10), 0, 1)
  return roundToOneDecimal(8 + ratio * 2)
}

function getSeverityToneClass(level: SeverityLevel): string {
  if (level === 'Alto') {
    return 'is-high'
  }

  if (level === 'Medio-Alto') {
    return 'is-medium-high'
  }

  if (level === 'Medio') {
    return 'is-medium'
  }

  return 'is-low'
}

type TableSortKey = 'TM' | 'PEDIDOS'

function buildTableRows(
  rows: CauseOperationalRow[],
  sortKey: TableSortKey,
  sortDirection: 'asc' | 'desc',
): TableRow[] {
  const sorted = [...rows].sort((left, right) => {
    const leftValue = sortKey === 'TM' ? left.tmPendiente : left.pedidos
    const rightValue = sortKey === 'TM' ? right.tmPendiente : right.pedidos
    const primary = sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue

    if (primary !== 0) {
      return primary
    }

    return sortDirection === 'asc'
      ? left.causa.localeCompare(right.causa, 'es', { sensitivity: 'base' })
      : right.causa.localeCompare(left.causa, 'es', { sensitivity: 'base' })
  })

  const metricTotal = sorted.reduce((sum, row) => sum + row.tmPendiente, 0)
  let cumulativeMetric = 0

  return sorted.map((row) => {
    const partPct = metricTotal > 0 ? (row.tmPendiente / metricTotal) * 100 : null

    cumulativeMetric += row.tmPendiente

    return {
      ...row,
      partPct,
      acumPct: metricTotal > 0 ? (cumulativeMetric / metricTotal) * 100 : null,
    }
  })
}

function formatParetoTooltip(row: ParetoRow): string {
  return [
    `Causa: ${row.causa}`,
    `Área: ${row.area || 'Sin área'}`,
    `Pedidos: ${formatNumber(row.pedidos)}`,
    `TM pendientes: ${formatNumber(row.tmPendiente, 2)}`,
    `% participación: ${formatPercent(row.partPct)}`,
    `% acumulado: ${formatPercent(row.acumPct)}`,
  ].join('\n')
}

function splitLabelInTwoLines(label: string, maxFirstLineChars = 34): [string, string | null] {
  if (label.length <= maxFirstLineChars) {
    return [label, null]
  }

  const splitAt = label.lastIndexOf(' ', maxFirstLineChars)
  if (splitAt <= 0) {
    return [label, null]
  }

  return [label.slice(0, splitAt), label.slice(splitAt + 1)]
}

function formatMatrixTooltip(row: CauseOperationalRow): string {
  return [
    `Causa: ${row.causa}`,
    `Pedidos: ${formatNumber(row.pedidos)}`,
    `TM pendientes: ${formatNumber(row.tmPendiente, 2)}`,
    `Área: ${row.area || 'Sin área'}`,
  ].join('\n')
}

function ParetoChart({
  rows,
  selectedCause,
  onSelectCause,
}: {
  rows: ParetoRow[]
  selectedCause: string | null
  onSelectCause: (cause: string) => void
}) {
  if (rows.length === 0) {
    return <div className="operational-insights__empty">No existen causas para los filtros seleccionados.</div>
  }

  const maxLabelChars = Math.max(...rows.map((row) => row.causa.length), 10)
  const baseLeftPadding = Math.min(520, Math.max(260, maxLabelChars * 6.6))
  const leftPadding = Math.max(200, Math.round(baseLeftPadding * 0.75))
  const valueLabelReserveRight = 72
  const width = Math.max(980, leftPadding + 620) + valueLabelReserveRight
  const rowHeight = 42
  const height = rows.length * rowHeight + 92
  const padding = { top: 18, right: 58 + valueLabelReserveRight, bottom: 42, left: leftPadding }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom
  const maxMetric = Math.max(1, ...rows.map((row) => row.tmPendiente))
  const yTicks = [0, 25, 50, 75, 100]
  const barHeight = 22

  return (
    <div className="causes-analysis__pareto-scroll">
      <svg className="causes-analysis__pareto-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pareto de causas">
        <line
          x1={padding.left}
          y1={padding.top + graphHeight}
          x2={width - padding.right}
          y2={padding.top + graphHeight}
          className="operational-chart__axis"
        />

        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + graphHeight}
          className="operational-chart__axis"
        />

        {yTicks.map((tick) => {
          const x = padding.left + (tick / 100) * graphWidth
          return (
            <g key={tick}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + graphHeight} className="operational-chart__grid" />
              <text x={x} y={height - 12} textAnchor="middle" className="operational-chart__y-label">{tick}%</text>
            </g>
          )
        })}

        {rows.map((row, index) => {
          const y = padding.top + index * rowHeight + (rowHeight - barHeight) / 2
          const yCenter = y + barHeight / 2
          const barWidth = (Math.max(0, row.tmPendiente) / maxMetric) * graphWidth
          const isSelected = selectedCause === row.causa
          const [lineOne, lineTwo] = splitLabelInTwoLines(row.causa)

          return (
            <g key={`${row.causa}-${index}`}>
              <text
                x={padding.left - 10}
                y={yCenter}
                textAnchor="end"
                className="causes-analysis__pareto-label"
              >
                <tspan x={padding.left - 10} dy={lineTwo ? '-0.45em' : '0.32em'}>{lineOne}</tspan>
                {lineTwo && <tspan x={padding.left - 10} dy="1.05em">{lineTwo}</tspan>}
              </text>

              <Tooltip content={formatParetoTooltip(row)}>
                <rect
                  x={padding.left}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={6}
                  className={`causes-analysis__pareto-bar ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onSelectCause(row.causa)}
                />
              </Tooltip>

              <text
                x={padding.left + barWidth + 8}
                y={yCenter + 4}
                textAnchor="start"
                className="causes-analysis__pareto-value"
              >
                {formatNumber(row.tmPendiente, 2)} TM · {formatPercent(row.partPct)}
              </text>
            </g>
          )
        })}

        <text x={padding.left} y={padding.top - 4} className="operational-chart__y-label">TM pendientes (barras)</text>
      </svg>

      <p className="causes-analysis__pareto-legend">
        Barras = TM pendientes por causa
      </p>
    </div>
  )
}

function PrioritizationMatrix({
  rows,
  selectedCause,
  onSelectCause,
}: {
  rows: CauseOperationalRow[]
  selectedCause: string | null
  onSelectCause: (cause: string) => void
}) {
  if (rows.length === 0) {
    return <div className="operational-page__state operational-page__state--empty" role="status">No existen causas ajustadas para construir la matriz.</div>
  }

  const width = 860
  const height = 360
  const padding = { top: 28, right: 26, bottom: 52, left: 58 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const medianPedidos = computeMedian(rows.map((row) => row.pedidos))
  const medianTm = computeMedian(rows.map((row) => row.tmPendiente))
  const maxPedidos = Math.max(1, ...rows.map((row) => row.pedidos))
  const maxTm = Math.max(1, ...rows.map((row) => row.tmPendiente))

  const xScale = (value: number) => padding.left + (value / maxPedidos) * chartWidth
  const yScale = (value: number) => padding.top + chartHeight - (value / maxTm) * chartHeight
  const medianX = xScale(medianPedidos)
  const medianY = yScale(medianTm)

  return (
    <div className="causes-analysis__matrix-shell">
      <svg className="causes-analysis__matrix-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Matriz de priorización">
        <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} className="causes-analysis__matrix-bg" />
        <line x1={padding.left} y1={yScale(0)} x2={padding.left + chartWidth} y2={yScale(0)} className="operational-chart__axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} className="operational-chart__axis" />

        <line x1={medianX} y1={padding.top} x2={medianX} y2={padding.top + chartHeight} className="causes-analysis__matrix-median" />
        <line x1={padding.left} y1={medianY} x2={padding.left + chartWidth} y2={medianY} className="causes-analysis__matrix-median" />

        <text x={padding.left + 8} y={padding.top + 16} className="causes-analysis__matrix-quadrant">Alto impacto / Baja frecuencia</text>
        <text x={medianX + 8} y={padding.top + 16} className="causes-analysis__matrix-quadrant">Alto impacto / Alta frecuencia</text>
        <text x={padding.left + 8} y={padding.top + chartHeight - 8} className="causes-analysis__matrix-quadrant">Bajo impacto / Baja frecuencia</text>
        <text x={medianX + 8} y={padding.top + chartHeight - 8} className="causes-analysis__matrix-quadrant">Bajo impacto / Alta frecuencia</text>

        {rows.map((row) => {
          const isSelected = selectedCause === row.causa
          const x = xScale(row.pedidos)
          const y = yScale(row.tmPendiente)

          return (
            <g key={`${row.causa}-${row.area}`}>
              <Tooltip content={formatMatrixTooltip(row)}>
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 8 : 6}
                  className={`causes-analysis__matrix-point ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onSelectCause(row.causa)}
                />
              </Tooltip>
            </g>
          )
        })}

        <text x={padding.left + chartWidth / 2} y={height - 12} textAnchor="middle" className="operational-chart__y-label">Frecuencia (Pedidos)</text>
        <text x={14} y={padding.top + chartHeight / 2} transform={`rotate(-90, 14, ${padding.top + chartHeight / 2})`} textAnchor="middle" className="operational-chart__y-label">
          Impacto (TM pendientes)
        </text>
      </svg>
    </div>
  )
}

export function CausesAnalysisPage() {
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientQuery, setClientQuery] = useState('')
  const [sortKey, setSortKey] = useState<TableSortKey>('TM')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedCause, setSelectedCause] = useState<string | null>(null)
  const [showSecondaryCauses, setShowSecondaryCauses] = useState(false)
  const [isModeInfoOpen, setIsModeInfoOpen] = useState(false)
  const [isModeInfoPulsing, setIsModeInfoPulsing] = useState(false)
  const modeInfoRef = useRef<HTMLDivElement | null>(null)

  const {
    status,
    error,
    pedidosIncumplidos,
    tmPendientesTotales,
    impactoTotalTm,
    availableYears,
    availableMonths,
    selectedYear,
    selectedMonths,
    selectedSector,
    indicatorMode,
    adjustedModeInfo,
    availableClients,
    rows,
    yearSnapshots,
    historicalMonthSnapshots,
    excludedRows,
    hasActiveFilters,
    changeYear,
    toggleMonth,
    setSelectedSector,
    setIndicatorMode,
    resetFilters,
  } = useCausesAnalysisDashboard(selectedClients)

  useEffect(() => {
    if (!selectedCause) {
      return
    }

    if (!rows.some((row) => row.causa === selectedCause)) {
      setSelectedCause(null)
    }
  }, [rows, selectedCause])

  useEffect(() => {
    if (indicatorMode !== 'AJUSTADO') {
      return
    }

    setIsModeInfoPulsing(true)
    const timeoutId = window.setTimeout(() => setIsModeInfoPulsing(false), 1600)

    return () => window.clearTimeout(timeoutId)
  }, [indicatorMode])

  useEffect(() => {
    if (!isModeInfoOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && modeInfoRef.current?.contains(target)) {
        return
      }

      setIsModeInfoOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isModeInfoOpen])

  const matchingClients = useMemo(() => {
    const normalizedQuery = normalizeSearchText(clientQuery)

    const options = availableClients.filter((client) => !selectedClients.includes(client))
    if (!normalizedQuery) {
      return options.slice(0, 8)
    }

    return options
      .filter((client) => normalizeSearchText(client).includes(normalizedQuery))
      .slice(0, 8)
  }, [availableClients, clientQuery, selectedClients])

  const addClient = (clientName: string) => {
    const trimmed = clientName.trim()
    if (!trimmed) {
      return
    }

    setSelectedClients((current) => {
      if (current.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
        return current
      }

      return [...current, trimmed]
    })

    setClientQuery('')
  }

  const removeClient = (clientName: string) => {
    setSelectedClients((current) => current.filter((item) => item !== clientName))
  }

  const handleResetFilters = () => {
    resetFilters()
    setSelectedClients([])
    setClientQuery('')
    setSelectedCause(null)
  }

  const paretoRows = useMemo(() => buildParetoRows(rows), [rows])
  const criticalParetoRows = useMemo(() => getCriticalCauseRows(paretoRows), [paretoRows])
  const criticalCauseKeys = useMemo(() => new Set(criticalParetoRows.map((row) => normalizeSearchText(row.causa))), [criticalParetoRows])

  const tableRows = useMemo(
    () => buildTableRows(rows, sortKey, sortDirection),
    [rows, sortDirection, sortKey],
  )

  const criticalTableRows = useMemo(
    () => tableRows.filter((row) => criticalCauseKeys.has(normalizeSearchText(row.causa))),
    [criticalCauseKeys, tableRows],
  )

  const secondaryTableRows = useMemo(
    () => tableRows.filter((row) => !criticalCauseKeys.has(normalizeSearchText(row.causa))),
    [criticalCauseKeys, tableRows],
  )

  const visibleTableRows = useMemo(
    () => showSecondaryCauses ? [...criticalTableRows, ...secondaryTableRows] : criticalTableRows,
    [criticalTableRows, secondaryTableRows, showSecondaryCauses],
  )

  const matrixMedians = useMemo(() => ({
    pedidos: computeMedian(rows.map((row) => row.pedidos)),
    tm: computeMedian(rows.map((row) => row.tmPendiente)),
  }), [rows])

  const topSummary = useMemo(() => {
    const totalTm = rows.reduce((sum, row) => sum + row.tmPendiente, 0)
    const topTm = criticalParetoRows.reduce((sum, row) => sum + row.tmPendiente, 0)

    return {
      visibleCauseCount: rows.length,
      topCount: criticalParetoRows.length,
      representedPct: totalTm > 0 ? (topTm / totalTm) * 100 : null,
    }
  }, [criticalParetoRows, rows])

  const hasNoRows = rows.length === 0
  const canRenderData = !hasNoRows && status !== 'loading' && status !== 'error'

  const principalCause = paretoRows[0] ?? null
  const kpiValues = {
    pedidosComprometidos: hasNoRows ? null : pedidosIncumplidos,
    tmComprometidas: hasNoRows ? null : impactoTotalTm,
  }

  const impactoTotalPct = useMemo(() => {
    if (kpiValues.tmComprometidas === null || tmPendientesTotales <= 0) {
      return null
    }

    return (kpiValues.tmComprometidas / tmPendientesTotales) * 100
  }, [kpiValues.tmComprometidas, tmPendientesTotales])

  const totalTmPeriodo = useMemo(() => rows.reduce((sum, row) => sum + row.tmPendiente, 0), [rows])

  const severityWindowSnapshots = useMemo(() => {
    const snapshotsWithData = historicalMonthSnapshots.filter((snapshot) => {
      if (snapshot.rows.length === 0) {
        return false
      }

      const monthTm = snapshot.rows.reduce((sum, row) => sum + row.tmPendiente, 0)
      return monthTm > 0
    })

    return [...snapshotsWithData]
      .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
      .slice(-12)
  }, [historicalMonthSnapshots])

  const severityReference = useMemo(() => buildSeverityReference(severityWindowSnapshots), [severityWindowSnapshots])

  const severityRows = useMemo<CauseSeverityRow[]>(() => {
    if (totalTmPeriodo <= 0) {
      return []
    }

    return tableRows.map((row) => {
      const impactPct = (row.tmPendiente / totalTmPeriodo) * 100
      const coveragePct = pedidosIncumplidos > 0 ? (row.pedidos / pedidosIncumplidos) * 100 : null

      return {
        causa: row.causa,
        impactPct,
        coveragePct,
        severityIndex: computeSeverityIndex(impactPct, severityReference),
        level: getSeverityLevel(impactPct),
      }
    })
  }, [pedidosIncumplidos, severityReference, tableRows, totalTmPeriodo])

  const severityRowsByCause = useMemo(() => {
    const entries = severityRows.map((row) => [normalizeSearchText(row.causa), row] as const)
    return new Map(entries)
  }, [severityRows])

  const highestSeverityCause = useMemo(() => {
    if (severityRows.length === 0) {
      return null
    }

    return [...severityRows].sort((left, right) => {
      const byIndex = right.severityIndex - left.severityIndex
      if (byIndex !== 0) {
        return byIndex
      }

      const byImpact = right.impactPct - left.impactPct
      if (byImpact !== 0) {
        return byImpact
      }

      return left.causa.localeCompare(right.causa, 'es', { sensitivity: 'base' })
    })[0] ?? null
  }, [severityRows])

  useEffect(() => {
    if (!highestSeverityCause) {
      return
    }

    const formula = 'Escala por tramos basada en Impacto%'

    console.groupCollapsed('[Análisis de Causas] Índice de severidad: detalle de fórmula')
    console.log('Fórmula:', formula)
    console.log('Variables:', {
      causaCritica: highestSeverityCause.causa,
      impacto: highestSeverityCause.impactPct,
      coberturaPedidos: highestSeverityCause.coveragePct,
      referenciaHistorica: severityReference?.referencePct ?? null,
      referenciaEfectiva: severityReference?.effectiveReferencePct ?? null,
      q1: severityReference?.q1 ?? null,
      q3: severityReference?.q3 ?? null,
      iqr: severityReference?.iqr ?? null,
      limiteSuperior: severityReference?.upperLimit ?? null,
      outliers: severityReference?.outlierCount ?? 0,
      tmTotalPeriodo: totalTmPeriodo,
      mesesVentana: severityWindowSnapshots.length,
    })
    console.log('Resultado final:', {
      indiceSeveridad: highestSeverityCause.severityIndex,
      nivel: highestSeverityCause.level,
    })
    console.groupEnd()
  }, [highestSeverityCause, severityReference, severityWindowSnapshots.length, totalTmPeriodo])

  const concentrationLevel = useMemo(() => {
    if (topSummary.visibleCauseCount <= 0) {
      return 'BAJA'
    }

    const criticalCausePct = (topSummary.topCount / topSummary.visibleCauseCount) * 100

    if (criticalCausePct <= 30) {
      return 'ALTA'
    }

    if (criticalCausePct <= 50) {
      return 'MEDIA'
    }

    return 'BAJA'
  }, [topSummary.topCount, topSummary.visibleCauseCount])

  const criticalCausePct = useMemo(() => {
    if (topSummary.visibleCauseCount <= 0) {
      return null
    }

    return (topSummary.topCount / topSummary.visibleCauseCount) * 100
  }, [topSummary.topCount, topSummary.visibleCauseCount])

  const leadingArea = useMemo(() => {
    return getTopAreaByTm(rows) ?? 'Sin área'
  }, [rows])

  const managementRecommendations = useMemo(() => {
    const recommendations: string[] = []
    const formatDeltaPct = (value: number): string => `${Math.abs(value).toFixed(1)}%`
    const snapshotsWithData = yearSnapshots.filter((snapshot) => snapshot.rows.length > 0)
    const sortedSnapshots = [...snapshotsWithData].sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    const selectedMonthSet = new Set(selectedMonths)
    const selectedPeriodSnapshots = sortedSnapshots.filter((snapshot) => selectedMonthSet.has(snapshot.monthKey))
    const yearMonthlyImpacts = sortedSnapshots.map((snapshot) => getImpactTm(snapshot.rows))
    const annualMonthlyAverage = yearMonthlyImpacts.length > 0
      ? yearMonthlyImpacts.reduce((sum, value) => sum + value, 0) / yearMonthlyImpacts.length
      : 0

    if (principalCause && snapshotsWithData.length > 0) {
      const principalCauseKey = normalizeSearchText(principalCause.causa)
      const recurringMonths = snapshotsWithData.reduce((count, snapshot) => {
        const criticalRows = getCriticalCauseRows(buildParetoRows(snapshot.rows))
        const isPresent = criticalRows.some((row) => normalizeSearchText(row.causa) === principalCauseKey)
        return count + (isPresent ? 1 : 0)
      }, 0)

      if (recurringMonths <= 1) {
        recommendations.push('La causa principal aparece por primera vez entre las causas críticas del histórico anual. Conviene investigar su origen antes de que se convierta en un problema recurrente.')
      } else {
        recommendations.push(recurringMonths === snapshotsWithData.length
          ? `La causa principal estuvo presente entre las causas críticas en los ${snapshotsWithData.length} meses evaluados, lo que evidencia un problema recurrente que requiere un plan de mejora estructural.`
          : `La causa principal estuvo presente entre las causas críticas en ${recurringMonths} de los ${snapshotsWithData.length} meses evaluados. La prioridad debería centrarse en un plan de mejora estructural.`)
      }
    }

    if (selectedPeriodSnapshots.length > 0) {
      const isFullYearSelection = selectedPeriodSnapshots.length === sortedSnapshots.length

      if (isFullYearSelection) {
        if (annualMonthlyAverage > 0) {
          const monthsAboveAverage = yearMonthlyImpacts.filter((impact) => impact > annualMonthlyAverage).length
          recommendations.push(`En el comportamiento anual, ${monthsAboveAverage} de los ${sortedSnapshots.length} meses quedaron por encima del promedio mensual. Resulta recomendable revisar esos meses para intervenir las causas de mayor desvío.`)
        }
      } else if (selectedPeriodSnapshots.length === 1) {
        const selectedSnapshot = selectedPeriodSnapshots[0]
        const selectedIndex = sortedSnapshots.findIndex((snapshot) => snapshot.monthKey === selectedSnapshot.monthKey)
        const previousSnapshot = selectedIndex > 0 ? sortedSnapshots[selectedIndex - 1] : null

        if (previousSnapshot && annualMonthlyAverage > 0) {
          const currentImpact = getImpactTm(selectedSnapshot.rows)
          const previousImpact = getImpactTm(previousSnapshot.rows)
          const deltaVsAnnualPct = ((currentImpact - annualMonthlyAverage) / annualMonthlyAverage) * 100
          const deltaVsPreviousPct = previousImpact > 0
            ? ((currentImpact - previousImpact) / previousImpact) * 100
            : null

          if (currentImpact > annualMonthlyAverage * 1.1 || currentImpact > previousImpact * 1.05) {
            if (deltaVsAnnualPct >= 0) {
              recommendations.push(`El impacto observado se ubica ${formatDeltaPct(deltaVsAnnualPct)} por encima del promedio mensual anual. Conviene ejecutar un plan de acción inmediato.`)
            } else if (deltaVsPreviousPct !== null && deltaVsPreviousPct > 0) {
              recommendations.push(`El impacto observado se ubica ${formatDeltaPct(deltaVsPreviousPct)} por encima del mes anterior. Será conveniente activar un plan de acción inmediato.`)
            }
          } else {
            if (deltaVsAnnualPct <= 0) {
              recommendations.push(`El impacto observado se encuentra ${formatDeltaPct(deltaVsAnnualPct)} por debajo del promedio mensual anual, evidenciando una mejora frente al comportamiento histórico.`)
            } else {
              recommendations.push(`El impacto observado se mantiene ${formatDeltaPct(deltaVsAnnualPct)} por encima del promedio mensual anual. El seguimiento debería enfocarse en sostener control cercano.`)
            }
          }
        }
      } else if (!isFullYearSelection && selectedPeriodSnapshots.length >= 2) {
        const selectedMonthlyAverage = selectedPeriodSnapshots
          .map((snapshot) => getImpactTm(snapshot.rows))
          .reduce((sum, value) => sum + value, 0) / selectedPeriodSnapshots.length
        const deltaVsAnnualPct = annualMonthlyAverage > 0
          ? ((selectedMonthlyAverage - annualMonthlyAverage) / annualMonthlyAverage) * 100
          : 0

        if (annualMonthlyAverage > 0 && selectedMonthlyAverage > annualMonthlyAverage * 1.1) {
          recommendations.push(`En los meses evaluados, el impacto promedio mensual se ubica ${formatDeltaPct(deltaVsAnnualPct)} por encima del promedio anual. Es recomendable priorizar su seguimiento.`)
        } else {
          if (deltaVsAnnualPct < 0) {
            recommendations.push(`En los meses evaluados, el impacto promedio mensual se encuentra ${formatDeltaPct(deltaVsAnnualPct)} por debajo del promedio anual, evidenciando mejora frente al histórico.`)
          } else {
            recommendations.push(`En los meses evaluados, el impacto promedio mensual se mantiene ${formatDeltaPct(deltaVsAnnualPct)} por encima del promedio anual, sin una desviación crítica.`)
          }
        }
      }
    }

    if (criticalCausePct !== null && concentrationLevel === 'ALTA') {
      recommendations.push(
        `Solo ${formatNumber(topSummary.topCount)} de las ${formatNumber(topSummary.visibleCauseCount)} causas (${formatPercent(criticalCausePct)}) concentran aproximadamente el ${formatPercent(topSummary.representedPct)} del impacto. Conviene priorizar estas causas antes de intervenir las secundarias.`,
      )
    } else if (criticalCausePct !== null && concentrationLevel === 'MEDIA') {
      recommendations.push(
        `${formatNumber(topSummary.topCount)} de las ${formatNumber(topSummary.visibleCauseCount)} causas (${formatPercent(criticalCausePct)}) concentran aproximadamente el ${formatPercent(topSummary.representedPct)} del impacto. La prioridad debería centrarse en estas causas y complementar con seguimiento a las emergentes.`,
      )
    } else if (criticalCausePct !== null) {
      recommendations.push(
        `${formatNumber(topSummary.topCount)} de las ${formatNumber(topSummary.visibleCauseCount)} causas (${formatPercent(criticalCausePct)}) concentran aproximadamente el ${formatPercent(topSummary.representedPct)} del impacto. Será conveniente una gestión transversal para evitar dispersión y sostener resultados.`,
      )
    }

    if (snapshotsWithData.length > 0) {
      const monthlyLeaders = snapshotsWithData
        .map((snapshot) => getTopAreaByTm(snapshot.rows))
        .filter((area): area is string => Boolean(area))

      if (monthlyLeaders.length > 0) {
        const areaLeadCounts = monthlyLeaders.reduce<Record<string, number>>((acc, area) => {
          acc[area] = (acc[area] ?? 0) + 1
          return acc
        }, {})

        const historicalDominantArea = Object.entries(areaLeadCounts)
          .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
        const leadingAreaMonths = areaLeadCounts[leadingArea] ?? 0
        const totalEvaluatedMonths = monthlyLeaders.length

        if (historicalDominantArea) {
          if (historicalDominantArea === leadingArea && leadingArea !== 'Sin área') {
            recommendations.push(leadingAreaMonths === 1
              ? `${leadingArea} concentró el mayor impacto solo en 1 de los ${totalEvaluatedMonths} meses evaluados. Conviene revisar las condiciones particulares de ese mes antes de definir acciones permanentes.`
              : `${leadingArea} concentró el mayor impacto en ${leadingAreaMonths} de los ${totalEvaluatedMonths} meses evaluados. Conviene mantenerla como principal foco de seguimiento.`)
          } else if (leadingArea === 'Sin área') {
            recommendations.push('Una parte relevante del impacto no tiene área definida. Será conveniente depurar esta clasificación para asignar responsables y acelerar la gestión.')
          } else {
            recommendations.push(leadingAreaMonths === 1
              ? `${leadingArea} concentró el mayor impacto solo en 1 de los ${totalEvaluatedMonths} meses evaluados. Conviene revisar las condiciones particulares de ese mes antes de definir acciones permanentes.`
              : `${leadingArea} concentró el mayor impacto en ${leadingAreaMonths} de los ${totalEvaluatedMonths} meses evaluados. El seguimiento debería enfocarse en esta área con acciones específicas.`)
          }
        }
      }
    }

    return recommendations
  }, [concentrationLevel, criticalCausePct, leadingArea, principalCause, selectedMonths, topSummary.representedPct, topSummary.topCount, topSummary.visibleCauseCount, yearSnapshots])

  const excludedSummary = useMemo(() => {
    const totalExcludedOrders = excludedRows.reduce((sum, row) => sum + row.pedidos, 0)
    const byCause = [...excludedRows]
      .sort((left, right) => right.pedidos - left.pedidos || right.tmPendiente - left.tmPendiente)
      .map((row) => ({ causa: row.causa, pedidos: row.pedidos }))

    return {
      totalExcludedOrders,
      byCause,
    }
  }, [excludedRows])

  const principalInterpretation = principalCause
    ? 'Representa la mayor oportunidad de mejora del período.'
    : 'Sin información para el período seleccionado.'

  const toggleSort = (nextKey: TableSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection('desc')
  }

  const handleIndicatorModeChange = (nextMode: CausesIndicatorMode) => {
    setIndicatorMode(nextMode)
  }

  return (
    <section className="page-card causes-analysis-page">
      <div className="operational-page__header">
        <div>
          <p className="operational-page__eyebrow">MÓDULO ANÁLISIS DE CAUSAS</p>
          <h2>Análisis de Causas</h2>
          <p>Prioriza las causas con mayor impacto para mejorar el cumplimiento del despacho.</p>
        </div>
      </div>

      <div className="operational-page__controls">
        <div className="operational-page__controls-top">
          <GlobalYearFilter
            availableYears={availableYears}
            selectedYear={selectedYear}
            onYearChange={changeYear}
          />

          <div className="operational-page__control-group">
            <span className="operational-page__label">Sector</span>
            <select
              className="operational-page__year-select"
              value={selectedSector}
              onChange={(event) => setSelectedSector(event.target.value as CausesSectorFilter)}
              aria-label="Filtrar por sector"
            >
              <option value="TODOS">Todos</option>
              <option value="AGRO">AGRO</option>
              <option value="DOMESTICO">DOMESTICO</option>
            </select>
          </div>

          <div className="operational-page__control-group operational-page__control-group--action">
            <button
              type="button"
              className="operational-page__reset operational-page__reset--compact"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="operational-page__controls-bottom">
          <GlobalMonthFilter
            availableMonths={availableMonths}
            selectedMonths={selectedMonths}
            onToggleMonth={toggleMonth}
          />

          <div className="operational-page__control-group operational-page__control-group--client">
            <span className="operational-page__label">Cliente</span>
            <div className="operational-page__client-search">
              <input
                type="text"
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (matchingClients[0]) {
                      addClient(matchingClients[0])
                    }
                  }
                }}
                placeholder="Buscar cliente..."
                className="operational-page__client-input"
                aria-label="Buscar cliente"
              />

              {clientQuery.trim().length > 0 && matchingClients.length > 0 && (
                <div className="operational-page__autocomplete" role="listbox" aria-label="Sugerencias de cliente">
                  {matchingClients.map((client) => (
                    <button
                      key={client}
                      type="button"
                      className="operational-page__autocomplete-item"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        addClient(client)
                      }}
                    >
                      {client}
                    </button>
                  ))}
                </div>
              )}

              <div className="operational-page__chip-list" role="list">
                {selectedClients.length === 0 && <span className="operational-page__empty-state operational-page__empty-state--client">Sin clientes seleccionados</span>}
                {selectedClients.map((client) => (
                  <button
                    key={client}
                    type="button"
                    className="operational-page__chip operational-page__chip--removable"
                    onClick={() => removeClient(client)}
                  >
                    {client}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="operational-card historic-page__mode-card">
        <header className="operational-card__header historic-page__mode-header">
          <div>
            <h3>Modo</h3>
            <p>Bruto considera todas las causas. Ajustado considera solo causas que afectan al indicador.</p>
          </div>
          <div className="historic-page__mode-controls">
            <div className="historic-page__mode-switch" role="group" aria-label="Modo del indicador">
              <button
                type="button"
                className={`historic-page__mode-option ${indicatorMode === 'BRUTO' ? 'is-active' : ''}`}
                onClick={() => handleIndicatorModeChange('BRUTO' as CausesIndicatorMode)}
              >
                {indicatorMode === 'BRUTO' ? '●' : '○'} Bruto
              </button>
              <Tooltip content={adjustedModeInfo.message} disabled={adjustedModeInfo.enabled}>
                <span className="historic-page__mode-option-shell">
                  <button
                    type="button"
                    className={`historic-page__mode-option ${indicatorMode === 'AJUSTADO' ? 'is-active' : ''}`}
                    onClick={() => handleIndicatorModeChange('AJUSTADO' as CausesIndicatorMode)}
                    disabled={!adjustedModeInfo.enabled}
                  >
                    {indicatorMode === 'AJUSTADO' ? '●' : '○'} Ajustado
                  </button>
                </span>
              </Tooltip>
            </div>
            <div ref={modeInfoRef} className="historic-page__mode-info-shell">
              <button
                type="button"
                className={`historic-page__info-icon ${isModeInfoPulsing ? 'is-pulsing' : ''}`}
                aria-label="Información de cálculo Bruto y Ajustado"
                aria-expanded={isModeInfoOpen}
                aria-haspopup="dialog"
                onClick={() => setIsModeInfoOpen((current) => !current)}
              >
                ⓘ
              </button>

              {isModeInfoOpen && (
                <div className="historic-page__mode-popover" role="dialog" aria-label="Ayuda de modos Bruto y Ajustado">
                  <div className="historic-page__mode-popover-section">
                    <strong>Bruto</strong>
                    <p>Considera todos los pedidos evaluados según la lógica actual.</p>
                  </div>

                  <div className="historic-page__mode-popover-section">
                    <strong>Ajustado</strong>
                    <p>Recalcula el indicador excluyendo los incumplimientos cuyas causas están configuradas como no afectantes al indicador.</p>
                  </div>

                  <div className="historic-page__mode-popover-section">
                    <strong>Causas excluidas en el período filtrado</strong>
                    {excludedSummary.byCause.length > 0 ? (
                      <ul className="historic-page__mode-popover-list" aria-label="Causas excluidas en el período filtrado">
                        {excludedSummary.byCause.map((cause) => (
                          <li key={cause.causa} className="historic-page__mode-popover-item">
                            <span className="historic-page__mode-popover-cause">{cause.causa} ({formatNumber(cause.pedidos)})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No hubo causas excluidas en el período analizado.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        {!adjustedModeInfo.enabled && (
          <div className="historic-page__mode-warning" role="status">
            {adjustedModeInfo.message}
          </div>
        )}
      </section>

      {status === 'loading' && (
        <div className="operational-page__state operational-page__state--loading" role="status">
          <div className="operational-page__skeletal-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="operational-page__skeleton" />
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="operational-page__state operational-page__state--error" role="alert">
          <h3>No se pudieron cargar los datos</h3>
          <p>{error?.message ?? 'Ocurrió un problema inesperado al consultar Análisis de Causas.'}</p>
        </div>
      )}

      {status !== 'loading' && status !== 'error' && (
        <>
          <div className="causes-analysis__kpi-grid">
            <article className="kpi-card">
              <span className="kpi-card__title">Principal causa</span>
              <strong className="kpi-card__value causes-analysis__kpi-cause">{principalCause?.causa ?? '—'}</strong>
              <span className="kpi-card__hint">{principalInterpretation}</span>
            </article>

            <article className="kpi-card">
              <span className="kpi-card__title">Concentración del problema</span>
              <strong className="kpi-card__value">{formatNumber(topSummary.topCount)} causas críticas</strong>
              <span className="kpi-card__hint">
                Priorizar estas causas generará el mayor impacto operativo.
              </span>
            </article>

            <article className="kpi-card">
              <span className="kpi-card__title">Impacto total</span>
              <strong className="kpi-card__value">{formatNumber(kpiValues.tmComprometidas, 2)} TM</strong>
              <span className="kpi-card__hint">
                {impactoTotalPct === null
                  ? 'Resume el volumen total comprometido del período.'
                  : `${formatPercent(impactoTotalPct, 1)} de ${formatNumber(tmPendientesTotales, 2)} TM pendientes`}
              </span>
            </article>

            <article className="kpi-card causes-analysis__severity-card">
              <div className="causes-analysis__severity-title-row">
                <span className="kpi-card__title">Índice de severidad</span>
                <Tooltip content="Mide la gravedad de una causa según su impacto en las TM incumplidas.">
                  <button
                    type="button"
                    className="historic-page__info-icon causes-analysis__severity-info"
                    aria-label="Información del Índice de severidad"
                  >
                    i
                  </button>
                </Tooltip>
              </div>

              {totalTmPeriodo <= 0 || highestSeverityCause === null ? (
                <>
                  <strong className="kpi-card__value">Sin información</strong>
                  <span className="kpi-card__hint">No existen TM pendientes para calcular el índice.</span>
                </>
              ) : (
                <>
                  <strong className="kpi-card__value">{`${highestSeverityCause.severityIndex.toFixed(1)} / 10`}</strong>
                  <span className={`causes-analysis__severity-level ${getSeverityToneClass(highestSeverityCause.level)}`}>
                    {highestSeverityCause.level === 'Alto' ? '🔴' : highestSeverityCause.level === 'Medio-Alto' ? '🟠' : highestSeverityCause.level === 'Medio' ? '🟡' : '🟢'}
                    {' '}
                    {highestSeverityCause.level}
                  </span>
                  <span className="causes-analysis__severity-subtitle">Causa crítica</span>
                  <strong className="causes-analysis__severity-cause">{highestSeverityCause.causa}</strong>
                  <span className="causes-analysis__severity-metric">{formatPercent(highestSeverityCause.impactPct)} de las TM incumplidas</span>
                  <span className="causes-analysis__severity-subtitle">Alcance</span>
                  <span className="causes-analysis__severity-metric">{formatPercent(highestSeverityCause.coveragePct)} de los pedidos incumplidos</span>
                </>
              )}
            </article>
          </div>

          {hasNoRows && (
            <div className="operational-page__state operational-page__state--empty" role="status">
              <h3>Sin datos para los filtros seleccionados</h3>
              <p>Ajusta filtros o cambia el modo para continuar con el análisis.</p>
            </div>
          )}

          {canRenderData && (
            <>
              <section className="operational-card">
                <header className="operational-card__header causes-analysis__header-with-actions">
                  <div>
                    <h3>Causas críticas</h3>
                    <p>
                      Se muestran únicamente las causas necesarias para explicar aproximadamente el 80% del impacto del período.
                      {' '}
                      ({formatNumber(topSummary.topCount)} de {formatNumber(topSummary.visibleCauseCount)} causas, {formatPercent(topSummary.representedPct)} de las TM pendientes).
                    </p>
                  </div>
                </header>

                <ParetoChart
                  rows={criticalParetoRows}
                  selectedCause={selectedCause}
                  onSelectCause={setSelectedCause}
                />
              </section>

              <section className="operational-card operational-card--table">
                <header className="operational-card__header">
                  <div>
                    <h3>Tabla de análisis de causas</h3>
                    <p>Orden y participación según la métrica activa en el Pareto.</p>
                  </div>
                  <div className="causes-analysis__severity-legend" aria-label="Leyenda de niveles de severidad">
                    <span>🔴 Alto</span>
                    <span>🟠 Medio-Alto</span>
                    <span>🟡 Medio</span>
                    <span>🟢 Bajo</span>
                  </div>
                </header>

                {selectedCause && (
                  <div className="causes-analysis__table-actions">
                    <span>Causa seleccionada: <strong>{selectedCause}</strong></span>
                  </div>
                )}

                <div className="operational-table-wrapper causes-analysis__table-wrapper">
                  <table className="operational-table operational-table--compact causes-analysis__table">
                    <thead>
                      <tr>
                        <th className="causes-analysis__head-left">CAUSA</th>
                        <th className="causes-analysis__head-center">
                          <button type="button" className="causes-analysis__sort-button" onClick={() => toggleSort('TM')}>
                            <span>TM PENDIENTES</span>
                            {sortKey === 'TM' && <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                          </button>
                        </th>
                        <th className="causes-analysis__head-center">% PARTICIPACIÓN</th>
                        <th className="causes-analysis__head-center">
                          <button type="button" className="causes-analysis__sort-button" onClick={() => toggleSort('PEDIDOS')}>
                            <span>PEDIDOS</span>
                            {sortKey === 'PEDIDOS' && <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                          </button>
                        </th>
                        <th className="causes-analysis__head-center">ÍNDICE DE SEVERIDAD</th>
                        <th className="causes-analysis__head-left">ÁREA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTableRows.map((row) => {
                        const isSelected = selectedCause === row.causa
                        const severity = severityRowsByCause.get(normalizeSearchText(row.causa))

                        return (
                          <tr key={`${row.causa}-${row.area}`} className={isSelected ? 'causes-analysis__row-selected' : ''}>
                            <td className="causes-analysis__cell-left">
                              <button
                                type="button"
                                className="operational-link-button"
                                onClick={() => setSelectedCause(row.causa)}
                              >
                                {row.causa}
                              </button>
                            </td>
                            <td className="causes-analysis__cell-center">{formatNumber(row.tmPendiente, 2)}</td>
                            <td className="causes-analysis__cell-center">{formatPercent(row.partPct)}</td>
                            <td className="causes-analysis__cell-center">{formatNumber(row.pedidos)}</td>
                            <td className="causes-analysis__cell-center">
                              {severity ? (
                                <span className="causes-analysis__severity-cell">
                                  <span className={`causes-analysis__severity-dot ${getSeverityToneClass(severity.level)}`} aria-hidden="true" />
                                  <span>{severity.severityIndex.toFixed(1)}</span>
                                </span>
                              ) : 'Sin información'}
                            </td>
                            <td className="causes-analysis__cell-left">{row.area || 'Sin área'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {secondaryTableRows.length > 0 && (
                  <div className="causes-analysis__table-actions">
                    <button
                      type="button"
                      className="commercial-page__toggle-more"
                      onClick={() => setShowSecondaryCauses((current) => !current)}
                    >
                      {showSecondaryCauses
                        ? '▲ Ocultar causas secundarias'
                        : `▼ Ver causas secundarias (${formatNumber(secondaryTableRows.length)})`}
                    </button>
                  </div>
                )}
              </section>

              {indicatorMode === 'AJUSTADO' && (
                <section className="operational-card operational-card--table">
                  <header className="operational-card__header">
                    <div>
                      <h3>Matriz de priorización</h3>
                      <p>
                        Corte automático por medianas visibles.
                        {' '}
                        Frecuencia: <strong>{formatNumber(matrixMedians.pedidos)}</strong>
                        {' · '}
                        Impacto: <strong>{formatNumber(matrixMedians.tm, 2)} TM</strong>
                      </p>
                    </div>
                  </header>

                  <PrioritizationMatrix rows={rows} selectedCause={selectedCause} onSelectCause={setSelectedCause} />
                </section>
              )}

              {indicatorMode === 'AJUSTADO' && (
                <section className="operational-card">
                  <header className="operational-card__header">
                    <div>
                      <h3>Causas excluidas del indicador</h3>
                      <p>Causas con AFECTA AL INDICADOR = NO. Se muestra como referencia informativa.</p>
                    </div>
                  </header>

                  {excludedSummary.byCause.length === 0 ? (
                    <p className="causes-analysis__excluded-empty">No hay causas excluidas para los filtros seleccionados.</p>
                  ) : (
                    <div className="causes-analysis__excluded-summary">
                      <p className="causes-analysis__excluded-total">
                        Pedidos excluidos del indicador: <strong>{formatNumber(excludedSummary.totalExcludedOrders)}</strong>
                      </p>
                      <p className="causes-analysis__excluded-label">Por causa:</p>
                      <ul className="causes-analysis__excluded-list">
                        {excludedSummary.byCause.map((item) => (
                          <li key={`excluded-${item.causa}`}>
                            <span>{item.causa}</span>
                            <strong>{formatNumber(item.pedidos)} pedidos</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              <section className="operational-card">
                <header className="operational-card__header">
                  <div>
                    <h3>Recomendaciones de gestión</h3>
                    <p>Acciones sugeridas para priorizar la gestión del período.</p>
                  </div>
                </header>

                {managementRecommendations.length === 0 ? (
                  <p className="operational-page__empty-state">No hay recomendaciones disponibles para la combinación de filtros seleccionada.</p>
                ) : (
                  <ul className="causes-analysis__insights-list">
                    {managementRecommendations.map((recommendation, index) => (
                      <li key={`management-recommendation-${index}`}>
                        {recommendation}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  )
}
