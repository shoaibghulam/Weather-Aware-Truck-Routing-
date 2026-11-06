import { LEVELS, type LevelKey } from '../../lib/risk'
import { readToken } from '../../lib/tokens'

export type RiskPalette = Record<LevelKey, string>

/** Literal colours for map paint properties, read from the --risk-* tokens. */
export function readRiskPalette(read: (name: string) => string = readToken): RiskPalette {
  return Object.fromEntries(LEVELS.map((m) => [m.key, read(m.token)])) as RiskPalette
}

/** '#2a9d8f' + 0.35 → 'rgba(42,157,143,0.35)'. Non-hex input is returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!match?.[1]) return color
  const n = parseInt(match[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
