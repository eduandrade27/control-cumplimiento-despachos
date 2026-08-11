import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '../components/Tooltip'
import { HistoricCharts } from '../components/historic/HistoricCharts'
import { useHistoricDashboard } from '../hooks/useHistoricDashboard'
import { formatNumber, formatPercent } from '../lib/operationalFormat'
import type { HistoricKpiCard } from '../types/historic'

function formatCardValue(card: HistoricKpiCard): string {
  if (card.unit === 'percent') {
    return formatPercent(card.mainValue)
  }

  if (card.unit === 'tm') {
    return `${formatNumber(card.mainValue, 2)} TM`
  }

  return formatNumber(card.mainValue)
}

function variationTone(value: number | null): 'positive' | 'negative' | 'neutral' {
  if (value === null || Number.isNaN(value)) {
    return 'neutral'
  }

  const displayedValue = Number(value.toFixed(1))
  if (displayedValue === 0) {
    return 'neutral'
  }

  return displayedValue > 0 ? 'positive' : 'negative'
}

function buildAdjustedTooltip(
  excludedOrders: number,
  excludedCauses: Array<{ causa: string; justificacion: string; count: number }>,
): string {
  const lines = excludedCauses
    .map((cause) => `• ${cause.causa} (${cause.count})`)
    .join('\n')

  return `Pedidos excluidos del indicador: ${excludedOrders}\n\nPor causa:\n${lines}`
}

function formatHistoricMonthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return ''
  }

  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const [year, month] = value.split('-')
  const monthIndex = Number(month) - 1

  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return value
  }

  return `${months[monthIndex]} ${year}`
}

