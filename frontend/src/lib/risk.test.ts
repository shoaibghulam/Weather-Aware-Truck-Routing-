import { afterEach, describe, expect, it } from 'vitest'
import { LEVELS, levelKey, levelLabel, levelMeta, levelOnDark } from './risk'
import { readToken } from './tokens'

describe('risk levels', () => {
  it('maps null to "No forecast", never to Low', () => {
    expect(levelKey(null)).toBe('NONE')
    expect(levelLabel(null)).toBe('No forecast')
    expect(levelLabel(undefined)).toBe('No forecast')
  })
  it('labels every API level', () => {
    expect(levelLabel('LOW')).toBe('Low')
    expect(levelLabel('NO_TRAVEL')).toBe('No Travel')
    expect(levelMeta('SEVERE').token).toBe('--risk-severe')
  })
  it('orders scores from low to no travel', () => {
    const scores = LEVELS.filter((l) => l.key !== 'NONE').map((l) => l.score)
    expect(scores).toEqual([0, 1, 2, 3, 4])
  })
  it('uses light text only on the dark swatches', () => {
    expect(levelOnDark('SEVERE')).toBe(true)
    expect(levelOnDark('NO_TRAVEL')).toBe(true)
    expect(levelOnDark('MODERATE')).toBe(false)
    expect(levelOnDark(null)).toBe(false)
  })
})

describe('readToken', () => {
  afterEach(() => document.documentElement.style.removeProperty('--risk-low'))

  it('reads a CSS custom property from :root', () => {
    document.documentElement.style.setProperty('--risk-low', ' teal ')
    expect(readToken('--risk-low')).toBe('teal')
  })
  it('falls back when the token is missing', () => {
    expect(readToken('--does-not-exist', 'red')).toBe('red')
  })
})
