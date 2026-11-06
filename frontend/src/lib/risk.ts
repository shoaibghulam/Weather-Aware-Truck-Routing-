import type { RiskLevel } from '../api/types'

/** A level as the UI sees it: the five API levels plus "no forecast" (API null). */
export type LevelKey = RiskLevel | 'NONE'

export interface LevelMeta {
  key: LevelKey
  label: string
  /** CSS custom property holding the colour (defined once in tokens.css). */
  token: string
  /** Tailwind background utility bound to the same token. */
  bgClass: string
  /** Ordinal used for sizing / sorting. -1 for no forecast. */
  score: number
}

export const LEVELS: readonly LevelMeta[] = [
  { key: 'LOW', label: 'Low', token: '--risk-low', bgClass: 'bg-risk-low', score: 0 },
  { key: 'MODERATE', label: 'Moderate', token: '--risk-moderate', bgClass: 'bg-risk-moderate', score: 1 },
  { key: 'HIGH', label: 'High', token: '--risk-high', bgClass: 'bg-risk-high', score: 2 },
  { key: 'SEVERE', label: 'Severe', token: '--risk-severe', bgClass: 'bg-risk-severe', score: 3 },
  { key: 'NO_TRAVEL', label: 'No Travel', token: '--risk-no-travel', bgClass: 'bg-risk-no-travel', score: 4 },
  { key: 'NONE', label: 'No forecast', token: '--risk-none', bgClass: 'bg-risk-none', score: -1 },
]

const BY_KEY = new Map<LevelKey, LevelMeta>(LEVELS.map((m) => [m.key, m]))

export function levelKey(level: RiskLevel | null | undefined): LevelKey {
  return level ?? 'NONE'
}

export function levelMeta(level: RiskLevel | null | undefined): LevelMeta {
  // Every LevelKey is in the table, so the lookup cannot miss.
  return BY_KEY.get(levelKey(level)) as LevelMeta
}

export function levelLabel(level: RiskLevel | null | undefined): string {
  return levelMeta(level).label
}

/** Text colour that stays legible on top of each risk swatch. */
export function levelOnDark(level: RiskLevel | null | undefined): boolean {
  const key = levelKey(level)
  return key === 'SEVERE' || key === 'NO_TRAVEL'
}
