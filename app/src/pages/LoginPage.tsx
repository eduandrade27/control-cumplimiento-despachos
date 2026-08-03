import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { signInWithEmailPassword } from '../services/authService'

export function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/operativo', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    const { data, error } = await signInWithEmailPassword(email.trim(), password)

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    if (data.session) {
      navigate('/operativo', { replace: true })
    } else {
      setErrorMessage('No se pudo iniciar sesión. Intente nuevamente.')
    }

    setIsSubmitting(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Control de Cumplimiento de Despachos</h1>
        <p>Ingrese sus credenciales para continuar.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Correo electrónico</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="login-field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {errorMessage ? <p className="login-error">{errorMessage}</p> : null}

          <button type="submit" className="login-button" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
