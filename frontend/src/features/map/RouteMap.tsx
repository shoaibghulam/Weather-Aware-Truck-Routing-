import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { NavigationControl, Popup, ScaleControl, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { HeatmapResponse, PlanResponse } from '../../api/types'
import { readToken } from '../../lib/tokens'
import { CheckpointDetails } from './CheckpointPopup'
import { findCheckpoint, routesBounds } from './geojson'
import { HeatmapControls, type HeatmapStatus } from './HeatmapControls'
import { HeatmapLayer, RouteLayers } from './RouteLayers'
import { CHECKPOINT_LAYER_ID, INTERACTIVE_LAYER_IDS, type RouteColors } from './layerSpecs'
import { readRiskPalette } from './riskPalette'
import { RiskLegend } from './RiskLegend'
import { usePrefersDark, usePrefersReducedMotion } from './useMediaQuery'

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron'
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'
const INITIAL_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.4 }
const FIT_PADDING = { top: 48, right: 48, bottom: 170, left: 48 }
const FIT_DURATION_MS = 900

interface RouteMapProps {
  plan: PlanResponse | undefined
  heatmap: HeatmapResponse | undefined
  heatmapStatus: HeatmapStatus
  heatmapError?: string
  onRetryHeatmap: () => void
  selectedRouteId: string | null
  hoveredRouteId: string | null
  onSelectRoute: (id: string) => void
  onHoverRoute: (id: string | null) => void
}

interface PopupTarget {
  routeId: string
  index: number
}

export function RouteMap(props: RouteMapProps) {
  const { plan, heatmap, selectedRouteId, hoveredRouteId, onSelectRoute, onHoverRoute } = props
  const mapRef = useRef<MapRef | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [popup, setPopup] = useState<PopupTarget | null>(null)
  const [cursor, setCursor] = useState<string>('')
  const isDark = usePrefersDark()
  const reducedMotion = usePrefersReducedMotion()

  // Tokens are re-read when the colour scheme flips (dark tokens differ).
  const palette = useMemo(() => readRiskPalette(), [isDark])
  const colors = useMemo<RouteColors>(
    () => ({
      recommended: readToken('--route-recommended'),
      alternative: readToken('--route-alt'),
      casing: readToken('--route-casing', 'white'),
    }),
    [isDark],
  )

  const routes = plan?.routes
  useEffect(() => setPopup(null), [routes])
  useEffect(() => {
    const bounds = routes ? routesBounds(routes) : null
    if (!isLoaded || !bounds) return
    mapRef.current?.fitBounds(bounds, { padding: FIT_PADDING, duration: reducedMotion ? 0 : FIT_DURATION_MS })
  }, [routes, isLoaded, reducedMotion])

  const onMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const routeId = feature ? (feature.properties.routeId ?? feature.properties.id) : null
      setCursor(feature ? 'pointer' : '')
      onHoverRoute(typeof routeId === 'string' ? routeId : null)
    },
    [onHoverRoute],
  )

  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) return setPopup(null)
      const props = feature.properties
      const routeId = (props.routeId ?? props.id) as string
      onSelectRoute(routeId)
      setPopup(feature.layer.id === CHECKPOINT_LAYER_ID ? { routeId, index: Number(props.index) } : null)
    },
    [onSelectRoute],
  )

  const popupData = popup && routes ? findCheckpoint(routes, popup.routeId, popup.index) : null

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={isDark ? STYLE_DARK : STYLE_LIGHT}
        style={{ position: 'absolute', inset: 0 }}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        cursor={cursor}
        onLoad={() => setIsLoaded(true)}
        onMouseMove={onMouseMove}
        onMouseLeave={() => onHoverRoute(null)}
        onClick={onClick}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="top-left" unit="imperial" />
        {routes && (
          <RouteLayers routes={routes} emphasis={{ selectedId: selectedRouteId, hoveredId: hoveredRouteId }} palette={palette} colors={colors} />
        )}
        {routes && heatmap && <HeatmapLayer data={heatmap.geojson} palette={palette} />}
        {popupData && (
          <Popup
            longitude={popupData.checkpoint.lon}
            latitude={popupData.checkpoint.lat}
            onClose={() => setPopup(null)}
            closeOnClick={false}
            maxWidth="280px"
            offset={10}
          >
            <CheckpointDetails route={popupData.route} checkpoint={popupData.checkpoint} />
          </Popup>
        )}
      </MapGL>

      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col gap-2 sm:inset-x-3 sm:bottom-3 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:max-w-sm">
          {plan && (
            <HeatmapControls
              key={`${plan.departure}|${plan.corridor.length}|${isDark}`}
              mapRef={mapRef}
              departure={plan.departure}
              hours={heatmap?.hours}
              status={props.heatmapStatus}
              errorMessage={props.heatmapError}
              onRetry={props.onRetryHeatmap}
            />
          )}
        </div>
        <div className="hidden sm:block">
          <RiskLegend />
        </div>
      </div>
    </div>
  )
}
