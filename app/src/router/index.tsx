import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { MainLayout } from '../layout/MainLayout'

const loadLoginPage = () => import('../pages/LoginPage')
const loadOperationalPage = () => import('../pages/OperationalPage')
const loadCommercialPage = () => import('../pages/CommercialPage')
const loadConsultaPage = () => import('../pages/ConsultaPage')
const loadHistoricPage = () => import('../pages/HistoricPage')
const loadCausesAnalysisPage = () => import('../pages/CausesAnalysisPage')
const loadValidationPage = () => import('../pages/ValidationPage')
const loadConfigurationPage = () => import('../pages/ConfigurationPage')

const LoginPage = lazy(async () => ({ default: (await loadLoginPage()).LoginPage }))
const OperationalPage = lazy(async () => ({ default: (await loadOperationalPage()).OperationalPage }))
const CommercialPage = lazy(async () => ({ default: (await loadCommercialPage()).CommercialPage }))
const ConsultaPage = lazy(async () => ({ default: (await loadConsultaPage()).ConsultaPage }))
const HistoricPage = lazy(async () => ({ default: (await loadHistoricPage()).HistoricPage }))
const CausesAnalysisPage = lazy(async () => ({ default: (await loadCausesAnalysisPage()).CausesAnalysisPage }))
const ValidationPage = lazy(async () => ({ default: (await loadValidationPage()).ValidationPage }))
const ConfigurationPage = lazy(async () => ({ default: (await loadConfigurationPage()).ConfigurationPage }))

function withSuspense(element: ReactNode): ReactNode {
  return <Suspense fallback={null}>{element}</Suspense>
}

export function prefetchModuleRoutes(): void {
  void Promise.allSettled([
    loadOperationalPage(),
    loadCommercialPage(),
    loadHistoricPage(),
    loadCausesAnalysisPage(),
    loadConsultaPage(),
  ])
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/operativo" replace />,
          },
          {
            path: 'operativo',
            element: withSuspense(<OperationalPage />),
          },
          {
            path: 'comercial',
            element: withSuspense(<CommercialPage />),
          },
          {
            path: 'consulta',
            element: withSuspense(<ConsultaPage />),
          },
          {
            path: 'historico',
            element: withSuspense(<HistoricPage />),
          },
          {
            path: 'analisis-causas',
            element: withSuspense(<CausesAnalysisPage />),
          },
          {
            path: 'validacion',
            element: withSuspense(<ValidationPage />),
          },
          {
            path: 'configuracion',
            element: <ProtectedRoute requireAdmin>{withSuspense(<ConfigurationPage />)}</ProtectedRoute>,
          },
        ],
      },
    ],
  },
])
