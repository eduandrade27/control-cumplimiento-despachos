import logoCarvimsa from '../assets/logo-carvimsa.png'

interface LogoProps {
  collapsed?: boolean
}

export function Logo({ collapsed = false }: LogoProps) {
  return (
    <div className="logo" aria-label="Logo Carvimsa">
      <div className="logo__mark">
        <img className="logo__image" src={logoCarvimsa} alt="Logo Carvimsa" />
      </div>
      {!collapsed && (
        <div className="logo__text">
          <span className="logo__title">Carvimsa</span>
          <span className="logo__subtitle">Control de despacho</span>
        </div>
      )}
    </div>
  )
}
