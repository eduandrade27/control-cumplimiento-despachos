import type { AvailableMonthOption } from '../types/operational'

interface GlobalYearFilterProps {
  availableYears: number[]
  selectedYear: number | null
  onYearChange: (year: number) => void
}

interface GlobalMonthFilterProps {
  availableMonths: AvailableMonthOption[]
  selectedMonths: string[]
  onToggleMonth: (monthKey: string) => void
}

function formatShortMonthLabel(month: AvailableMonthOption): string {
  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
  return monthLabels[month.month - 1] ?? String(month.month)
}

export function GlobalYearFilter({
  availableYears,
  selectedYear,
  onYearChange,
}: GlobalYearFilterProps) {
  return (
    <div className="operational-page__control-group">
      <span className="operational-page__label">Año</span>
      <select
        className="operational-page__year-select"
        value={selectedYear ?? ''}
        onChange={(event) => {
          const value = Number(event.target.value)
          if (!Number.isNaN(value)) {
            onYearChange(value)
          }
        }}
        aria-label="Seleccionar año"
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}

export function GlobalMonthFilter({
  availableMonths,
  selectedMonths,
  onToggleMonth,
}: GlobalMonthFilterProps) {
  return (
    <div className="operational-page__control-group operational-page__control-group--month">
      <span className="operational-page__label">Mes</span>
      <div className="operational-page__chip-list operational-page__chip-list--month" role="list">
        {availableMonths.map((month) => {
          const isActive = selectedMonths.includes(month.value)
          return (
            <button
              key={month.value}
              type="button"
              className={`operational-page__chip operational-page__chip--month${isActive ? ' is-active' : ''}`}
              onClick={() => onToggleMonth(month.value)}
            >
              {formatShortMonthLabel(month)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
