export function formatTm(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }

  return `${value.toFixed(digits)}%`
}

export function formatShortDate(value: string | null): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(parsed)
}

export function formatMonthLabel(monthKey: string): string {
  const match = monthKey.match(/^(\d{4})-(\d{1,2})$/)

  if (!match) {
    return monthKey
  }

  const parser = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)

  return parser.format(date).replace(/\b\w/, (character) => character.toUpperCase())
}
