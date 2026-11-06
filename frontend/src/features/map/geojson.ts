import type { PlannedRoute } from '../../api/types'
import { levelKey, levelMeta } from '../../lib/risk'

export interface RouteFeatureProps {
  id: string
  name: string
  rank: number
  recommended: boolean
}

export interface CheckpointFeatureProps {
  routeId: string
  index: number
  /** LevelKey: the API level, or 'NONE' for no forecast. */
  level: string
  score: number
}

export type RouteCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RouteFeatureProps>
export type CheckpointCollection = GeoJSON.FeatureCollection<GeoJSON.Point, CheckpointFeatureProps>
export type Bounds = [number, number, number, number]

export function routesToGeoJson(routes: readonly PlannedRoute[]): RouteCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      id: r.rank,
      geometry: r.geometry,
      properties: { id: r.id, name: r.name, rank: r.rank, recommended: r.recommended },
    })),
  }
}

export function checkpointsToGeoJson(routes: readonly PlannedRoute[]): CheckpointCollection {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((r) =>
      r.checkpoints.map((c, index) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: { routeId: r.id, index, level: levelKey(c.level), score: levelMeta(c.level).score },
      })),
    ),
  }
}

/** [west, south, east, north] over every route vertex, or null when there is nothing. */
export function routesBounds(routes: readonly PlannedRoute[]): Bounds | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const route of routes) {
    for (const [lon, lat] of route.geometry.coordinates as [number, number][]) {
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  return Number.isFinite(west) ? [west, south, east, north] : null
}

/** Resolve a clicked checkpoint feature back to the API object for the popup. */
export function findCheckpoint(routes: readonly PlannedRoute[], routeId: unknown, index: unknown) {
  if (typeof routeId !== 'string' || typeof index !== 'number') return null
  const route = routes.find((r) => r.id === routeId)
  const checkpoint = route?.checkpoints[index]
  return route && checkpoint ? { route, checkpoint } : null
}
