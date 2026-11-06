import { memo, useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { HeatmapResponse, PlannedRoute } from '../../api/types'
import { checkpointsToGeoJson, routesToGeoJson } from './geojson'
import { HEATMAP_SOURCE_ID } from './heatmap'
import {
  CHECKPOINT_SOURCE_ID,
  ROUTE_CASING_LAYER_ID,
  ROUTE_HIT_LAYER,
  ROUTE_SOURCE_ID,
  checkpointLayer,
  heatmapLayer,
  routeCasingLayer,
  routeLineLayer,
  type Emphasis,
  type RouteColors,
} from './layerSpecs'
import type { RiskPalette } from './riskPalette'

interface RouteLayersProps {
  routes: readonly PlannedRoute[]
  emphasis: Emphasis
  palette: RiskPalette
  colors: RouteColors
}

/**
 * Routes + checkpoints. GeoJSON is rebuilt only when the plan changes; hover and
 * selection only produce new paint expressions, which react-map-gl applies with
 * setPaintProperty (no data re-upload).
 */
export const RouteLayers = memo(function RouteLayers({ routes, emphasis, palette, colors }: RouteLayersProps) {
  const routeData = useMemo(() => routesToGeoJson(routes), [routes])
  const checkpointData = useMemo(() => checkpointsToGeoJson(routes), [routes])
  const { selectedId, hoveredId } = emphasis
  const casing = useMemo(() => routeCasingLayer({ selectedId, hoveredId }, colors), [selectedId, hoveredId, colors])
  const line = useMemo(() => routeLineLayer({ selectedId, hoveredId }, colors), [selectedId, hoveredId, colors])
  const points = useMemo(
    () => checkpointLayer({ selectedId, hoveredId }, palette, colors.casing),
    [selectedId, hoveredId, palette, colors.casing],
  )
  return (
    <>
      <Source id={ROUTE_SOURCE_ID} type="geojson" data={routeData}>
        <Layer {...casing} />
        <Layer {...line} />
        <Layer {...ROUTE_HIT_LAYER} />
      </Source>
      <Source id={CHECKPOINT_SOURCE_ID} type="geojson" data={checkpointData}>
        <Layer {...points} />
      </Source>
    </>
  )
})

interface HeatmapLayerProps {
  data: HeatmapResponse['geojson']
  palette: RiskPalette
}

/**
 * The heatmap source is uploaded once per response. Its layer props are memoised
 * on the palette only, so React re-renders never reset the hour that
 * HeatmapControls set imperatively.
 */
export const HeatmapLayer = memo(function HeatmapLayer({ data, palette }: HeatmapLayerProps) {
  const layer = useMemo(() => heatmapLayer(palette), [palette])
  return (
    <Source id={HEATMAP_SOURCE_ID} type="geojson" data={data}>
      <Layer {...layer} beforeId={ROUTE_CASING_LAYER_ID} />
    </Source>
  )
})
