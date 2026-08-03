import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Logo } from './Logo'
import type { NavigationItem } from '../types/app'

interface SidebarProps {
  items: NavigationItem[]
  activePath: string
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ items, activePath, collapsed, onToggle }: SidebarProps) {
  const { isAdmin } = useAuth()
  const visibleItems = items.filter((item) => item.key !== 'validacion')
  const dashboardOrder = ['operativo', 'comercial', 'historico', 'analisis_causas'] as const
  const dashboardItems = dashboardOrder
    .map((key) => visibleItems.find((item) => item.key === key))
    .filter((item): item is NavigationItem => Boolean(item))
  const consultaItems = visibleItems.filter((item) => item.key === 'consulta')
  const configItems = visibleItems.filter((item) => item.key === 'configuracion' && isAdmin)

  const renderItems = (sectionItems: NavigationItem[]) => sectionItems.map((item) => {
    const isActive = activePath === item.path

    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive: isNavActive }) =>
          `sidebar__item ${isActive || isNavActive ? 'is-active' : ''}`
        }
      >
        <span className="sidebar__item-dot" />
        {!collapsed && <span className="sidebar__item-label">{item.label}</span>}
      </NavLink>
    )
  })

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar__header">
        <Logo collapsed={collapsed} />
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <div className="sidebar__section">
        <p className="sidebar__label">Dashboards</p>
        <nav className="sidebar__nav" aria-label="Navegación principal">
          {renderItems(dashboardItems)}
        </nav>
      </div>

      {consultaItems.length > 0 && (
        <div className="sidebar__section">
          <p className="sidebar__label">Consulta</p>
          <nav className="sidebar__nav" aria-label="Navegación de consulta">
            {renderItems(consultaItems)}
          </nav>
        </div>
      )}

      {configItems.length > 0 && (
        <div className="sidebar__section">
          <p className="sidebar__label">Administración</p>
          <nav className="sidebar__nav" aria-label="Navegación de administración">
            {renderItems(configItems)}
          </nav>
        </div>
      )}
    </aside>
  )
}
