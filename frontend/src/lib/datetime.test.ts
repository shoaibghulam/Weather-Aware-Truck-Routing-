import { describe, expect, it } from 'vitest'
import { addHours, hoursBetween, nextFullHour, parseLocalInput, toIsoWithOffset, toLocalInputValue } from './datetime'

describe('nextFullHour', () => {
  it('rounds up to the next hour', () => {
    const d = nextFullHour(new Date(2026, 10, 7, 8, 25, 13))
    expect(toLocalInputValue(d)).toBe('2026-11-07T09:00')
  })
  it('moves an exact hour forward so the default is never now', () => {
    expect(toLocalInputValue(nextFullHour(new Date(2026, 10, 7, 8, 0, 0)))).toBe('2026-11-07T09:00')
  })
  it('rolls over midnight', () => {
    expect(toLocalInputValue(nextFullHour(new Date(2026, 10, 7, 23, 30)))).toBe('2026-11-08T00:00')
  })
})

describe('parseLocalInput', () => {
  it('parses datetime-local values as local time', () => {
    const d = parseLocalInput('2026-11-07T08:30')
    expect(d?.getHours()).toBe(8)
    expect(d?.getMinutes()).toBe(30)
  })
  it('accepts seconds', () => {
    expect(parseLocalInput('2026-11-07T08:30:15')?.getSeconds()).toBe(15)
  })
  it('rejects malformed input', () => {
    expect(parseLocalInput('')).toBeNull()
    expect(parseLocalInput('07/11/2026 08:00')).toBeNull()
  })
})

describe('toIsoWithOffset', () => {
  it('emits ISO-8601 with the browser offset that round-trips to the same instant', () => {
    const d = new Date(2026, 10, 7, 8, 0, 0)
    const iso = toIsoWithOffset(d)
    expect(iso).toMatch(/^2026-11-07T08:00:00[+-]\d{2}:\d{2}$/)
    expect(new Date(iso).getTime()).toBe(d.getTime())
  })
})

describe('hour arithmetic', () => {
  it('adds and measures hours', () => {
    const a = new Date('2026-11-07T00:00:00Z')
    const b = addHours(a, 6)
    expect(b.toISOString()).toBe('2026-11-07T06:00:00.000Z')
    expect(hoursBetween(a, b)).toBe(6)
  })
})
