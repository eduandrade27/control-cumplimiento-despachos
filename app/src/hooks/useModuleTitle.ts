import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { getModuleLabel } from '../config/navigation'

export function useModuleTitle() {
  const location = useLocation()

  return useMemo(() => getModuleLabel(location.pathname), [location.pathname])
}
