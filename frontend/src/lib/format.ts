const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const EM_DASH = '—'

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 795.24 → "795 mi", 42.36 → "42.4 mi". */
export function formatMiles(miles: number | null | undefined): string {
  if (!isFiniteNumber(miles)) return EM_DASH
  const digits = Math.abs(miles) >= 100 ? 0 : 1
  return `${miles.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} mi`
}

/** 46800 → "13 h 00 m", 1500 → "25 m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!isFiniteNumber(seconds)) return EM_DASH
  const totalMinutes = Math.round(Math.abs(seconds) / SECONDS_PER_MINUTE)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} m`
  return `${hours} h ${String(minutes).padStart(2, '0')} m`
}

/** Time difference vs the fastest route: 0 → "Fastest", 1260 → "+21 m". */
export function formatDelta(seconds: number): string {
  if (Math.round(seconds / SECONDS_PER_MINUTE) === 0) return 'Fastest'
  const sign = seconds > 0 ? '+' : '−'
  return `${sign}${formatDuration(seconds)}`
}

/** Absolute local date-time for an ISO string: "Fri 7 Nov, 08:00". */
export function formatDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return EM_DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EM_DASH
  return date.toLocaleString(locale ?? 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Value with unit, or an em dash when the forecast has no value. */
export function formatMeasure(value: number | null | undefined, unit: string, digits = 0): string {
  if (!isFiniteNumber(value)) return EM_DASH
  return `${value.toFixed(digits)} ${unit}`
}

export function formatPounds(pounds: number): string {
  return `${pounds.toLocaleString('en-US')} lb`
}

export function hoursToSeconds(hours: number): number {
  return hours * SECONDS_PER_HOUR
}
