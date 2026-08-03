import type { ModuleKey, NavigationItem } from '../types/app'

export const navigationItems: NavigationItem[] = [
  {
    key: 'operativo',
    label: 'Operativo',
    path: '/operativo',
    description: 'Supervisión operativa',
  },
  {
    key: 'comercial',
    label: 'Comercial',
    path: '/comercial',
    description: 'Seguimiento comercial',
  },
  {
    key: 'consulta',
    label: 'Consulta de Pedidos',
    path: '/consulta',
    description: 'Consulta de pedidos',
  },
  {
    key: 'historico',
    label: 'Histórico',
    path: '/historico',
    description: 'Historico de despachos',
  },
  {
    key: 'analisis_causas',
    label: 'Análisis de Causas',
    path: '/analisis-causas',
    description: 'Análisis de causas operativas',
  },
  {
    key: 'validacion',
    label: 'Validación',
    path: '/validacion',
    description: 'Validación de procesos',
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    path: '/configuracion',
    description: 'Parámetros del sistema',
  },
]

const moduleLabels: Record<ModuleKey, string> = {
  operativo: 'Operativo',
  comercial: 'Comercial',
  analisis_causas: 'Análisis de Causas',
  consulta: 'Consulta de Pedidos',
  historico: 'Histórico',
  validacion: 'Validación',
  configuracion: 'Configuración',
}

export const getModuleLabel = (path: string): string => {
  const item = navigationItems.find((navItem) => navItem.path === path)

  if (item) {
    return item.label
  }

  if (path === '/') {
    return moduleLabels.operativo
  }

  return 'Panel principal'
}
