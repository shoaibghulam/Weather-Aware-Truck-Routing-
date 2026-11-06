/** Wire types for the Django API. Mirrors docs/02-architecture.md exactly. */

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL'
export type IntervalMi = 10 | 25 | 50
export type LonLat = [number, number]

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface GeocodeResponse {
  results: Place[]
}

export interface PlanRequest {
  origin: Place
  destination: Place
  departure: string
  load_lb: number
  interval_mi: IntervalMi
}

export interface RouteSummary {
  distance_mi: number
  duration_s: number
  arrival: string
  traffic_delay_s: number
  no_travel_mi: number
  severe_mi: number
  high_mi: number
  moderate_mi: number
  low_mi: number
  no_forecast_mi: number
  avg_risk: number | null
  max_level: RiskLevel | null
}

export interface Checkpoint {
  mile: number
  lat: number
  lon: number
  eta: string
  /** null = beyond the forecast horizon ("No forecast"), never treated as Low. */
  level: RiskLevel | null
  wind_mph: number | null
  gust_mph: number | null
  rain_in_hr: number | null
  snow_in_hr: number | null
  temp_f: number | null
  reasons: string[]
}

export interface PlannedRoute {
  id: string
  name: string
  rank: number
  recommended: boolean
  source: 'api' | 'via-point'
  geometry: GeoJSON.LineString
  summary: RouteSummary
  checkpoints: Checkpoint[]
}

export interface PlanResponse {
  departure: string
  interval_mi: number
  load_lb: number
  routes: PlannedRoute[]
  recommendation: { route_id: string; explanation: string }
  corridor: LonLat[]
  notices: string[]
}

export interface HeatmapRequest {
  departure: string
  /** Same load the plan used: load rules change risk levels. */
  load_lb: number
  /** At most HEATMAP_MAX_POINTS corridor points. */
  points: LonLat[]
}

export const HEATMAP_MAX_POINTS = 400

/** Properties h0…h48: integer 0–4 risk score at departure + N hours (0 also = no forecast). */
export type HeatmapProperties = Record<string, number | null>

export interface HeatmapResponse {
  hours: string[]
  geojson: GeoJSON.FeatureCollection<GeoJSON.Point, HeatmapProperties>
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
