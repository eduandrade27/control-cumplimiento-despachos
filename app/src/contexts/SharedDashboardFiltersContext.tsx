import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

export interface SharedTemporalFiltersControls {
  selectedYear: number | null
  selectedMonths: string[]
  setSelectedYear: Dispatch<SetStateAction<number | null>>
  setSelectedMonths: Dispatch<SetStateAction<string[]>>
}

interface SharedDashboardFiltersContextValue extends SharedTemporalFiltersControls {
  selectedClients: string[]
  setSelectedClients: Dispatch<SetStateAction<string[]>>
}

const SharedDashboardFiltersContext = createContext<SharedDashboardFiltersContextValue | null>(null)

export function SharedDashboardFiltersProvider({ children }: { children: ReactNode }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])

  const value = useMemo<SharedDashboardFiltersContextValue>(() => ({
    selectedYear,
    selectedMonths,
    setSelectedYear,
    setSelectedMonths,
    selectedClients,
    setSelectedClients,
  }), [selectedClients, selectedMonths, selectedYear])

  return (
    <SharedDashboardFiltersContext.Provider value={value}>
      {children}
    </SharedDashboardFiltersContext.Provider>
  )
}

export function useSharedDashboardFilters(): SharedDashboardFiltersContextValue {
  const context = useContext(SharedDashboardFiltersContext)

  if (!context) {
    throw new Error('useSharedDashboardFilters must be used within SharedDashboardFiltersProvider.')
  }

  return context
}