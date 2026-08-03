import { Fragment, useMemo, useState } from 'react'
import { GlobalMonthFilter, GlobalYearFilter } from '../components/GlobalPeriodFilters'
import { KpiCard } from '../components/operational/KpiCard'
import { useCommercialDashboard } from '../hooks/useCommercialDashboard'

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function formatNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatDecimal(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function CommercialPage() {
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientQuery, setClientQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<string[]>([])
  const [showAllCauses, setShowAllCauses] = useState(false)
  const [showAllClients, setShowAllClients] = useState(false)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)

  const {
    status,
    error,
    kpis,
    causeTableRows,
    commercialDetailRows,
    availableClients,
    availableYears,
    availableMonths,
    selectedYear,
    selectedMonths,
    changeYear,
    toggleMonth,
    resetFilters,
    hasActiveFilters,
    availableAreas,
  } = useCommercialDashboard(selectedClients, selectedArea)

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

  const areaOptions = useMemo(() => ['TODAS', ...availableAreas], [availableAreas])

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
    setExpandedRows([])
    setShowAllCauses(false)
    setShowAllClients(false)
    setSelectedArea(null)
  }

  const toggleRowExpansion = (rowKey: string) => {
    setExpandedRows((current) => {
      if (current.includes(rowKey)) {
        return current.filter((item) => item !== rowKey)
      }

      return [...current, rowKey]
    })
  }

  const hasAnyFilters = hasActiveFilters || selectedClients.length > 0
  const visibleCauseRows = showAllCauses ? causeTableRows : causeTableRows.slice(0, 10)
  const visibleCommercialRows = showAllClients ? commercialDetailRows : commercialDetailRows.slice(0, 10)

  const kpiCards = useMemo(() => [
    {
      key: 'tmPendientes',
      title: 'TM PENDIENTES',
      value: formatDecimal(kpis.tmPendientes),
      hint: 'Toneladas pendientes del período filtrado.',
    },
    {
      key: 'pedidosIncumplidos',
      title: 'PEDIDOS INCUMPLIDOS',
      value: formatNumber(kpis.pedidosIncumplidos),
      hint: 'Cantidad de pedidos incumplidos.',
    },
    {
      key: 'clientesAfectados',
      title: 'CLIENTES AFECTADOS',
      value: formatNumber(kpis.clientesAfectados),
      hint: 'Clientes afectados en el período.',
    },
    {
      key: 'vendedoresInvolucrados',
      title: 'VENDEDORES INVOLUCRADOS',
      value: formatNumber(kpis.vendedoresInvolucrados),
      hint: 'Vendedores involucrados en los registros filtrados.',
    },
  ], [kpis])

  return (
    <section className="page-card commercial-page">
      <div className="operational-page__header">
        <div>
          <p className="operational-page__eyebrow">Módulo comercial</p>
          <h2>Seguimiento comercial</h2>
          <p>Vista inicial con estructura de indicadores y detalle comercial.</p>
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
          <p>{error?.message ?? 'Ocurrió un problema inesperado al consultar Comercial.'}</p>
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
          <div className="operational-page__grid commercial-page__kpi-grid">
            {kpiCards.map((card) => (
              <KpiCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
              />
            ))}
          </div>

          <div className="commercial-page__area-filter">
            <div className="operational-page__control-group">
              <span className="operational-page__label">Área</span>
              <select
                className="operational-page__year-select commercial-page__area-select"
                value={selectedArea ?? 'TODAS'}
                onChange={(event) => {
                  setSelectedArea(event.target.value === 'TODAS' ? null : event.target.value)
                  setShowAllCauses(false)
                  setShowAllClients(false)
                  setExpandedRows([])
                }}
                aria-label="Filtrar por área"
              >
                {areaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area === 'TODAS' ? 'Todas las áreas' : area}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="commercial-page__tables-grid">
            <article className="operational-card operational-card--table commercial-page__table-card">
              <header className="operational-card__header">
                <div>
                  <h3>Indicador por causas</h3>
                  <p>Resumen de TM pendiente e incumplimientos por causa.</p>
                </div>
              </header>

              <div className="operational-table-wrapper">
                <table className="operational-table operational-table--compact">
                  <thead>
                    <tr>
                      <th className="commercial-page__table-head-left">CAUSA</th>
                      <th className="commercial-page__table-head-center commercial-page__table-head-wrap">TM PENDIENTE</th>
                      <th className="commercial-page__table-head-center commercial-page__table-head-wrap">PEDIDOS INCUMPLIDOS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCauseRows.map((row) => (
                      <tr key={row.causa}>
                        <td className="commercial-page__table-cell-left">{row.causa}</td>
                        <td className="commercial-page__table-cell-center">{formatDecimal(row.tmPendiente)}</td>
                        <td className="commercial-page__table-cell-center">{formatNumber(row.pedidosIncumplidos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {causeTableRows.length > 10 && (
                <button
                  type="button"
                  className="commercial-page__toggle-more"
                  onClick={() => setShowAllCauses((current) => !current)}
                >
                  {showAllCauses ? 'Ver menos causas' : 'Ver todas las causas'}
                </button>
              )}
            </article>

            <article className="operational-card operational-card--table commercial-page__table-card">
              <header className="operational-card__header">
                <div>
                  <h3>Detalle comercial</h3>
                  <p>Resumen de TM pendiente por cliente y vendedor.</p>
                </div>
              </header>

              <div className="operational-table-wrapper">
                <table className="operational-table operational-table--compact commercial-page__detail-table">
                  <thead>
                    <tr>
                      <th className="commercial-page__table-head-expand" />
                      <th className="commercial-page__table-head-left">CLIENTE</th>
                      <th className="commercial-page__table-head-left">VENDEDOR</th>
                      <th className="commercial-page__table-head-center">TM PENDIENTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCommercialRows.map((row) => {
                      const isExpanded = expandedRows.includes(row.key)

                      return (
                        <Fragment key={row.key}>
                          <tr className="commercial-page__detail-row">
                            <td
                              className="commercial-page__table-cell-expand"
                              onClick={() => toggleRowExpansion(row.key)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  toggleRowExpansion(row.key)
                                }
                              }}
                              aria-label={isExpanded ? 'Contraer fila' : 'Expandir fila'}
                            >
                              <span className="commercial-page__expand-icon" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                            </td>
                            <td className="commercial-page__table-cell-left">
                              <span className="commercial-page__table-cell-main">{row.cliente}</span>
                            </td>
                            <td className="commercial-page__table-cell-left"><span className="commercial-page__table-cell-main">{row.vendedor}</span></td>
                            <td className="commercial-page__table-cell-center">{formatDecimal(row.tmPendiente)}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="commercial-page__detail-expand-row">
                              <td colSpan={4}>
                                <div className="commercial-page__detail-expand-content">
                                  <table className="operational-table operational-table--compact">
                                    <thead>
                                      <tr>
                                        <th className="commercial-page__table-head-left">CAUSA</th>
                                        <th className="commercial-page__table-head-center commercial-page__table-head-wrap">TM PENDIENTE</th>
                                        <th className="commercial-page__table-head-center commercial-page__table-head-wrap">PEDIDOS INCUMPLIDOS</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.causes.length === 0 && (
                                        <tr>
                                          <td colSpan={3} className="commercial-page__table-cell-left commercial-page__expand-cell">Sin causas asociadas.</td>
                                        </tr>
                                      )}
                                      {row.causes.map((cause) => (
                                        <tr key={`${row.key}-${cause.causa}`}>
                                          <td className="commercial-page__table-cell-left commercial-page__expand-cell">{cause.causa}</td>
                                          <td className="commercial-page__table-cell-center commercial-page__expand-cell">{formatDecimal(cause.tmPendiente)}</td>
                                          <td className="commercial-page__table-cell-center commercial-page__expand-cell">{formatNumber(cause.pedidosIncumplidos)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {commercialDetailRows.length > 10 && (
                <button
                  type="button"
                  className="commercial-page__toggle-more"
                  onClick={() => setShowAllClients((current) => !current)}
                >
                  {showAllClients ? 'Ver menos clientes' : 'Ver más clientes'}
                </button>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  )
}
