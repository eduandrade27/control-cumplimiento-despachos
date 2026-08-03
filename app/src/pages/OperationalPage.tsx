import { useMemo, useState } from 'react'
import { GlobalMonthFilter, GlobalYearFilter } from '../components/GlobalPeriodFilters'
import { KpiCard } from '../components/operational/KpiCard'
import { OperationalCharts } from '../components/operational/OperationalCharts'
import { useOperationalDashboard } from '../hooks/useOperationalDashboard'
import { useOperationalInsights } from '../hooks/useOperationalInsights'
import { formatNumber, formatPercent } from '../lib/operationalFormat'

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function getComplianceTone(value: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (value === null || Number.isNaN(value)) {
    return 'default'
  }

  if (value >= 100) {
    return 'success'
  }

  if (value >= 90) {
    return 'warning'
  }

  return 'danger'
}

export function OperationalPage() {
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientQuery, setClientQuery] = useState('')

  const {
    kpis,
    availableYears,
    availableMonths,
    selectedYear,
    selectedMonths,
    status,
    error,
    changeYear,
    toggleMonth,
    removeMonth,
    resetFilters,
    hasActiveFilters,
  } = useOperationalDashboard(selectedClients)

  const {
    data: insightsData,
    availableClients,
    status: insightsStatus,
    error: insightsError,
    crossFilters,
    toggleCrossFilter,
    removeCrossFilter,
    resetCrossFilters,
    hasCrossFilters,
  } = useOperationalInsights(selectedMonths, selectedClients)

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
    resetCrossFilters()
    setSelectedClients([])
    setClientQuery('')
  }

  const kpiCards = useMemo(() => [
    {
      key: 'tmProgramadas',
      title: 'TM programadas',
      value: formatNumber(kpis.tmProgramadas, 2),
      hint: 'Toneladas programadas para el período seleccionado.',
    },
    {
      key: 'tmDespachadas',
      title: 'TM despachadas',
      value: formatNumber(kpis.tmDespachadas, 2),
      hint: 'Toneladas efectivamente despachadas.',
    },
    {
      key: 'tmPendientes',
      title: 'TM pendientes',
      value: formatNumber(kpis.tmPendientes, 2),
      hint: 'Toneladas aún por despachar.',
    },
    {
      key: 'totalPedidos',
      title: 'Total de pedidos',
      value: formatNumber(kpis.totalPedidos),
      hint: 'Cantidad total de pedidos dentro del período.',
    },
    {
      key: 'pedidosCumplidos',
      title: 'Pedidos cumplidos',
      value: formatNumber(kpis.pedidosCumplidos),
      hint: 'Pedidos que cumplieron la meta esperada.',
    },
    {
      key: 'pedidosIncumplidos',
      title: 'Pedidos incumplidos',
      value: formatNumber(kpis.pedidosIncumplidos),
      hint: 'Pedidos que no alcanzaron el cumplimiento.',
    },
    {
      key: 'clientesAfectados',
      title: 'Clientes afectados',
      value: formatNumber(kpis.clientesAfectados),
      hint: 'Clientes involucrados en los pedidos del período.',
    },
    {
      key: 'promedioDiario',
      title: 'Promedio diario de TM programadas',
      value: formatNumber(kpis.promedioDiarioTmProgramadas, 2),
      hint: 'Promedio diario de toneladas programadas.',
    },
  ], [kpis])

  const hasAnyFilters = hasActiveFilters || hasCrossFilters || selectedClients.length > 0
  const hasAreaFilter = crossFilters.some((filter) => filter.key === 'area')

  return (
    <section className="page-card operational-page">
      <div className="operational-page__header">
        <div>
          <p className="operational-page__eyebrow">Módulo operativo</p>
          <h2>Panorama del desempeño</h2>
          <p>Consulta los KPI reales del negocio desde las vistas de Supabase.</p>
        </div>
      </div>

      <div className="operational-page__controls">
        <div className="operational-page__controls-top">
          <GlobalYearFilter
            availableYears={availableYears}
            selectedYear={selectedYear}
            onYearChange={changeYear}
          />

          <div className="operational-page__control-group operational-page__control-group--action">
            <button
              type="button"
              className="operational-page__reset operational-page__reset--compact"
              onClick={handleResetFilters}
              disabled={!hasAnyFilters}
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

      {crossFilters.length > 0 && (
        <div className="operational-page__cross-filters">
          {crossFilters.map((filter) => {
            const label = filter.key === 'causa'
              ? `Causa: ${filter.value}`
              : filter.key === 'area'
                ? `Área: ${filter.value}`
                : `Cliente: ${filter.value}`

            return (
              <button
                key={`${filter.key}-${filter.value}`}
                type="button"
                className="operational-page__chip operational-page__chip--removable"
                onClick={() => removeCrossFilter(filter)}
              >
                {label}
                <span aria-hidden="true">×</span>
              </button>
            )
          })}
        </div>
      )}

      {selectedMonths.length > 0 && (
        <div className="operational-page__cross-filters">
          {selectedMonths.map((month) => {
            const option = availableMonths.find((item) => item.value === month)
            return (
              <button
                key={month}
                type="button"
                className="operational-page__chip operational-page__chip--removable"
                onClick={() => removeMonth(month)}
              >
                {option?.label ?? month}
                <span aria-hidden="true">×</span>
              </button>
            )
          })}
        </div>
      )}

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
          <p>{error?.message ?? 'Ocurrió un problema inesperado al consultar Supabase.'}</p>
        </div>
      )}

      {status === 'empty' && (
        <div className="operational-page__state operational-page__state--empty" role="status">
          <h3>No hay datos disponibles</h3>
          <p>No existen registros para los filtros seleccionados.</p>
        </div>
      )}

      {status === 'success' && (
        <>
          <div className="operational-page__grid">
            <div className="operational-page__highlight-card">
              <div className="operational-page__highlight-label">% de cumplimiento</div>
              <div className={`operational-page__highlight-value operational-page__highlight-value--${getComplianceTone(kpis.cumplimientoPct)}`}>
                {formatPercent(kpis.cumplimientoPct)}
              </div>
              <div className="operational-page__highlight-caption">
                {kpis.monthLabel ? `Resumen de ${kpis.monthLabel}` : 'Resumen del período seleccionado'}
              </div>
            </div>
            {kpiCards.map((card) => (
              <KpiCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
              />
            ))}
          </div>

          <div className="operational-page__insights-shell">
            {insightsStatus === 'loading' && (
              <div className="operational-page__state operational-page__state--loading" role="status">
                <div className="operational-page__skeletal-grid operational-page__skeletal-grid--wide">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="operational-page__skeleton" />
                  ))}
                </div>
              </div>
            )}

            {insightsStatus === 'error' && (
              <div className="operational-page__state operational-page__state--error" role="alert">
                <h3>No se pudieron cargar los análisis</h3>
                <p>{insightsError?.message ?? 'Ocurrió un problema inesperado al consultar las vistas de análisis.'}</p>
              </div>
            )}

            {insightsStatus === 'empty' && (
              <div className="operational-page__state operational-page__state--empty" role="status">
                <h3>No hay información disponible</h3>
                <p>No hay información para los filtros seleccionados.</p>
              </div>
            )}

            {insightsStatus === 'success' && insightsData && (
              <OperationalCharts
                temporalSeries={insightsData.temporalSeries}
                incumplimientosSeries={insightsData.incumplimientosSeries}
                volumeSeries={insightsData.volumeSeries}
                areaIncidents={insightsData.areaIncidents}
                areaPendingTm={insightsData.areaPendingTm}
                topCauseRows={insightsData.topCauseRows}
                topClientRows={insightsData.topClientRows}
                hasAreaFilter={hasAreaFilter}
                onSelectCausa={(causa) => toggleCrossFilter({ key: 'causa', value: causa })}
                onSelectArea={(area) => toggleCrossFilter({ key: 'area', value: area })}
                onSelectCliente={(cliente) => toggleCrossFilter({ key: 'cliente', value: cliente })}
              />
            )}
          </div>
        </>
      )}
    </section>
  )
}
