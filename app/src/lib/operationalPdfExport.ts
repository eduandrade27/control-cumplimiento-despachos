import { jsPDF } from 'jspdf'
import logoCarvimsa from '../assets/logo-carvimsa.png'
import { formatMonthLabel, formatPercent, formatTm } from './operationalFormat'
import type { OperationalKpiSummary } from '../types/operational'
import type { OperationalInsightSeriesPoint, OperationalTopRow } from '../types/operationalInsights'

interface OperationalPdfContext {
  kpis: OperationalKpiSummary
  selectedYear: number | null
  selectedMonths: string[]
  selectedClients: string[]
  crossFilters: Array<{ key: 'causa' | 'area' | 'cliente'; value: string }>
  availableMonths: Array<{ value: string; label: string }>
  insightsData: {
    temporalSeries: OperationalInsightSeriesPoint[]
    incumplimientosSeries: OperationalInsightSeriesPoint[]
    volumeSeries: OperationalInsightSeriesPoint[]
    areaIncidents: OperationalInsightSeriesPoint[]
    areaPendingTm: OperationalInsightSeriesPoint[]
    fullCauseRows: OperationalTopRow[]
    fullClientRows: OperationalTopRow[]
  } | null
}

function formatPdfNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function getComplianceLabel(value: number | null): { label: string; color: [number, number, number] } {
  if (value === null || Number.isNaN(value)) {
    return { label: 'Sin datos', color: [107, 114, 128] }
  }

  if (value >= 100) {
    return { label: 'Alto', color: [22, 163, 74] }
  }

  if (value >= 90) {
    return { label: 'Medio', color: [234, 179, 8] }
  }

  return { label: 'Bajo', color: [220, 38, 38] }
}

function getMonthLabel(monthKey: string, availableMonths: Array<{ value: string; label: string }>): string {
  const match = availableMonths.find((item) => item.value === monthKey)
  if (match?.label) {
    return match.label
  }

  return formatMonthLabel(monthKey)
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text(title, 40, y)
  doc.setDrawColor(203, 213, 225)
  doc.line(40, y + 6, 555, y + 6)
  return y + 20
}

function ensurePageSpace(doc: jsPDF, y: number, requiredHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + requiredHeight <= pageHeight - 40) {
    return y
  }

  doc.addPage()
  return 56
}

function loadImageAsDataUrl(src: string): Promise<string | null> {
  return fetch(src)
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => {
      if (!blob) {
        return null
      }

      return new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    })
    .catch(() => null)
}

