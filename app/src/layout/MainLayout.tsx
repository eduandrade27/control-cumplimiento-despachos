import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { PageHeader } from '../components/PageHeader'
import { navigationItems, getModuleLabel } from '../config/navigation'
import { SharedDashboardFiltersProvider } from '../contexts/SharedDashboardFiltersContext'

const CausesAnalysisPage = lazy(async () => ({
  default: (await import('../pages/CausesAnalysisPage')).CausesAnalysisPage,
}))

export function MainLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const isCausesRoute = location.pathname === '/analisis-causas'
  const [hasMountedCauses, setHasMountedCauses] = useState(isCausesRoute)

  useEffect(() => {
    if (isCausesRoute) {
      setHasMountedCauses(true)
    }
  }, [isCausesRoute])

  const shouldRenderCauses = hasMountedCauses || isCausesRoute

  const currentTitle = useMemo(() => getModuleLabel(location.pathname), [location.pathname])

  return (
    <SharedDashboardFiltersProvider>
      <div className="app-shell">
        <Sidebar
          items={navigationItems}
          activePath={location.pathname}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />

        <div className="main-panel">
          <PageHeader title={currentTitle} />
          <main className="content-area">
            {!isCausesRoute && <Outlet />}

            {shouldRenderCauses && (
              <div style={{ display: isCausesRoute ? 'contents' : 'none' }}>
                <Suspense fallback={null}>
                  <CausesAnalysisPage />
                </Suspense>
              </div>
            )}
          </main>
        </div>
      </div>
    </SharedDashboardFiltersProvider>
  )
}
