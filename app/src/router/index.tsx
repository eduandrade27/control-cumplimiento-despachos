import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { MainLayout } from '../layout/MainLayout'
import { LoginPage } from '../pages/LoginPage'
import { OperationalPage } from '../pages/OperationalPage'
import { CommercialPage } from '../pages/CommercialPage'
import { ConsultaPage } from '../pages/ConsultaPage'
import { HistoricPage } from '../pages/HistoricPage'
import { CausesAnalysisPage } from '../pages/CausesAnalysisPage'
import { ValidationPage } from '../pages/ValidationPage'
import { ConfigurationPage } from '../pages/ConfigurationPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
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
            element: <OperationalPage />,
          },
          {
            path: 'comercial',
            element: <CommercialPage />,
          },
          {
            path: 'consulta',
            element: <ConsultaPage />,
          },
          {
            path: 'historico',
            element: <HistoricPage />,
          },
          {
            path: 'analisis-causas',
            element: <CausesAnalysisPage />,
          },
          {
            path: 'validacion',
            element: <ValidationPage />,
          },
          {
            path: 'configuracion',
            element: <ProtectedRoute requireAdmin><ConfigurationPage /></ProtectedRoute>,
          },
        ],
      },
    ],
  },
])