function drawHorizontalBars(
  doc: jsPDF,
  rows: Array<{ label: string; value: number }>,
  y: number,
  options: {
    title: string
    barColor: [number, number, number]
    valueFormatter: (value: number) => string
  },
): number {
  y = addSectionTitle(doc, options.title, y)

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('Sin datos para este análisis.', 40, y)
    return y + 16
  }

  const sortedRows = [...rows].sort((left, right) => right.value - left.value)
  const maxValue = Math.max(1, ...sortedRows.map((item) => item.value))
  const totalValue = sortedRows.reduce((sum, item) => sum + Math.max(0, item.value), 0)

  const labelX = 44
  const barX = 210
  const barWidth = 220
  const valueX = 442
  const rowHeight = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Área', labelX, y)
  doc.text('Valor y %', valueX, y)
  y += 12

  sortedRows.forEach((row, index) => {
    y = ensurePageSpace(doc, y, rowHeight + 4)

    const ratio = Math.max(0, row.value) / maxValue
    const percentage = totalValue > 0 ? (Math.max(0, row.value) / totalValue) * 100 : 0
    const valueText = `${options.valueFormatter(row.value)} (${formatPdfNumber(percentage, 1)}%)`

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(40, y - 9, 515, rowHeight, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    doc.text(truncateText(row.label, 28), labelX, y + 4)

    doc.setFillColor(226, 232, 240)
    doc.roundedRect(barX, y - 4, barWidth, 8, 3, 3, 'F')
    doc.setFillColor(options.barColor[0], options.barColor[1], options.barColor[2])
    doc.roundedRect(barX, y - 4, Math.max(2, barWidth * ratio), 8, 3, 3, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(valueText, valueX, y + 4)
    y += rowHeight
  })

  return y + 10
}

function drawTopTable(
  doc: jsPDF,
  y: number,
  options: {
    title: string
    nameColumnTitle: string
    rows: OperationalTopRow[]
  },
): number {
  y = addSectionTitle(doc, options.title, y)

  const topRows = [...options.rows]
    .sort((left, right) => right.tmPendiente - left.tmPendiente)
    .slice(0, 10)

  if (topRows.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('Sin datos para este análisis.', 40, y)
    return y + 16
  }

  const colRank = 44
  const colName = 72
  const colTm = 388
  const colOrders = 490
  const rowHeight = 19

  doc.setFillColor(241, 245, 249)
  doc.rect(40, y - 10, 515, rowHeight, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30, 41, 59)
  doc.text('#', colRank, y + 3)
  doc.text(options.nameColumnTitle, colName, y + 3)
  doc.text('TM pendientes', colTm, y + 3)
  doc.text('Pedidos', colOrders, y + 3)
  y += rowHeight

  topRows.forEach((row, index) => {
    y = ensurePageSpace(doc, y, rowHeight + 2)

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(40, y - 9, 515, rowHeight, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    doc.text(String(index + 1), colRank, y + 3)
    doc.text(truncateText(row.name, 54), colName, y + 3)

    doc.setFont('helvetica', 'bold')
    doc.text(formatTm(row.tmPendiente, 2), colTm, y + 3)
    doc.text(formatPdfNumber(row.pedidosIncumplidos), colOrders, y + 3)
    y += rowHeight
  })

  return y + 10
}

function renderOperationalPdf(context: OperationalPdfContext, logoDataUrl: string | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = 56

  const complianceStatus = getComplianceLabel(context.kpis.cumplimientoPct)
  const generatedAt = new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' })
  const activePeriods = context.selectedMonths.length > 0
    ? context.selectedMonths.map((monthKey) => getMonthLabel(monthKey, context.availableMonths)).join(', ')
    : (context.selectedYear ? String(context.selectedYear) : 'Sin período definido')

  doc.setFillColor(15, 23, 42)
  doc.roundedRect(32, 24, pageWidth - 64, 56, 8, 8, 'F')

  doc.setFillColor(255, 255, 255)
  doc.circle(64, 52, 18, 'F')

  if (logoDataUrl) {
    const imageProps = doc.getImageProperties(logoDataUrl)
    const imageRatio = imageProps.width / imageProps.height
    const maxSize = 28
    const drawWidth = imageRatio >= 1 ? maxSize : maxSize * imageRatio
    const drawHeight = imageRatio >= 1 ? maxSize / imageRatio : maxSize
    const imageX = 64 - drawWidth / 2
    const imageY = 52 - drawHeight / 2
    doc.addImage(logoDataUrl, 'PNG', imageX, imageY, drawWidth, drawHeight)
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Reporte Ejecutivo - Operativo', 92, 48)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Período: ${activePeriods}`, 92, 64)

  y = 100

  doc.setFillColor(245, 247, 250)
  doc.roundedRect(40, y - 8, 515, 40, 6, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text('% de cumplimiento', 56, y + 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(formatPercent(context.kpis.cumplimientoPct), 56, y + 30)
  doc.setFillColor(complianceStatus.color[0], complianceStatus.color[1], complianceStatus.color[2])
  doc.roundedRect(420, y + 8, 120, 18, 6, 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.text(complianceStatus.label, 440, y + 21)
  y += 58

  y = addSectionTitle(doc, 'KPIs actuales', y)
  const kpiRows = [
    ['TM programadas', formatTm(context.kpis.tmProgramadas, 2)],
    ['TM despachadas', formatTm(context.kpis.tmDespachadas, 2)],
    ['TM pendientes', formatTm(context.kpis.tmPendientes, 2)],
    ['Total de pedidos', formatPdfNumber(context.kpis.totalPedidos)],
    ['Pedidos cumplidos', formatPdfNumber(context.kpis.pedidosCumplidos)],
    ['Pedidos incumplidos', formatPdfNumber(context.kpis.pedidosIncumplidos)],
    ['Clientes afectados', formatPdfNumber(context.kpis.clientesAfectados)],
    ['Promedio diario de TM programadas', formatTm(context.kpis.promedioDiarioTmProgramadas, 2)],
  ]

  const currentY = y
  const cardsPerRow = 4
  const cardGapX = 10
  const cardGapY = 10
  const cardWidth = (515 - cardGapX * (cardsPerRow - 1)) / cardsPerRow
  const cardHeight = 58

  kpiRows.forEach((row, index) => {
    const [label, value] = row
    const column = index % cardsPerRow
    const line = Math.floor(index / cardsPerRow)
    const x = 40 + column * (cardWidth + cardGapX)
    const rowY = currentY + line * (cardHeight + cardGapY)

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, rowY, cardWidth, cardHeight, 5, 5, 'F')

    const labelLines = doc.splitTextToSize(label, cardWidth - 12).slice(0, 2)
    const labelTopY = rowY + 14
    const labelLineGap = 8
    const valueY = rowY + cardHeight - 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    doc.setTextColor(30, 41, 59)
    labelLines.forEach((lineText: string, lineIndex: number) => {
      const lineWidth = doc.getTextWidth(lineText)
      const labelX = x + (cardWidth - lineWidth) / 2
      doc.text(lineText, labelX, labelTopY + lineIndex * labelLineGap)
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const valueWidth = doc.getTextWidth(value)
    const valueX = x + (cardWidth - valueWidth) / 2
    doc.text(value, valueX, valueY)
  })
  y = currentY + cardHeight * 2 + cardGapY + 24

  y = ensurePageSpace(doc, y, 110)

  y = addSectionTitle(doc, 'Resumen ejecutivo', y)

  const areaByIncumplidos = [...(context.insightsData?.areaIncidents ?? [])]
    .map((item) => ({ label: item.label, value: Number(item.value ?? 0) }))
    .sort((left, right) => right.value - left.value)[0]

  const topCause = [...(context.insightsData?.fullCauseRows ?? [])]
    .sort((left, right) => right.tmPendiente - left.tmPendiente)[0]

  const executiveSummary = [
    `Cumplimiento del período: ${formatPercent(context.kpis.cumplimientoPct)}.`,
    `Pedidos incumplidos: ${formatPdfNumber(context.kpis.pedidosIncumplidos)}.`,
    `TM pendientes: ${formatTm(context.kpis.tmPendientes, 2)}.`,
    areaByIncumplidos
      ? `Principal área por pedidos incumplidos: ${areaByIncumplidos.label} (${formatPdfNumber(areaByIncumplidos.value)}).`
      : null,
    topCause
      ? `Principal causa por TM pendiente: ${topCause.name} (${formatTm(topCause.tmPendiente, 2)} TM).`
      : null,
  ].filter(Boolean)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  executiveSummary.slice(0, 5).forEach((line) => {
    doc.text(`- ${line}`, 44, y)
    y += 14
  })
  y += 8

  const areaIncidentsRows = (context.insightsData?.areaIncidents ?? []).map((item) => ({
    label: item.label,
    value: Number(item.value ?? 0),
  }))
  const areaPendingTmRows = (context.insightsData?.areaPendingTm ?? []).map((item) => ({
    label: item.label,
    value: Number(item.value ?? 0),
  }))

  y = ensurePageSpace(doc, y, 200)
  y = drawHorizontalBars(doc, areaIncidentsRows, y, {
    title: 'Pedidos incumplidos por área',
    barColor: [15, 118, 110],
    valueFormatter: (value) => formatPdfNumber(value),
  })

  y = ensurePageSpace(doc, y, 200)
  y = drawHorizontalBars(doc, areaPendingTmRows, y, {
    title: 'TM pendientes por área',
    barColor: [14, 116, 144],
    valueFormatter: (value) => formatTm(value, 2),
  })

  doc.addPage()
  y = 56

  y = drawTopTable(doc, y, {
    title: 'Top 10 principales causas',
    nameColumnTitle: 'Causa',
    rows: context.insightsData?.fullCauseRows ?? [],
  })

  y = ensurePageSpace(doc, y, 240)
  drawTopTable(doc, y, {
    title: 'Top 10 clientes con mayor impacto',
    nameColumnTitle: 'Cliente',
    rows: context.insightsData?.fullClientRows ?? [],
  })

  const lastPage = doc.getNumberOfPages()
  doc.setPage(lastPage)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(`Generado: ${generatedAt}`, pageWidth - 40, pageHeight - 18, { align: 'right' })

  doc.save('reporte-ejecutivo-operativo.pdf')
}

export function exportOperationalPdf(context: OperationalPdfContext): void {
  void loadImageAsDataUrl(logoCarvimsa).then((logoDataUrl) => {
    renderOperationalPdf(context, logoDataUrl)
  })
}
