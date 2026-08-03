import { useEffect, useMemo, useState } from 'react'
import { normalizeText, readNumericValue, readTextValue } from '../lib/operationalDetail'
import { fetchConsultaPedidosRows } from '../services/consultaService'
import type { ConsultaPedidoRow } from '../types/consulta'
import type { AvailableMonthOption } from '../types/operational'

const DEFAULT_PAGE_SIZE = 25
const ALL_ASSISTANTS_VALUE = '__ALL__'

export type ConsultaSortKey =
  | 'fecha'
  | 'ov'
  | 'codParte'
  | 'cliente'
  | 'cantSolic'
  | 'ingresoAlmacen'
  | 'cantDesp'
  | 'porcentaje'

export type ConsultaSortDirection = 'asc' | 'desc'

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const datePart = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : trimmed
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

function compareOvDescending(left: string, right: string): number {
  return right.localeCompare(left, 'es', { sensitivity: 'base', numeric: true })
}

function readOvValue(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readPercentValue(cantDespachada: number | null, ingresoAlmacen: number | null): number {
  if (ingresoAlmacen === null || !Number.isFinite(ingresoAlmacen) || ingresoAlmacen <= 0) {
    return 0
  }

  if (cantDespachada === null || !Number.isFinite(cantDespachada)) {
    return 0
  }

  const ratio = cantDespachada / ingresoAlmacen
  if (!Number.isFinite(ratio) || ratio < 0) {
    return 0
  }

  return ratio * 100
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0
  }

  if (left === null) {
    return -1
  }

  if (right === null) {
    return 1
  }

  return left - right
}

interface ConsultaLoadedData {
  rows: ConsultaPedidoRow[]
  initialYear: number | null
  initialMonth: string
}

let consultaLoadedDataPromise: Promise<ConsultaLoadedData> | null = null

async function loadConsultaPedidosData(): Promise<ConsultaLoadedData> {
  if (consultaLoadedDataPromise) {
    return consultaLoadedDataPromise
  }

  consultaLoadedDataPromise = (async () => {
    const rawRows = await fetchConsultaPedidosRows()

    const normalizedRows = rawRows
      .map((raw, index) => normalizeConsultaRow(raw, index))
      .filter((row): row is ConsultaPedidoRow => row !== null)

    normalizedRows.sort((left, right) => {
      if (left.dateKey !== right.dateKey) {
        return right.dateKey.localeCompare(left.dateKey)
      }

      const ovComparison = compareOvDescending(left.ordenVenta, right.ordenVenta)
      if (ovComparison !== 0) {
        return ovComparison
      }

      return left.sourceIndex - right.sourceIndex
    })

    const years = Array.from(new Set(normalizedRows.map((row) => row.year))).sort((a, b) => b - a)
    const initialYear = years[0] ?? null
    const firstRowForYear = initialYear === null
      ? null
      : normalizedRows.find((row) => row.year === initialYear) ?? null
    const initialMonth = firstRowForYear
      ? `${initialYear}-${String(firstRowForYear.month).padStart(2, '0')}`
      : ''

    return {
      rows: normalizedRows,
      initialYear,
      initialMonth,
    }
  })().catch((error) => {
    consultaLoadedDataPromise = null
    throw error
  })

  return consultaLoadedDataPromise
}

function getDaysInMonth(year: number | null, monthKey: string | undefined): number {
  if (year === null || !monthKey) {
    return 0
  }

  const month = Number(monthKey.slice(5, 7))
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return 0
  }

  return new Date(year, month, 0).getDate()
}

function buildMonthOptions(rows: ConsultaPedidoRow[], selectedYear: number | null): AvailableMonthOption[] {
  if (selectedYear === null) {
    return []
  }

  const monthSet = new Set<number>()

  for (const row of rows) {
    if (row.year === selectedYear) {
      monthSet.add(row.month)
    }
  }

  return Array.from(monthSet)
    .sort((a, b) => a - b)
    .map((month) => ({
      value: `${selectedYear}-${String(month).padStart(2, '0')}`,
      label: `${selectedYear}-${String(month).padStart(2, '0')}`,
      year: selectedYear,
      month,
    }))
}

function normalizeConsultaRow(raw: Record<string, unknown>, sourceIndex: number): ConsultaPedidoRow | null {
  const fechaRaw = readTextValue(raw, ['fecha'])
  const parsedDate = parseDateValue(fechaRaw)

  if (!parsedDate) {
    return null
  }

  const ordenVenta = readTextValue(raw, ['orden_venta']) ?? ''
  const codigoParte = readTextValue(raw, ['cod_parte']) ?? ''
  const cliente = readTextValue(raw, ['cliente']) ?? ''
  const cantSolicitada = readNumericValue(raw, ['cant_solicitada'])
  const ingresoAlmacen = readNumericValue(raw, ['ingreso_almacen'])
  const cantDespachada = readNumericValue(raw, ['cant_despachada'])
  const asistente = readTextValue(raw, ['asistente']) ?? ''
  const causa = readTextValue(raw, ['causa']) ?? ''

  const year = parsedDate.getFullYear()
  const month = parsedDate.getMonth() + 1
  const day = parsedDate.getDate()
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const fechaLabel = new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate)

  return {
    id: `${dateKey}|${ordenVenta}|${codigoParte}|${sourceIndex}`,
    sourceIndex,
    dateKey,
    fechaLabel,
    year,
    month,
    day,
    ordenVenta,
    codigoParte,
    cliente,
    cantSolicitada,
    ingresoAlmacen: ingresoAlmacen ?? 0,
    cantDespachada,
    asistente,
    causa,
  }
}

