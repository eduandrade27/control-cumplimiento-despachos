import { Tooltip } from '../Tooltip'

interface KpiCardProps {
  title: string
  value: string
  hint: string
  isHighlighted?: boolean
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

export function KpiCard({ title, value, hint, isHighlighted = false, tone = 'default' }: KpiCardProps) {
  return (
    <Tooltip content={hint}>
      <article
        className={`kpi-card${isHighlighted ? ' kpi-card--highlight' : ''}${tone !== 'default' ? ` kpi-card--${tone}` : ''}`}
      >
        <div className="kpi-card__title">{title}</div>
        <div className="kpi-card__value">{value}</div>
        <div className="kpi-card__hint">{hint}</div>
      </article>
    </Tooltip>
  )
}
