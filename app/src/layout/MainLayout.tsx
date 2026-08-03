import { useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { PageHeader } from '../components/PageHeader'
import { navigationItems, getModuleLabel } from '../config/navigation'

export function MainLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const currentTitle = useMemo(() => getModuleLabel(location.pathname), [location.pathname])

  return (
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
