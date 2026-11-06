import { describe, expect, it } from 'vitest'
import { toLocalInputValue } from '../../lib/datetime'
import { validateDeparture, validateLoad, validateTrip, type TripFormValues } from './validation'

const NOW = new Date(2026, 10, 7, 8, 0, 0)
const dallas = { label: 'Dallas, TX', lat: 32.77, lon: -96.79 }
const denver = { label: 'Denver, CO', lat: 39.74, lon: -104.99 }

function values(overrides: Partial<TripFormValues> = {}): TripFormValues {
  return { origin: dallas, destination: denver, departure: '2026-11-07T09:00', load: '36000', interval: 25, ...overrides }
}

describe('validateLoad', () => {
  it.each(['1', '80000', ' 36000 '])('accepts %s', (v) => expect(validateLoad(v)).toBeUndefined())
  it.each([
    ['', /Enter/],
    ['0', /between 1 and 80,000/],
    ['80001', /between/],
    ['12.5', /whole number/],
    ['-5', /whole number/],
    ['abc', /whole number/],
  ])('rejects %j', (v, msg) => expect(validateLoad(v)).toMatch(msg))
})

describe('validateDeparture', () => {
  it('accepts up to 1 hour in the past', () => {
    expect(validateDeparture('2026-11-07T07:00', NOW)).toBeUndefined()
  })
  it('rejects more than 1 hour in the past', () => {
    expect(validateDeparture('2026-11-07T06:59', NOW)).toMatch(/past/)
  })
  it('accepts exactly 14 days ahead and rejects beyond', () => {
    expect(validateDeparture(toLocalInputValue(new Date(2026, 10, 21, 8, 0)), NOW)).toBeUndefined()
    expect(validateDeparture(toLocalInputValue(new Date(2026, 10, 21, 8, 1)), NOW)).toMatch(/14 days/)
  })
  it('rejects malformed input', () => {
    expect(validateDeparture('', NOW)).toMatch(/valid/)
  })
})

describe('validateTrip', () => {
  it('builds the API request with an offset ISO departure', () => {
    const result = validateTrip(values({ interval: 10 }), NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request).toMatchObject({ origin: dallas, destination: denver, load_lb: 36000, interval_mi: 10 })
    expect(result.request.departure).toMatch(/^2026-11-07T09:00:00[+-]\d{2}:\d{2}$/)
  })

  it('requires places chosen from suggestions', () => {
    const result = validateTrip(values({ origin: null, destination: null }), NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.origin).toBeDefined()
    expect(result.errors.destination).toBeDefined()
  })

  it('rejects identical origin and destination', () => {
    const result = validateTrip(values({ destination: { ...dallas } }), NOW)
    expect(result.ok ? null : result.errors.destination).toMatch(/differ/)
  })

  it('collects every field error at once', () => {
    const result = validateTrip(values({ load: '0', departure: 'x', interval: 30 as never }), NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual(['departure', 'interval', 'load'])
  })
})
