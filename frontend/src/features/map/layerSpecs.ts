import type { ExpressionSpecification } from 'maplibre-gl'
import type { LayerProps } from 'react-map-gl/maplibre'
import { HEATMAP_LAYER_ID, heatmapColorExpression, heatmapWeightExpression } from './heatmap'
import type { RiskPalette } from './riskPalette'

/**
 * Pure builders for every MapLibre layer. They are memoised by the caller so
 * react-map-gl only diffs (and calls setPaintProperty) when an input changes.
 */
export const ROUTE_SOURCE_ID = 'routes-src'
export const CHECKPOINT_SOURCE_ID = 'checkpoints-src'
export const ROUTE_CASING_LAYER_ID = 'route-casing'
export const ROUTE_LINE_LAYER_ID = 'route-line'
export const ROUTE_HIT_LAYER_ID = 'route-hit'
export const CHECKPOINT_LAYER_ID = 'checkpoints'
export const INTERACTIVE_LAYER_IDS = [CHECKPOINT_LAYER_ID, ROUTE_HIT_LAYER_ID]

export interface RouteColors {
  recommended: string
  alternative: string
  casing: string
}

export interface Emphasis {
  /** Route that is selected (click / panel). */
  selectedId: string | null
  /** Route under the pointer or keyboard focus; previews emphasis. */
  hoveredId: string | null
}

function isRoute(id: string | null, prop = 'id'): ExpressionSpecification {
  return ['==', ['get', prop], id ?? '']
}

function emphasised(e: Emphasis, prop = 'id'): ExpressionSpecification {
  return ['any', isRoute(e.selectedId, prop), isRoute(e.hoveredId, prop)]
}

/** Selected route draws on top, then the recommended one, then the rest. */
function routeSortKey(e: Emphasis, prop = 'id'): ExpressionSpecification {
  return ['case', emphasised(e, prop), 2, ['to-boolean', ['get', 'recommended']], 1, 0]
}

export function routeCasingLayer(e: Emphasis, colors: RouteColors): LayerProps {
  return {
    id: ROUTE_CASING_LAYER_ID,
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': routeSortKey(e) },
    paint: {
      'line-color': colors.casing,
      'line-width': ['case', emphasised(e), 10, ['get', 'recommended'], 8, 6],
      'line-opacity': ['case', emphasised(e), 1, 0.7],
    },
  }
}

export function routeLineLayer(e: Emphasis, colors: RouteColors): LayerProps {
  return {
    id: ROUTE_LINE_LAYER_ID,
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': routeSortKey(e) },
    paint: {
      'line-color': ['case', ['get', 'recommended'], colors.recommended, colors.alternative],
      'line-width': ['case', emphasised(e), 6, ['get', 'recommended'], 4.5, 3],
      'line-opacity': ['case', emphasised(e), 1, ['get', 'recommended'], 0.75, 0.5],
    },
  }
}

/** Wide invisible line so routes are easy to hover/click, including on touch. */
export const ROUTE_HIT_LAYER: LayerProps = {
  id: ROUTE_HIT_LAYER_ID,
  type: 'line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': 'black', 'line-opacity': 0, 'line-width': 22 },
}

function levelColor(palette: RiskPalette): ExpressionSpecification {
  return [
    'match',
    ['get', 'level'],
    'LOW',
    palette.LOW,
    'MODERATE',
    palette.MODERATE,
    'HIGH',
    palette.HIGH,
    'SEVERE',
    palette.SEVERE,
    'NO_TRAVEL',
    palette.NO_TRAVEL,
    palette.NONE,
  ]
}

/**
 * Checkpoints: colour = level, radius grows with severity (a second, non-colour
 * cue), and checkpoints on routes that are not emphasised recede.
 */
export function checkpointLayer(e: Emphasis, palette: RiskPalette, casing: string): LayerProps {
  const onFocus = emphasised(e, 'routeId')
  const severityRadius: ExpressionSpecification = ['+', 4, ['*', ['max', ['get', 'score'], 0], 1.1]]
  return {
    id: CHECKPOINT_LAYER_ID,
    type: 'circle',
    layout: { 'circle-sort-key': ['+', ['case', onFocus, 10, 0], ['get', 'score']] },
    paint: {
      'circle-color': levelColor(palette),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', onFocus, severityRadius, 3], 9, ['case', onFocus, ['*', severityRadius, 1.5], 5]],
      'circle-stroke-color': casing,
      'circle-stroke-width': ['case', onFocus, 1.5, 0.75],
      'circle-opacity': ['case', onFocus, 1, 0.55],
      'circle-stroke-opacity': ['case', onFocus, 1, 0.55],
    },
  }
}

/**
 * Corridor heatmap. Mounted once with hour 0; afterwards ONLY HeatmapControls
 * changes `heatmap-weight` via map.setPaintProperty. This object is a module-level
 * constant per palette, so React re-renders never reset the scrubbed hour.
 */
export function heatmapLayer(palette: RiskPalette): LayerProps {
  return {
    id: HEATMAP_LAYER_ID,
    type: 'heatmap',
    maxzoom: 12,
    layout: { visibility: 'visible' },
    paint: {
      'heatmap-weight': heatmapWeightExpression(0),
      'heatmap-color': heatmapColorExpression(palette),
      // Radius ~1.5x the corridor grid spacing (~10 mi) at each zoom so points merge into a
      // continuous band; intensity is lowered where blobs overlap more, keeping density
      // ~ score/4 so overlapping Low points do not sum into the Moderate colour.
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 5, 0.55, 7, 0.65, 9, 0.8, 11, 0.9],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 5, 18, 6, 28, 7, 46, 9, 130, 11, 420],
      'heatmap-opacity': 0.8,
    },
  }
}
