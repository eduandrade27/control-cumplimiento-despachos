import { useState } from 'react'
import { Tooltip } from '../components/Tooltip'
import { HistoricCharts } from '../components/historic/HistoricCharts'
import { useHistoricDashboard } from '../hooks/useHistoricDashboard'
import type { HistoricKpiCard } from '../types/historic'

function formatValue(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatInteger(value: number | null): string {
  return formatValue(value, 0)
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return `${value.toFixed(digits)}%`
}

function formatCardValue(card: HistoricKpiCard): string {
  if (card.unit === 'percent') {
    return formatPercent(card.mainValue)
  }

  if (card.unit === 'tm') {
    return `${formatValue(card.mainValue)} TM`
  }

  return formatInteger(card.mainValue)
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

export function HistoricPage() {
  const {
    status,
    error,
    cards,
    comparisonRows,
    comparisonRowsForCharts,
    sectorSummary,
    indicatorMode,
    setIndicatorMode,
    adjustedModeInfo,
    selectedSector,
    selectedSectorLabel,
    monthFrom,
    monthTo,
    setMonthFrom,
    setMonthTo,
    selectedClient,
    clientQuery,
    setClientQuery,
    matchingClients,
    addClient,
    removeClient,
    setSelectedSector,
    hasActiveFilters,
    resetFilters,
    isEmptyData,
    isClientSectorLocked,
  } = useHistoricDashboard()

  const [highlightedPeriodKey, setHighlightedPeriodKey] = useState<string | null>(null)
  const showTotalSummary = selectedSector === 'TODOS' && !selectedClient
  const summaryColumnLabel = selectedSector === 'AGRO' ? 'AGRO' : 'DOMÉSTICO'
  const summarySubtitle = selectedClient ? `${selectedSectorLabel} · Cliente: ${selectedClient}` : selectedSectorLabel

  return (
    <section className="page-card historic-page">
      <header className="operational-page__header historic-page__header">
        <div className="historic-page__headline">
          <p className="operational-page__eyebrow">Módulo histórico</p>
          <h2>Histórico ejecutivo</h2>
          <p>Analiza la evolución de cumplimiento y el desempeño por período.</p>
        </div>

        <div className="historic-page__compact-filters">
          <div className="historic-page__filter-item">
            <span className="operational-page__label">Desde (Mes/Año)</span>
            <input
              type="month"
              className="operational-page__year-select"
              value={monthFrom}
              onChange={(event) => setMonthFrom(event.target.value)}
              aria-label="Desde mes y año"
            />
          </div>

          <div className="historic-page__filter-item">
            <span className="operational-page__label">Hasta (Mes/Año)</span>
            <input
              type="month"
              className="operational-page__year-select"
              value={monthTo}
              onChange={(event) => setMonthTo(event.target.value)}
              aria-label="Hasta mes y año"
            />
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
                {!selectedClient && <span className="operational-page__empty-state operational-page__empty-state--client">Sin cliente seleccionado</span>}
                {selectedClient && (
                  <button
                    type="button"
                    className="operational-page__chip operational-page__chip--removable"
                    onClick={() => removeClient()}
                  >
                    {selectedClient}
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="historic-page__filter-item historic-page__filter-item--action">
            <button
              type="button"
              className="operational-page__reset operational-page__reset--compact"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
            >
              Limpiar
            </button>
          </div>
        </div>
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
                    onClick={() => setIndicatorMode('BRUTO')}
                  >
                    {indicatorMode === 'BRUTO' ? '●' : '○'} Bruto
                  </button>
                  <Tooltip content={adjustedModeInfo.message} disabled={adjustedModeInfo.enabled}>
                    <span className="historic-page__mode-option-shell">
                      <button
                        type="button"
                        className={`historic-page__mode-option ${indicatorMode === 'AJUSTADO' ? 'is-active' : ''}`}
                        onClick={() => setIndicatorMode('AJUSTADO')}
                        disabled={!adjustedModeInfo.enabled}
                      >
                        {indicatorMode === 'AJUSTADO' ? '●' : '○'} Ajustado
                      </button>
                    </span>
                  </Tooltip>
                </div>
                <Tooltip content={'Bruto:\nConsidera todas las causas.\n\nAjustado:\nExcluye las causas marcadas como "No afecta al indicador".'}>
                  <button
                    type="button"
                    className="historic-page__info-icon"
                    aria-label="Información de cálculo Bruto y Ajustado"
                  >
                    i
                  </button>
                </Tooltip>
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
                          <td className="historic-page__numeric-cell">{formatInteger(row.programmedOrders)}</td>
                          <td className="historic-page__numeric-cell">{formatInteger(row.fulfilledOrders)}</td>
                          <td className="historic-page__numeric-cell">{formatInteger(row.unfulfilledOrders)}</td>
                          <td className="historic-page__numeric-cell">{formatValue(row.tmProgramadas)}</td>
                          <td className="historic-page__numeric-cell">{formatValue(row.tmDespachadas)}</td>
                          <td className="historic-page__numeric-cell">{formatValue(row.tmPendientes)}</td>
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
                            {row.variationVsPreviousPp === null ? '—' : `${row.variationVsPreviousPp > 0 ? '+' : ''}${formatValue(row.variationVsPreviousPp, 1)} pp`}
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
                              <td className="historic-page__numeric-cell">{formatValue(row.totalValue)}</td>
                              <td className="historic-page__numeric-cell">{formatValue(row.agroValue)}</td>
                              <td className="historic-page__numeric-cell">{row.agroPartPct === null ? '—' : formatPercent(row.agroPartPct)}</td>
                              <td className="historic-page__numeric-cell">{formatValue(row.domesticoValue)}</td>
                              <td className="historic-page__numeric-cell">{row.domesticoPartPct === null ? '—' : formatPercent(row.domesticoPartPct)}</td>
                            </>
                          )
                        ) : (
                          <td className="historic-page__numeric-cell">{selectedSector === 'AGRO'
                            ? (row.label === '% CUMPLIMIENTO' ? formatPercent(row.agroValue) : formatValue(row.agroValue))
                            : (row.label === '% CUMPLIMIENTO' ? formatPercent(row.domesticoValue) : formatValue(row.domesticoValue))}</td>
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