export function HistoricPage() {
  const {
    status,
    error,
    cards,
    comparisonRows,
    comparisonRowsForCharts,
    sectorSummary,
    adjustedExcludedCauses,
    adjustedExcludedOrders,
    indicatorMode,
    setIndicatorMode,
    adjustedModeInfo,
    selectedSector,
    selectedSectorLabel,
    monthFrom,
    monthTo,
    setMonthFrom,
    setMonthTo,
    canApplyPeriod,
    applyPeriod,
    periodValidationMessage,
    selectedClients,
    clientQuery,
    setClientQuery,
    matchingClients,
    addClient,
    removeClient,
    setSelectedSector,
    isEmptyData,
    isClientSectorLocked,
  } = useHistoricDashboard()

  const [highlightedPeriodKey, setHighlightedPeriodKey] = useState<string | null>(null)
  const [isModeInfoOpen, setIsModeInfoOpen] = useState(false)
  const [isModeInfoPulsing, setIsModeInfoPulsing] = useState(false)
  const modeInfoRef = useRef<HTMLDivElement | null>(null)
  const showTotalSummary = selectedSector === 'TODOS' && selectedClients.length === 0
  const summaryColumnLabel = selectedSector === 'AGRO' ? 'AGRO' : 'DOMÉSTICO'
  const summarySubtitle = selectedClients.length > 0
    ? `${selectedSectorLabel} · Clientes: ${selectedClients.join(', ')}`
    : selectedSectorLabel

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

  const handleIndicatorModeChange = (nextMode: 'BRUTO' | 'AJUSTADO') => {
    setIndicatorMode(nextMode)
  }

  return (
    <section className="page-card historic-page">
      <header className="operational-page__header historic-page__header">
        <div className="historic-page__headline">
          <p className="operational-page__eyebrow">Módulo histórico</p>
          <h2>Histórico ejecutivo</h2>
          <p>
            Analiza la evolución de cumplimiento
            <br />
            y el desempeño por período.
          </p>
        </div>

        <div className="historic-page__compact-filters">
          <div className="historic-page__filter-item">
            <span className="operational-page__label">Desde</span>
            <label className="historic-page__month-field">
              <input
                type="month"
                className="operational-page__year-select historic-page__month-input"
                value={monthFrom}
                onChange={(event) => setMonthFrom(event.target.value)}
                aria-label="Desde mes y año"
              />
              <span className="historic-page__month-display" aria-hidden="true">{formatHistoricMonthLabel(monthFrom)}</span>
            </label>
          </div>

          <div className="historic-page__filter-item">
            <span className="operational-page__label">Hasta</span>
            <label className="historic-page__month-field">
              <input
                type="month"
                className="operational-page__year-select historic-page__month-input"
                value={monthTo}
                onChange={(event) => setMonthTo(event.target.value)}
                aria-label="Hasta mes y año"
              />
              <span className="historic-page__month-display" aria-hidden="true">{formatHistoricMonthLabel(monthTo)}</span>
            </label>
            <button
              type="button"
              className="operational-page__reset operational-page__reset--compact historic-page__apply-button historic-page__apply-button--below"
              onClick={() => void applyPeriod()}
              disabled={!canApplyPeriod}
            >
              Aplicar
            </button>
          </div>

          <div className="historic-page__filter-item">
            <span className="operational-page__label">Sector</span>
            <select
              className="operational-page__year-select"
              value={selectedSector}
              onChange={(event) => setSelectedSector(event.target.value as 'TODOS' | 'AGRO' | 'DOMESTICO')}
              aria-label="Filtrar por sector"
              disabled={isClientSectorLocked}
            >
              <option value="TODOS">Todos los sectores</option>
              <option value="AGRO">AGRO</option>
              <option value="DOMESTICO">DOMESTICO</option>
            </select>
          </div>

          <div className="historic-page__filter-item historic-page__filter-item--client">
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
                {selectedClients.length === 0 && <span className="operational-page__empty-state operational-page__empty-state--client">Sin cliente seleccionado</span>}
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
        {periodValidationMessage && (
          <p className="operational-page__empty-state" role="alert">{periodValidationMessage}</p>
        )}
      </header>

      {status === 'loading' && (
        <div className="operational-page__state operational-page__state--loading" role="status">
          <div className="operational-page__skeletal-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="operational-page__skeleton" />
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="operational-page__state operational-page__state--error" role="alert">
          <h3>No se pudieron cargar los datos</h3>
          <p>{error?.message ?? 'Ocurrió un problema inesperado al consultar Histórico.'}</p>
        </div>
      )}

      {status !== 'loading' && status !== 'error' && (
        <>
          <div className="historic-page__cards-grid">
            {cards.map((card) => (
              <article key={card.title} className="kpi-card historic-page__card">
                <span className="kpi-card__title">{card.title}</span>
                <strong className="kpi-card__value historic-page__card-value">{formatCardValue(card)}</strong>
              </article>
            ))}
          </div>

          <section className="operational-card historic-page__mode-card">
            <header className="operational-card__header historic-page__mode-header">
              <div>
                <h3>Modo del indicador</h3>
                <p>Selecciona cómo se calcula el cumplimiento para el análisis ejecutivo.</p>
              </div>
              <div className="historic-page__mode-controls">
                <div className="historic-page__mode-switch" role="group" aria-label="Modo del indicador">
                  <button
                    type="button"
                    className={`historic-page__mode-option ${indicatorMode === 'BRUTO' ? 'is-active' : ''}`}
                    onClick={() => handleIndicatorModeChange('BRUTO')}
                  >
                    {indicatorMode === 'BRUTO' ? '●' : '○'} Bruto
                  </button>
                  <Tooltip content={adjustedModeInfo.message} disabled={adjustedModeInfo.enabled}>
                    <span className="historic-page__mode-option-shell">
                      <button
                        type="button"
                        className={`historic-page__mode-option ${indicatorMode === 'AJUSTADO' ? 'is-active' : ''}`}
                        onClick={() => handleIndicatorModeChange('AJUSTADO')}
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
                        <p>Considera todos los pedidos evaluados segun la logica actual.</p>
                      </div>

                      <div className="historic-page__mode-popover-section">
                        <strong>Ajustado</strong>
                        <p>Recalcula el indicador excluyendo los incumplimientos cuyas causas estan configuradas como no afectantes al indicador.</p>
                      </div>

                      <div className="historic-page__mode-popover-section">
                        <strong>Causas excluidas en el período filtrado</strong>
                        {adjustedExcludedCauses.length > 0 ? (
                          <ul className="historic-page__mode-popover-list" aria-label="Causas excluidas en el periodo filtrado">
                            {adjustedExcludedCauses.map((cause) => (
                              <li key={cause.causa} className="historic-page__mode-popover-item">
                                <span className="historic-page__mode-popover-cause">{cause.causa}{cause.count > 1 ? ` (${cause.count})` : ''}</span>
                                {cause.justificacion && (
                                  <span className="historic-page__mode-popover-note">{cause.justificacion}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No hubo causas excluidas en el periodo analizado.</p>
                        )}
                        {adjustedExcludedOrders > 0 && (
                          <p className="historic-page__mode-popover-footnote">Pedidos excluidos del indicador: {formatNumber(adjustedExcludedOrders)}</p>
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

          <HistoricCharts
            rows={comparisonRowsForCharts}
            highlightedPeriodKey={highlightedPeriodKey}
            onSelectPeriod={setHighlightedPeriodKey}
          />

          <div className="historic-page__tables-grid">
            <section className="operational-card operational-card--table historic-page__table-card historic-page__table-card--comparison">
              <header className="operational-card__header">
                <div>
                  <h3>Tabla comparativa</h3>
                  <p>Comparación cronológica del desempeño del período filtrado.</p>
                </div>
              </header>

              <div className="operational-table-wrapper historic-page__table-wrapper">
                <table className="operational-table operational-table--compact historic-page__comparison-table">
                  <thead>
                    <tr>
                      <th className="historic-page__period-cell">PERÍODO</th>
                      <th className="historic-page__numeric-cell"><span className="historic-page__th-stack">PEDIDOS<br />PROGRAMA</span></th>
                      <th className="historic-page__numeric-cell"><span className="historic-page__th-stack">PEDIDOS<br />CUMPL</span></th>
                      <th className="historic-page__numeric-cell"><span className="historic-page__th-stack">PEDIDOS<br />INCUMPL</span></th>
                      <th className="historic-page__numeric-cell"><span className="historic-page__th-stack">TM<br />PROGRAMA</span></th>
                      <th className="historic-page__numeric-cell"><span className="historic-page__th-stack">TM<br />DESPACHO</span></th>
                      <th className="historic-page__numeric-cell"><span className="historic-page__th-stack">TM<br />PEND</span></th>
                      <th className="historic-page__numeric-cell">% CUMPL</th>
                      <th className="historic-page__numeric-cell">VARIACIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="historic-page__empty-cell">No existen datos para los filtros seleccionados.</td>
                      </tr>
                    )}

                    {comparisonRows.map((row) => {
                      const tone = variationTone(row.variationVsPreviousPp)
                      const isHighlighted = highlightedPeriodKey === row.periodKey
                      const showAdjustedInfo = indicatorMode === 'AJUSTADO' && row.excludedOrdersAdjusted > 0
                      const complianceTooltip = showAdjustedInfo
                        ? buildAdjustedTooltip(row.excludedOrdersAdjusted, row.excludedCausesAdjusted)
                        : ''

                      return (
                        <tr key={row.periodKey} className={isHighlighted ? 'historic-page__row-highlighted' : ''}>
                          <td className="historic-page__period-cell">{row.periodLabel}</td>
                          <td className="historic-page__numeric-cell">{formatNumber(row.programmedOrders)}</td>
                          <td className="historic-page__numeric-cell">{formatNumber(row.fulfilledOrders)}</td>
                          <td className="historic-page__numeric-cell">{formatNumber(row.unfulfilledOrders)}</td>
                          <td className="historic-page__numeric-cell">{formatNumber(row.tmProgramadas, 2)}</td>
                          <td className="historic-page__numeric-cell">{formatNumber(row.tmDespachadas, 2)}</td>
                          <td className="historic-page__numeric-cell">{formatNumber(row.tmPendientes, 2)}</td>
                          <td className="historic-page__numeric-cell">
                            <span className="historic-page__compliance-cell">
                              {formatPercent(row.complianceOrdersPct)}
                              {showAdjustedInfo && (
                                <Tooltip content={complianceTooltip}>
                                  <span
                                    className="historic-page__adjusted-info"
                                    role="img"
                                    aria-label={complianceTooltip}
                                  >
                                    ⓘ
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          </td>
                          <td className={`historic-page__numeric-cell historic-page__variation historic-page__variation--${tone}`}>
                            {row.variationVsPreviousPp === null ? '—' : `${row.variationVsPreviousPp > 0 ? '+' : ''}${formatNumber(row.variationVsPreviousPp, 1)} pp`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="operational-card operational-card--table historic-page__table-card historic-page__table-card--summary">
              <header className="operational-card__header">
                <div>
                  <h3>Tabla resumen</h3>
                  <p>{summarySubtitle}</p>
                </div>
              </header>

              <div className="operational-table-wrapper historic-page__table-wrapper">
                <table className="operational-table operational-table--compact historic-page__summary-table">
                  <thead>
                    {showTotalSummary ? (
                      <>
                        <tr>
                          <th rowSpan={2} />
                          <th rowSpan={2} className="historic-page__head-total">TOTAL (TM)</th>
                          <th colSpan={2} className="historic-page__head-agro">AGRO</th>
                          <th colSpan={2} className="historic-page__head-domestico">DOMÉSTICO</th>
                        </tr>
                        <tr>
                          <th className="historic-page__subhead">Valor (TM)</th>
                          <th className="historic-page__subhead">% Part</th>
                          <th className="historic-page__subhead">Valor (TM)</th>
                          <th className="historic-page__subhead">% Part</th>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <th>Métrica</th>
                        <th className={selectedSector === 'AGRO' ? 'historic-page__head-agro' : 'historic-page__head-domestico'}>{summaryColumnLabel}</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {isEmptyData && (
                      <tr>
                        <td colSpan={showTotalSummary ? 6 : 2} className="historic-page__empty-cell">No existen datos para los filtros seleccionados.</td>
                      </tr>
                    )}

                    {!isEmptyData && sectorSummary.map((row) => (
                      <tr key={row.label}>
                        <td className="historic-page__period-cell">{row.label}</td>
                        {showTotalSummary ? (
                          row.label === '% CUMPLIMIENTO' ? (
                            <>
                              <td className="historic-page__numeric-cell">{formatPercent(row.totalValue)}</td>
                              <td colSpan={2} className="historic-page__numeric-cell">{formatPercent(row.agroValue)}</td>
                              <td colSpan={2} className="historic-page__numeric-cell">{formatPercent(row.domesticoValue)}</td>
                            </>
                          ) : (
                            <>
                              <td className="historic-page__numeric-cell">{formatNumber(row.totalValue, 2)}</td>
                              <td className="historic-page__numeric-cell">{formatNumber(row.agroValue, 2)}</td>
                              <td className="historic-page__numeric-cell">{row.agroPartPct === null ? '—' : formatPercent(row.agroPartPct)}</td>
                              <td className="historic-page__numeric-cell">{formatNumber(row.domesticoValue, 2)}</td>
                              <td className="historic-page__numeric-cell">{row.domesticoPartPct === null ? '—' : formatPercent(row.domesticoPartPct)}</td>
                            </>
                          )
                        ) : (
                          <td className="historic-page__numeric-cell">{selectedSector === 'AGRO'
                            ? (row.label === '% CUMPLIMIENTO' ? formatPercent(row.agroValue) : formatNumber(row.agroValue, 2))
                            : (row.label === '% CUMPLIMIENTO' ? formatPercent(row.domesticoValue) : formatNumber(row.domesticoValue, 2))}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}
