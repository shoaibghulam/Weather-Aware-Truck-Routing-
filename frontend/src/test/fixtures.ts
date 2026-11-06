import type { Checkpoint, PlanResponse, PlannedRoute, RouteSummary } from '../api/types'

export function makeSummary(overrides: Partial<RouteSummary> = {}): RouteSummary {
  return {
    distance_mi: 100,
    duration_s: 6000,
    arrival: '2026-11-07T15:40:00Z',
    traffic_delay_s: 0,
    no_travel_mi: 0,
    severe_mi: 0,
    high_mi: 10,
    moderate_mi: 20,
    low_mi: 70,
    no_forecast_mi: 0,
    avg_risk: 0.4,
    max_level: 'HIGH',
    ...overrides,
  }
}

export function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    mile: 25,
    lat: 33,
    lon: -97,
    eta: '2026-11-07T14:00:00Z',
    level: 'MODERATE',
    wind_mph: 27.4,
    gust_mph: 40.2,
    rain_in_hr: 0.12,
    snow_in_hr: 0,
    temp_f: 41,
    reasons: ['Wind 27 mph (Moderate)'],
    ...overrides,
  }
}

export function makeRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: 'r0',
    name: 'Route A',
    rank: 1,
    recommended: true,
    source: 'api',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-97, 32],
        [-98, 34],
        [-99, 33],
      ],
    },
    summary: makeSummary(),
    checkpoints: [makeCheckpoint({ mile: 0, level: 'LOW' }), makeCheckpoint(), makeCheckpoint({ mile: 50, level: null })],
    ...overrides,
  }
}

export function makePlan(): PlanResponse {
  return {
    departure: '2026-11-07T14:00:00Z',
    interval_mi: 25,
    load_lb: 36000,
    routes: [
      makeRoute(),
      makeRoute({
        id: 'r1',
        name: 'Route B',
        rank: 2,
        recommended: false,
        summary: makeSummary({ duration_s: 7260, severe_mi: 42, low_mi: 28, max_level: 'SEVERE' }),
      }),
      makeRoute({
        id: 'r2',
        name: 'Route C',
        rank: 3,
        recommended: false,
        source: 'via-point',
        summary: makeSummary({ duration_s: 5400, no_forecast_mi: 12, low_mi: 58, max_level: null }),
      }),
    ],
    recommendation: { route_id: 'r0', explanation: 'Route A has 0 severe miles vs 42 on Route B.' },
    corridor: [
      [-97, 32],
      [-98, 34],
    ],
    notices: ['Only 2 routes from the API; Route C uses a via-point.'],
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
