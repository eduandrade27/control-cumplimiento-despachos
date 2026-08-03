import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { prefetchModuleRoutes, router } from './router'
import './styles/global.css'
import './styles/auth.css'

function App() {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      prefetchModuleRoutes()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
