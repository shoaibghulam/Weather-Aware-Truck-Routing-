import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDelta, formatDuration, formatMeasure, formatMiles, formatPounds, hoursToSeconds } from './format'

describe('formatMiles', () => {
  it('uses one decimal under 100 miles and none above', () => {
    expect(formatMiles(42.36)).toBe('42.4 mi')
    expect(formatMiles(795.24)).toBe('795 mi')
    expect(formatMiles(1234.5)).toBe('1,235 mi')
  })
  it('shows an em dash for missing values', () => {
    expect(formatMiles(null)).toBe('—')
    expect(formatMiles(Number.NaN)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('formats hours and zero-padded minutes', () => {
    expect(formatDuration(46800)).toBe('13 h 00 m')
    expect(formatDuration(3660)).toBe('1 h 01 m')
  })
  it('formats sub-hour durations as minutes only', () => {
    expect(formatDuration(1500)).toBe('25 m')
  })
  it('handles missing values', () => {
    expect(formatDuration(undefined)).toBe('—')
  })
})

describe('formatDelta', () => {
  it('labels the fastest route', () => {
    expect(formatDelta(0)).toBe('Fastest')
    expect(formatDelta(20)).toBe('Fastest')
  })
  it('signs the difference', () => {
    expect(formatDelta(1260)).toBe('+21 m')
    expect(formatDelta(-3600)).toBe('−1 h 00 m')
  })
})

describe('formatDateTime', () => {
  it('formats a valid ISO string in local time', () => {
    const out = formatDateTime('2026-11-07T08:00:00Z', 'en-GB')
    expect(out).toMatch(/Nov/)
    expect(out).toMatch(/\d{2}:\d{2}/)
  })
  it('returns an em dash for empty or invalid input', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('not a date')).toBe('—')
  })
})

describe('formatMeasure', () => {
  it('formats with unit and digits', () => {
    expect(formatMeasure(0.123, 'in/hr', 2)).toBe('0.12 in/hr')
    expect(formatMeasure(27.6, 'mph')).toBe('28 mph')
  })
  it('never invents a value for null', () => {
    expect(formatMeasure(null, 'mph')).toBe('—')
  })
})

describe('misc', () => {
  it('formats pounds and converts hours', () => {
    expect(formatPounds(36000)).toBe('36,000 lb')
    expect(hoursToSeconds(2)).toBe(7200)
  })
})
