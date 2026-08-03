import { useMemo } from 'react'
import { Tooltip } from '../components/Tooltip'
import { GlobalMonthFilter, GlobalYearFilter } from '../components/GlobalPeriodFilters'
import { useConsultaPedidos } from '../hooks/useConsultaPedidos'
import type { ConsultaSortKey } from '../hooks/useConsultaPedidos'

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatMappedInteger(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return ''
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(cantDespachada: number | null, ingresoAlmacen: number | null): string {
  if (ingresoAlmacen === null || !Number.isFinite(ingresoAlmacen) || ingresoAlmacen <= 0) {
    return '0%'
  }

  if (cantDespachada === null || !Number.isFinite(cantDespachada)) {
    return '0%'
  }

  const ratio = cantDespachada / ingresoAlmacen
  if (!Number.isFinite(ratio) || ratio < 0) {
    return '0%'
  }

  return `${Math.round(ratio * 100)}%`
}

export function ConsultaPage() {
  const {
    loading,
    error,
    searchTerm,
    setSearchTerm,
    rows,
    page,
    setPage,
    pageSize,
    setPageSize,
    sortBy,
    sortDirection,
    applySort,
    totalPages,
    totalItems,
    availableYears,
    availableMonths,
    selectedYear,
    selectedMonths,
    changeYear,
    toggleMonth,
    selectedDay,
    setSelectedDay,
    dayOptions,
    selectedAssistant,
    setSelectedAssistant,
    assistantOptions,
    selectedClients,
    clientQuery,
    setClientQuery,
    matchingClients,
    addClient,
    removeClient,
    resetFilters,
    hasActiveFilters,
    allAssistantsValue,
  } = useConsultaPedidos()
  const pageStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = totalItems === 0 ? 0 : pageStart + rows.length - 1
  const canRenderFilters = availableYears.length > 0 && selectedYear !== null
  const selectedMonthKey = selectedMonths[0] ?? ''

  const calendarRows = useMemo(() => {
    if (!selectedYear || !selectedMonthKey || dayOptions.length === 0) {
      return [] as Array<Array<number | null>>
    }

    const month = Number(selectedMonthKey.slice(5, 7))
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return [] as Array<Array<number | null>>
    }

    const firstDayOfWeek = new Date(selectedYear, month - 1, 1).getDay()
    const mondayFirstOffset = (firstDayOfWeek + 6) % 7
    const cells: Array<number | null> = [
      ...Array.from({ length: mondayFirstOffset }, () => null),
      ...dayOptions,
    ]

    while (cells.length % 7 !== 0) {
      cells.push(null)
    }

    const chunks: Array<Array<number | null>> = []

    for (let index = 0; index < cells.length; index += 7) {
      chunks.push(cells.slice(index, index + 7))
    }

    return chunks
  }, [dayOptions, selectedMonthKey, selectedYear])

  const selectedMonthLabel = useMemo(() => {
    if (!selectedYear || !selectedMonthKey) {
      return 'Selecciona mes'
    }

    const month = Number(selectedMonthKey.slice(5, 7))
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return 'Selecciona mes'
    }

    const label = new Intl.DateTimeFormat('es-CL', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(selectedYear, month - 1, 1))

    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [selectedMonthKey, selectedYear])

  const selectedMonthIndex = useMemo(
    () => availableMonths.findIndex((month) => month.value === selectedMonthKey),
    [availableMonths, selectedMonthKey],
  )

  const canGoPrevMonth = selectedMonthIndex > 0
  const canGoNextMonth = selectedMonthIndex !== -1 && selectedMonthIndex < availableMonths.length - 1

  const today = new Date()
  const displayedMonth = Number(selectedMonthKey.slice(5, 7))
  const isDisplayedCurrentMonth = selectedYear === today.getFullYear()
    && Number.isFinite(displayedMonth)
    && displayedMonth === today.getMonth() + 1

  const weekdayHeaders = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const renderSortableHeader = (label: string, key: ConsultaSortKey, align: 'left' | 'center') => {
    const isActive = sortBy === key
    return (
      <button
        type="button"
        className={`consulta-page__sort-button consulta-page__sort-button--${align}`}
        onClick={() => applySort(key)}
      >
        <span>{label}</span>
        {isActive && <span className="consulta-page__sort-indicator" aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
      </button>
    )
  }

  return (
    <section className="page-card consulta-page">
      <div className="consulta-page__header">
        <p className="operational-page__eyebrow">Módulo consulta de pedidos</p>
        <h2>Consulta de pedidos</h2>
      </div>

      {canRenderFilters && (
        <div className="operational-page__controls consulta-page__controls">
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
                onClick={resetFilters}
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
      )}

      {canRenderFilters && (
        <div className="consulta-page__secondary-filters">
          <div className="consulta-page__day-filter">
            <div className="consulta-page__secondary-header">
              <span className="operational-page__label">Día</span>
              {selectedDay !== null && (
                <button
                  type="button"
                  className="consulta-page__inline-reset"
                  onClick={() => setSelectedDay(null)}
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="consulta-page__calendar-header">
              <button
                type="button"
                className="consulta-page__calendar-nav"
                onClick={() => {
                  if (!canGoPrevMonth) {
                    return
                  }

                  const previous = availableMonths[selectedMonthIndex - 1]
                  if (previous) {
                    toggleMonth(previous.value)
                  }
                }}
                disabled={!canGoPrevMonth}
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <strong className="consulta-page__calendar-title">{selectedMonthLabel}</strong>
              <button
                type="button"
                className="consulta-page__calendar-nav"
                onClick={() => {
                  if (!canGoNextMonth) {
                    return
                  }

                  const next = availableMonths[selectedMonthIndex + 1]
                  if (next) {
                    toggleMonth(next.value)
                  }
                }}
                disabled={!canGoNextMonth}
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>

            <div className="consulta-page__day-grid" role="group" aria-label="Seleccionar día">
              <div className="consulta-page__day-row consulta-page__day-row--labels" aria-hidden="true">
                {weekdayHeaders.map((weekday) => (
                  <span key={weekday} className="consulta-page__day-label">{weekday}</span>
                ))}
              </div>

              {calendarRows.map((days, rowIndex) => (
                <div key={`week-${rowIndex}`} className="consulta-page__day-row">
                  {days.map((day, dayIndex) => {
                    if (day === null) {
                      return <span key={`empty-${rowIndex}-${dayIndex}`} className="consulta-page__day-cell consulta-page__day-cell--empty" aria-hidden="true" />
                    }

                    const isActive = selectedDay === day
                    const isToday = isDisplayedCurrentMonth && day === today.getDate()
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`consulta-page__day-button${isActive ? ' is-active' : ''}${isToday ? ' is-today' : ''}`}
                        onClick={() => setSelectedDay(day)}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="consulta-page__assistant-filter">
            <span className="operational-page__label">Asistente</span>
            <select
              className="operational-page__year-select"
              value={selectedAssistant}
              onChange={(event) => setSelectedAssistant(event.target.value)}
              aria-label="Filtrar por asistente"
            >
              <option value={allAssistantsValue}>Todos los asistentes</option>
              {assistantOptions.map((assistant) => (
                <option key={assistant} value={assistant}>
                  {assistant}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="consulta-page__search-shell">
        <div className="consulta-page__search-row">
          <input
            type="text"
            className="consulta-page__search-input"
            placeholder="Buscar por OV, cliente o código de parte..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Buscar pedidos"
          />

          <div className="consulta-page__search-meta">
            <span>{formatInteger(totalItems)} registros</span>
            <span>{formatInteger(page)} / {formatInteger(totalPages)} páginas</span>
          </div>
        </div>
      </div>

      {loading && <div className="consulta-page__state">Cargando pedidos...</div>}

      {!loading && error && <div className="consulta-page__state consulta-page__state--error">{error}</div>}

      {!loading && !error && totalItems === 0 && (
        <div className="consulta-page__state">No existen registros de pedidos para mostrar.</div>
      )}

      {!loading && !error && totalItems > 0 && (
        <>
          <div className="operational-table-wrapper consulta-page__table-shell">
            <table className="operational-table operational-table--compact consulta-page__table">
              <thead>
                <tr>
                  <th className="consulta-page__th-center consulta-column--fecha">{renderSortableHeader('FECHA', 'fecha', 'center')}</th>
                  <th className="consulta-page__th-center consulta-column--ov">{renderSortableHeader('OV', 'ov', 'center')}</th>
                  <th className="consulta-page__th-left consulta-column--cod-parte">{renderSortableHeader('COD PARTE', 'codParte', 'left')}</th>
                  <th className="consulta-page__th-left consulta-column--cliente">{renderSortableHeader('CLIENTE', 'cliente', 'left')}</th>
                  <th className="consulta-page__th-center consulta-column--cantidad">{renderSortableHeader('CANT SOLIC', 'cantSolic', 'center')}</th>
                  <th className="consulta-page__th-center consulta-page__th-wrap consulta-column--cantidad">{renderSortableHeader('INGRESO ALMACÉN', 'ingresoAlmacen', 'center')}</th>
                  <th className="consulta-page__th-center consulta-column--cantidad">{renderSortableHeader('CANT DESP', 'cantDesp', 'center')}</th>
                  <th className="consulta-page__th-center consulta-column--percent">{renderSortableHeader('%', 'porcentaje', 'center')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="consulta-page__td-center consulta-column--fecha">{row.fechaLabel}</td>
                    <td className="consulta-page__td-center consulta-column--ov">{row.ordenVenta}</td>
                    <td className="consulta-page__td-left consulta-column--cod-parte">{row.codigoParte}</td>
                    <td className="consulta-page__td-left consulta-page__td-client consulta-column--cliente">{row.cliente}</td>
                    <td className="consulta-page__td-center consulta-column--cantidad">{formatMappedInteger(row.cantSolicitada)}</td>
                    <td className="consulta-page__td-center consulta-column--cantidad">{formatMappedInteger(row.ingresoAlmacen)}</td>
                    <td className="consulta-page__td-center consulta-column--cantidad">{formatMappedInteger(row.cantDespachada)}</td>
                    <td className="consulta-page__td-center consulta-column--percent">
                      {(() => {
                        const percentLabel = formatPercent(row.cantDespachada, row.ingresoAlmacen)
                        const isCumplido = percentLabel === '100%'
                        const hasCause = row.causa.trim().length > 0

                        return (
                          <span className="consulta-page__percent-shell">
                            <span
                              className={`consulta-page__percent-badge ${isCumplido ? 'consulta-page__percent-badge--ok' : 'consulta-page__percent-badge--alert'}`}
                              aria-label={hasCause ? `Causa: ${row.causa}` : undefined}
                            >
                              {hasCause ? (
                                <Tooltip content={row.causa}>
                                  <span className="consulta-page__percent-badge-value">{percentLabel}</span>
                                </Tooltip>
                              ) : (
                                <span className="consulta-page__percent-badge-value">{percentLabel}</span>
                              )}
                            </span>
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="consulta-page__pagination">
            <span>
              Mostrando {formatInteger(pageStart)}-{formatInteger(pageEnd)} de {formatInteger(totalItems)}
            </span>

            <div className="consulta-page__pagination-actions">
              <label className="consulta-page__per-page">
                Filas
                <select
                  value={pageSize}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value) && value > 0) {
                      setPageSize(value)
                    }
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>

              <button type="button" className="consulta-page__page-button" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                Anterior
              </button>
              <button type="button" className="consulta-page__page-button" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}

    </section>
  )
}