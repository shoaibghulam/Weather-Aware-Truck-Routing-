# 02 — Architecture

## Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | Python 3.12, Django 5, Django REST Framework | Required (Django); DRF for validation + serializers |
| HTTP client | `httpx` | Timeouts, connection pooling, easy mocking (`respx`) |
| Cache | Django cache (LocMem dev, Redis optional prod) | Weather + routing responses |
| Frontend | React 18 + Vite + TypeScript | Required (React); fast builds |
| Map | MapLibre GL JS via `react-map-gl/maplibre` | Native GPU heatmap layer, free, no vendor lock |
| Basemap tiles | OpenFreeMap (no key) | Free vector tiles |
| Data fetching | TanStack Query | Caching, loading/error states |
| Styling | Tailwind CSS v4, design tokens as CSS custom properties | Speed + consistent tokens |
| Tests | pytest + pytest-django + respx · Vitest + Testing Library · Playwright (E2E) | 80% coverage floor |
| Deploy | One service: Django serves the built SPA via WhiteNoise (Render / Railway) | One URL, no CORS, one bill |

## Repository layout

```
Interivew Django task/
├── CLAUDE.md
├── README.md
├── .env.example
├── docs/                      # this folder
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── config/                # settings, urls, wsgi
│   └── trips/
│       ├── domain/            # PURE logic, no I/O — most of the 40% "logic" grade
│       │   ├── units.py       # km/h→mph, mm→in, cm→in, lb→kg
│       │   ├── geo.py         # haversine, polyline resampling, lateral offsets
│       │   ├── risk.py        # thresholds, load rules, checkpoint level
│       │   ├── aggregate.py   # owned-miles, route summary
│       │   └── recommend.py   # ranking + explanation
│       ├── providers/         # I/O adapters behind small interfaces
│       │   ├── routing_base.py
│       │   ├── tomtom.py
│       │   ├── geocoding.py
│       │   └── open_meteo.py
│       ├── services/          # orchestration: plan_trip(), build_heatmap()
│       ├── api/               # serializers, views, urls
│       └── tests/
└── frontend/
    └── src/
        ├── api/               # typed client
        ├── features/trip-form/
        ├── features/map/      # routes, checkpoints, heatmap layer, slider
        ├── features/routes-panel/
        └── styles/tokens.css
```

## Request flow

```
Browser ── POST /api/trips/plan ──▶ Django
                                    ├─ validate input (serializer)
                                    ├─ geocode origin/destination (if not coords)
                                    ├─ TomTom: 3 truck routes (+ fallback)
                                    ├─ resample each route every N miles → checkpoints
                                    ├─ ETA per checkpoint (interpolated guidance times)
                                    ├─ Open-Meteo: batched hourly forecast for all checkpoints
                                    ├─ risk.classify() per checkpoint at its ETA hour
                                    ├─ aggregate + recommend
                                    └─ JSON: routes[], recommendation, corridor[]
Browser renders routes immediately
Browser ── POST /api/trips/heatmap {corridor, departure} ──▶ Django
                                    └─ 49 hourly risk scores per grid point (GeoJSON)
Slider scrubs locally: setPaintProperty only
```

## API contract (v1)

`GET /api/geocode?q=Dallas` → `[{label, lat, lon}]` (max 5)

`POST /api/trips/plan`
```json
{ "origin": {"lat": 32.77, "lon": -96.79, "label": "Dallas, TX"},
  "destination": {"lat": 39.74, "lon": -104.99, "label": "Denver, CO"},
  "departure": "2026-11-07T08:00:00-06:00",
  "load_lb": 36000,
  "interval_mi": 25 }
```
→
```json
{ "routes": [{
    "id": "r0", "rank": 1, "recommended": true,
    "geometry": {"type": "LineString", "coordinates": [[-96.79, 32.77], "..."]},
    "summary": {"distance_mi": 795.2, "duration_s": 46800, "arrival": "...",
                "no_travel_mi": 0, "severe_mi": 0, "high_mi": 12.5, "moderate_mi": 40,
                "low_mi": 742.7, "no_forecast_mi": 0, "avg_risk": 0.12, "max_level": "HIGH"},
    "checkpoints": [{"mile": 25, "lat": 0, "lon": 0, "eta": "...",
                     "wind_mph": 18.2, "gust_mph": 27.0, "rain_in_hr": 0.0, "snow_in_hr": 0.0,
                     "temp_f": 41, "level": "LOW", "reasons": []}]
  }],
  "recommendation": {"route_id": "r0", "explanation": "..."},
  "corridor": [[-96.79, 32.77], "..."] }
```

`POST /api/trips/heatmap` `{corridor, departure}` → GeoJSON FeatureCollection; each feature has `h0`…`h48` risk scores (0–4, plus continuous intensity for smooth gradients).

Errors use one envelope: `{"error": {"code": "ROUTING_UNAVAILABLE", "message": "..."}}` with proper HTTP status.

## Security & ops
- API keys only in server env (`TOMTOM_API_KEY`); never shipped to the browser.
- Input validation at the serializer boundary; coordinate ranges, load bounds, departure window.
- DRF throttling on plan/heatmap endpoints (anon rate) to protect API quotas.
- Timeouts on all outbound calls; upstream failures map to 502 with a clear code, never a stack trace.