export function useConsultaPedidos() {
  const [rows, setRows] = useState<ConsultaPedidoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientQuery, setClientQuery] = useState('')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedAssistant, setSelectedAssistant] = useState(ALL_ASSISTANTS_VALUE)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortBy, setSortBy] = useState<ConsultaSortKey>('fecha')
  const [sortDirection, setSortDirection] = useState<ConsultaSortDirection>('desc')
  const [defaultYear, setDefaultYear] = useState<number | null>(null)
  const [defaultMonth, setDefaultMonth] = useState<string>('')

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const loadedData = await loadConsultaPedidosData()

        if (!mounted) {
          return
        }

        setRows(loadedData.rows)

        setSelectedYear(loadedData.initialYear)
        setSelectedMonths(loadedData.initialMonth ? [loadedData.initialMonth] : [])
        setDefaultYear(loadedData.initialYear)
        setDefaultMonth(loadedData.initialMonth)
      } catch (loadError) {
        if (!mounted) {
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la consulta.')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  const availableYears = useMemo(
    () => Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => b - a),
    [rows],
  )

  const availableMonths = useMemo(
    () => buildMonthOptions(rows, selectedYear),
    [rows, selectedYear],
  )

  useEffect(() => {
    const currentMonth = selectedMonths[0]
    if (!currentMonth) {
      return
    }

    const monthExists = availableMonths.some((month) => month.value === currentMonth)
    if (!monthExists) {
      setSelectedMonths([])
      setSelectedDay(null)
    }
  }, [availableMonths, selectedMonths])

  const selectedMonth = selectedMonths[0]
  const daysInMonth = useMemo(
    () => getDaysInMonth(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  )

  useEffect(() => {
    if (selectedDay === null) {
      return
    }

    if (selectedDay > daysInMonth || daysInMonth === 0) {
      setSelectedDay(null)
    }
  }, [daysInMonth, selectedDay])

  const baseFilteredRows = useMemo(
    () => rows.filter((row) => {
      if (selectedYear !== null && row.year !== selectedYear) {
        return false
      }

      if (selectedMonth && `${row.year}-${String(row.month).padStart(2, '0')}` !== selectedMonth) {
        return false
      }

      if (selectedDay !== null && row.day !== selectedDay) {
        return false
      }

      if (selectedAssistant !== ALL_ASSISTANTS_VALUE && normalizeText(row.asistente) !== normalizeText(selectedAssistant)) {
        return false
      }

      return true
    }),
    [rows, selectedYear, selectedMonth, selectedDay, selectedAssistant],
  )

  const availableClients = useMemo(() => {
    const uniqueClients = new Map<string, string>()

    for (const row of baseFilteredRows) {
      const clientName = row.cliente.trim()
      if (!clientName) {
        continue
      }

      const normalized = normalizeText(clientName)
      if (!normalized || !uniqueClients.has(normalized)) {
        uniqueClients.set(normalized, clientName)
      }
    }

    return Array.from(uniqueClients.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [baseFilteredRows])

  const matchingClients = useMemo(() => {
    const normalizedQuery = normalizeText(clientQuery)
    const selectable = availableClients.filter((client) => !selectedClients.includes(client))

    if (!normalizedQuery) {
      return selectable.slice(0, 8)
    }

    return selectable.filter((client) => normalizeText(client).includes(normalizedQuery)).slice(0, 8)
  }, [availableClients, clientQuery, selectedClients])

  const assistantOptions = useMemo(() => {
    const uniqueAssistants = new Map<string, string>()

    for (const row of rows) {
      const assistant = row.asistente.trim()
      if (!assistant) {
        continue
      }

      const normalized = normalizeText(assistant)
      if (!normalized || !uniqueAssistants.has(normalized)) {
        uniqueAssistants.set(normalized, assistant)
      }
    }

    return Array.from(uniqueAssistants.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [rows])

  useEffect(() => {
    if (selectedAssistant === ALL_ASSISTANTS_VALUE) {
      return
    }

    const exists = assistantOptions.some((assistant) => normalizeText(assistant) === normalizeText(selectedAssistant))
    if (!exists) {
      setSelectedAssistant(ALL_ASSISTANTS_VALUE)
    }
  }, [assistantOptions, selectedAssistant])

  const normalizedSelectedClients = useMemo(
    () => new Set(selectedClients.map((client) => normalizeText(client))),
    [selectedClients],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm)

    return baseFilteredRows.filter((row) => {
      if (normalizedSelectedClients.size > 0 && !normalizedSelectedClients.has(normalizeText(row.cliente))) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const searchableText = normalizeText(`${row.ordenVenta} ${row.cliente} ${row.codigoParte}`)
      return searchableText.includes(normalizedSearch)
    })
  }, [baseFilteredRows, normalizedSelectedClients, searchTerm])

  const sortedFilteredRows = useMemo(() => {
    const sorted = [...filteredRows]

    sorted.sort((left, right) => {
      let comparison = 0

      if (sortBy === 'fecha') {
        comparison = left.dateKey.localeCompare(right.dateKey)
      }

      if (sortBy === 'ov') {
        const leftOv = readOvValue(left.ordenVenta)
        const rightOv = readOvValue(right.ordenVenta)

        if (leftOv !== null && rightOv !== null) {
          comparison = leftOv - rightOv
        } else {
          comparison = left.ordenVenta.localeCompare(right.ordenVenta, 'es', { sensitivity: 'base', numeric: true })
        }
      }

      if (sortBy === 'codParte') {
        comparison = left.codigoParte.localeCompare(right.codigoParte, 'es', { sensitivity: 'base' })
      }

      if (sortBy === 'cliente') {
        comparison = left.cliente.localeCompare(right.cliente, 'es', { sensitivity: 'base' })
      }

      if (sortBy === 'cantSolic') {
        comparison = compareNullableNumber(left.cantSolicitada, right.cantSolicitada)
      }

      if (sortBy === 'ingresoAlmacen') {
        comparison = compareNullableNumber(left.ingresoAlmacen, right.ingresoAlmacen)
      }

      if (sortBy === 'cantDesp') {
        comparison = compareNullableNumber(left.cantDespachada, right.cantDespachada)
      }

      if (sortBy === 'porcentaje') {
        comparison = readPercentValue(left.cantDespachada, left.ingresoAlmacen)
          - readPercentValue(right.cantDespachada, right.ingresoAlmacen)
      }

      if (comparison === 0) {
        return left.sourceIndex - right.sourceIndex
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [filteredRows, sortBy, sortDirection])

  useEffect(() => {
    setPage(1)
  }, [searchTerm, selectedYear, selectedMonth, selectedDay, selectedAssistant, selectedClients, pageSize])

  const applySort = (nextSortBy: ConsultaSortKey) => {
    setPage(1)
    if (sortBy === nextSortBy) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortBy(nextSortBy)
    setSortDirection('asc')
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => sortedFilteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedFilteredRows, pageSize, safePage],
  )

  const hasActiveFilters = useMemo(
    () => (
      selectedYear !== defaultYear
      || selectedMonth !== defaultMonth
      || selectedDay !== null
      || selectedAssistant !== ALL_ASSISTANTS_VALUE
      || selectedClients.length > 0
      || normalizeText(searchTerm).length > 0
    ),
    [defaultMonth, defaultYear, searchTerm, selectedAssistant, selectedClients.length, selectedDay, selectedMonth, selectedYear],
  )

  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth }, (_, index) => index + 1),
    [daysInMonth],
  )

  const addClient = (clientName: string) => {
    const trimmed = clientName.trim()
    if (!trimmed) {
      return
    }

    setSelectedClients((current) => {
      if (current.some((item) => normalizeText(item) === normalizeText(trimmed))) {
        return current
      }

      return [...current, trimmed]
    })

    setClientQuery('')
  }

  const removeClient = (clientName: string) => {
    setSelectedClients((current) => current.filter((item) => item !== clientName))
  }

  const changeYear = (year: number) => {
    setSelectedYear(year)
    setSelectedMonths([])
    setSelectedDay(null)
  }

  const toggleMonth = (monthKey: string) => {
    setSelectedMonths([monthKey])
    setSelectedDay(null)
  }

  const resetFilters = () => {
    setSelectedYear(defaultYear)
    setSelectedMonths(defaultMonth ? [defaultMonth] : [])
    setSelectedDay(null)
    setSelectedAssistant(ALL_ASSISTANTS_VALUE)
    setSelectedClients([])
    setClientQuery('')
    setSearchTerm('')
    setPageSize(DEFAULT_PAGE_SIZE)
  }

  return {
    loading,
    error,
    searchTerm,
    setSearchTerm,
    rows: pageItems,
    page: safePage,
    setPage: (nextPage: number) => setPage(Math.min(Math.max(1, nextPage), totalPages)),
    pageSize,
    setPageSize,
    sortBy,
    sortDirection,
    applySort,
    totalPages,
    totalItems: filteredRows.length,
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
    allAssistantsValue: ALL_ASSISTANTS_VALUE,
  }
}
