import type { PlannedRoute, RouteSummary } from '../../api/types'
import type { LevelKey } from '../../lib/risk'

export interface LevelSegment {
  key: LevelKey
  miles: number
  /** Share of the route length, 0–100. */
  percent: number
}

const SUMMARY_FIELD: Record<LevelKey, keyof RouteSummary> = {
  LOW: 'low_mi',
  MODERATE: 'moderate_mi',
  HIGH: 'high_mi',
  SEVERE: 'severe_mi',
  NO_TRAVEL: 'no_travel_mi',
  NONE: 'no_forecast_mi',
}

const SEGMENT_ORDER: readonly LevelKey[] = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL', 'NONE']

/** Miles per level as bar segments; zero-mile levels are dropped. */
export function levelSegments(summary: RouteSummary): LevelSegment[] {
  const miles = SEGMENT_ORDER.map((key) => ({ key, miles: Number(summary[SUMMARY_FIELD[key]]) || 0 }))
  const total = miles.reduce((sum, s) => sum + s.miles, 0)
  if (total <= 0) return []
  return miles.filter((s) => s.miles > 0).map((s) => ({ ...s, percent: (s.miles / total) * 100 }))
}

export function fastestDuration(routes: readonly PlannedRoute[]): number {
  return routes.reduce((min, r) => Math.min(min, r.summary.duration_s), Number.POSITIVE_INFINITY)
}

export interface RouteBadge {
  label: string
  tone: 'accent' | 'neutral' | 'warn'
}

export function routeBadges(route: PlannedRoute): RouteBadge[] {
  const badges: RouteBadge[] = []
  if (route.recommended) badges.push({ label: 'Recommended', tone: 'accent' })
  if (route.source === 'via-point') badges.push({ label: 'Via-point', tone: 'neutral' })
  if (route.summary.no_forecast_mi > 0) badges.push({ label: 'Has no-forecast miles', tone: 'warn' })
  return badges
}
