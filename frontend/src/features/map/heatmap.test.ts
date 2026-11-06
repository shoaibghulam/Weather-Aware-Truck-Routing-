import { describe, expect, it } from 'vitest'
import type { LonLat } from '../../api/types'
import { capPoints, clampHour, displayHour, heatmapColorExpression, heatmapWeightExpression } from './heatmap'
import type { RiskPalette } from './riskPalette'

const palette: RiskPalette = {
  LOW: '#2a9d8f',
  MODERATE: 'gold',
  HIGH: 'orange',
  SEVERE: 'red',
  NO_TRAVEL: 'purple',
  NONE: 'gray',
}

describe('heatmapWeightExpression', () => {
  it('reads the hN property for a whole hour and maps 0–4 to 0–1', () => {
    expect(heatmapWeightExpression(6)).toEqual(['interpolate', ['linear'], ['coalesce', ['get', 'h6'], 0], 0, 0, 4, 1])
  })

  it('covers both ends of the 0–48 slider', () => {
    expect(JSON.stringify(heatmapWeightExpression(0))).toContain('"h0"')
    expect(JSON.stringify(heatmapWeightExpression(48))).toContain('"h48"')
  })

  it('clamps out-of-range hours instead of reading missing properties', () => {
    expect(heatmapWeightExpression(-3)).toEqual(heatmapWeightExpression(0))
    expect(heatmapWeightExpression(99)).toEqual(heatmapWeightExpression(48))
  })

  it('blends neighbouring hours for fractional playback positions', () => {
    const expr = heatmapWeightExpression(6.25)
    expect(expr[2]).toEqual([
      '+',
      ['*', ['coalesce', ['get', 'h6'], 0], 0.75],
      ['*', ['coalesce', ['get', 'h7'], 0], 0.25],
    ])
  })
})

describe('heatmapColorExpression', () => {
  it('is transparent at zero density and ends at No Travel', () => {
    const expr = heatmapColorExpression(palette)
    expect(expr.slice(0, 5)).toEqual(['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)'])
    expect(expr.at(-1)).toBe('purple')
  })

  it('places Moderate/High/Severe at scores 1/2/3 and a visible Low band below 1', () => {
    const expr = heatmapColorExpression(palette) as unknown[]
    const stopFor = (color: string) => expr[expr.indexOf(color) - 1]
    expect(stopFor('gold')).toBe(0.25)
    expect(stopFor('orange')).toBe(0.5)
    expect(stopFor('red')).toBe(0.75)
    expect(expr.slice(5, 9)).toEqual([0.025, 'rgba(42,157,143,0.3)', 0.15, 'rgba(42,157,143,0.6)'])
  })
})

describe('hour helpers', () => {
  it('clamps and floors hours', () => {
    expect(clampHour(Number.NaN)).toBe(0)
    expect(clampHour(12.5)).toBe(12.5)
    expect(displayHour(12.9)).toBe(12)
    expect(displayHour(60)).toBe(48)
  })
})

describe('capPoints', () => {
  const line = (n: number): LonLat[] => Array.from({ length: n }, (_, i) => [i, 0])

  it('returns a copy when under the cap', () => {
    const pts = line(3)
    const out = capPoints(pts, 400)
    expect(out).toEqual(pts)
    expect(out).not.toBe(pts)
  })

  it('thins evenly to the cap, keeping both ends', () => {
    const out = capPoints(line(1000), 400)
    expect(out).toHaveLength(400)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([999, 0])
  })

  it('handles degenerate caps', () => {
    expect(capPoints(line(5), 1)).toEqual([[0, 0]])
    expect(capPoints(line(5), 0)).toEqual([])
  })
})
