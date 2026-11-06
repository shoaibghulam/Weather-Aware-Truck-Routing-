import type { ExpressionSpecification } from 'maplibre-gl'
import { HEATMAP_MAX_POINTS, type LonLat } from '../../api/types'
import { withAlpha, type RiskPalette } from './riskPalette'

export const HEATMAP_LAYER_ID = 'corridor-heatmap'
export const HEATMAP_SOURCE_ID = 'corridor-heatmap-src'
export const HEATMAP_MAX_HOUR = 48
/** Risk scores run 0 (low / no forecast) … 4 (no travel). */
export const RISK_SCORE_MAX = 4

export function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0
  return Math.min(HEATMAP_MAX_HOUR, Math.max(0, hour))
}

function hourValue(hour: number): ExpressionSpecification {
  return ['coalesce', ['get', `h${hour}`], 0]
}

/**
 * The paint expression for `heatmap-weight` at a given hour from departure.
 * Integer hours read one property (`hN`). Fractional hours (used by smooth
 * playback) blend the two neighbouring hours linearly, so the GPU animates a
 * continuous field while the data stays untouched.
 */
export function heatmapWeightExpression(hour: number): ExpressionSpecification {
  const h = clampHour(hour)
  const lower = Math.floor(h)
  const t = h - lower
  const value: ExpressionSpecification =
    t < 1e-3 || lower === HEATMAP_MAX_HOUR
      ? hourValue(lower)
      : ['+', ['*', hourValue(lower), 1 - t], ['*', hourValue(lower + 1), t]]
  return ['interpolate', ['linear'], value, 0, 0, RISK_SCORE_MAX, 1]
}

/**
 * Density → colour ramp. Weight is score / 4, so with intensity ≈ 1 the density
 * stops line up with the risk scale: 0 transparent, Low a visible tint that
 * deepens through the Low band, 1 Moderate, 2 High, 3 Severe, 4 No Travel.
 * Low stays clearly visible so calm-but-breezy corridors read as "covered,
 * low risk" rather than as missing data.
 */
export function heatmapColorExpression(palette: RiskPalette): ExpressionSpecification {
  const stop = (score: number) => score / RISK_SCORE_MAX
  return [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(0,0,0,0)',
    stop(0.1),
    withAlpha(palette.LOW, 0.3),
    stop(0.6),
    withAlpha(palette.LOW, 0.6),
    stop(1),
    palette.MODERATE,
    stop(2),
    palette.HIGH,
    stop(3),
    palette.SEVERE,
    stop(4),
    palette.NO_TRAVEL,
  ]
}

/** Thin a corridor evenly to the API's point cap, keeping the first and last point. */
export function capPoints(points: readonly LonLat[], max: number = HEATMAP_MAX_POINTS): LonLat[] {
  if (points.length <= max) return [...points]
  if (max <= 1) return points.slice(0, Math.max(0, max))
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)] as LonLat)
}

/** Whole hour shown on the slider for a (possibly fractional) playback position. */
export function displayHour(hour: number): number {
  return Math.floor(clampHour(hour))
}
