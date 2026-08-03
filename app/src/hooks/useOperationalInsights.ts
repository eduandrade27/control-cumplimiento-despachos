import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchOperationalInsightsData } from '../services/operationalInsightsService'
import type { OperationalInsightCrossFilter } from '../types/operationalInsights'
import type { SupabaseErrorInfo } from '../types/operational'

export function useOperationalInsights(selectedMonths: string[], selectedClients: string[]) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOperationalInsightsData>> | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'empty' | 'error'>('loading')
  const [error, setError] = useState<SupabaseErrorInfo | null>(null)
  const [crossFilters, setCrossFilters] = useState<OperationalInsightCrossFilter[]>([])

  const loadData = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const insights = await fetchOperationalInsightsData(selectedMonths, selectedClients, crossFilters)
      setData(insights)
      const hasRows = insights.temporalSeries.length > 0
        || insights.incumplimientosSeries.length > 0
        || insights.volumeSeries.length > 0
        || insights.areaIncidents.length > 0
        || insights.areaPendingTm.length > 0
        || insights.topCauseRows.length > 0
        || insights.topClientRows.length > 0

      setStatus(hasRows ? 'success' : 'empty')
    } catch (caughtError) {
      setStatus('error')
      setError(caughtError as SupabaseErrorInfo)
    }
  }, [crossFilters, selectedClients, selectedMonths])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const toggleCrossFilter = useCallback((filter: OperationalInsightCrossFilter) => {
    setCrossFilters((current) => {
      const existing = current.find((item) => item.key === filter.key && item.value === filter.value)
      if (existing) {
        return current.filter((item) => !(item.key === filter.key && item.value === filter.value))
      }

      return [...current, filter]
    })
  }, [])

  const removeCrossFilter = useCallback((filter: OperationalInsightCrossFilter) => {
    setCrossFilters((current) => current.filter((item) => !(item.key === filter.key && item.value === filter.value)))
  }, [])

  const resetCrossFilters = useCallback(() => {
    setCrossFilters([])
  }, [])

  const hasCrossFilters = crossFilters.length > 0

  return useMemo(() => ({
    data,
    availableClients: data?.availableClients ?? [],
    status,
    error,
    crossFilters,
    toggleCrossFilter,
    removeCrossFilter,
    resetCrossFilters,
    hasCrossFilters,
  }), [crossFilters, data, error, hasCrossFilters, removeCrossFilter, resetCrossFilters, status, toggleCrossFilter])
}
