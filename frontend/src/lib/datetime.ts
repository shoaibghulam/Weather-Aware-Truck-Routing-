const MS_PER_HOUR = 3_600_000

function pad(n: number): string {
  return String(Math.trunc(Math.abs(n))).padStart(2, '0')
}

/** Value for <input type="datetime-local"> in the browser's zone: "2026-11-07T08:00". */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** The next full hour after `now` (08:00 stays 09:00 so the default is never in the past). */
export function nextFullHour(now: Date = new Date()): Date {
  const next = new Date(now.getTime())
  next.setMinutes(0, 0, 0)
  next.setHours(next.getHours() + 1)
  return next
}

/** Parse a datetime-local value as local time. Returns null when malformed. */
export function parseLocalInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
  return Number.isNaN(date.getTime()) ? null : date
}

/** ISO-8601 with the browser's UTC offset: "2026-11-07T08:00:00-06:00". */
export function toIsoWithOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const offset = `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`
  return `${toLocalInputValue(date)}:${pad(date.getSeconds())}${offset}`
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * MS_PER_HOUR)
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR
}
