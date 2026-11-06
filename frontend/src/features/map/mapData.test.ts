import { describe, expect, it } from 'vitest'
import { makePlan, makeRoute } from '../../test/fixtures'
import { checkpointsToGeoJson, findCheckpoint, routesBounds, routesToGeoJson } from './geojson'
import { CHECKPOINT_LAYER_ID, ROUTE_HIT_LAYER_ID, checkpointLayer, heatmapLayer, INTERACTIVE_LAYER_IDS, routeCasingLayer, routeLineLayer } from './layerSpecs'
import { readRiskPalette, withAlpha } from './riskPalette'
import { HEATMAP_LAYER_ID, heatmapWeightExpression } from './heatmap'

const plan = makePlan()
const palette = readRiskPalette((name) => `color(${name})`)
const colors = { recommended: 'blue', alternative: 'gray', casing: 'white' }

describe('geojson builders', () => {
  it('turns routes into line features carrying id and recommendation', () => {
    const fc = routesToGeoJson(plan.routes)
    expect(fc.features).toHaveLength(3)
    expect(fc.features[0]?.properties).toEqual({ id: 'r0', name: 'Route A', rank: 1, recommended: true })
  })

  it('flattens checkpoints with level keys, mapping null to NONE', () => {
    const fc = checkpointsToGeoJson([makeRoute()])
    expect(fc.features.map((f) => f.properties.level)).toEqual(['LOW', 'MODERATE', 'NONE'])
    expect(fc.features[2]?.properties.score).toBe(-1)
    expect(fc.features[1]?.geometry.coordinates).toEqual([-97, 33])
  })

  it('computes bounds over all route vertices', () => {
    expect(routesBounds(plan.routes)).toEqual([-99, 32, -97, 34])
    expect(routesBounds([])).toBeNull()
  })

  it('finds a checkpoint from feature properties', () => {
    expect(findCheckpoint(plan.routes, 'r1', 1)?.route.name).toBe('Route B')
    expect(findCheckpoint(plan.routes, 'r1', 99)).toBeNull()
    expect(findCheckpoint(plan.routes, 'nope', 0)).toBeNull()
    expect(findCheckpoint(plan.routes, 1, '0')).toBeNull()
  })
})

describe('layer specs', () => {
  const emphasis = { selectedId: 'r1', hoveredId: null }

  it('emphasises the selected or hovered route in width and draw order', () => {
    const line = routeLineLayer(emphasis, colors)
    const json = JSON.stringify(line)
    expect(json).toContain('"r1"')
    expect(json).toContain('"blue"')
    expect(routeCasingLayer(emphasis, colors).id).toBe('route-casing')
  })

  it('colours checkpoints by level with No forecast as the fallback', () => {
    const layer = checkpointLayer(emphasis, palette, 'white')
    expect(layer.id).toBe(CHECKPOINT_LAYER_ID)
    const json = JSON.stringify(layer)
    expect(json).toContain('color(--risk-severe)')
    expect(json).toContain('color(--risk-none)')
  })

  it('starts the heatmap at hour 0 and keeps its id stable', () => {
    const layer = heatmapLayer(palette)
    expect(layer.id).toBe(HEATMAP_LAYER_ID)
    expect((layer as { paint: Record<string, unknown> }).paint['heatmap-weight']).toEqual(heatmapWeightExpression(0))
  })

  it('only routes and checkpoints are interactive', () => {
    expect(INTERACTIVE_LAYER_IDS).toEqual([CHECKPOINT_LAYER_ID, ROUTE_HIT_LAYER_ID])
  })
})

describe('riskPalette', () => {
  it('reads one token per level', () => {
    expect(palette.LOW).toBe('color(--risk-low)')
    expect(Object.keys(palette)).toHaveLength(6)
  })
  it('adds alpha to hex colours only', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)')
    expect(withAlpha('red', 0.5)).toBe('red')
  })
})
