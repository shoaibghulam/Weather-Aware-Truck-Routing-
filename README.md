# Weather-Aware Truck Routing

A React + Django app that helps a truck driver pick the safest route. It compares three truck
routes by checking the forecast at each checkpoint at the time the truck will actually be there,
and takes the load weight into account.

- **Live app:** _added after deploy_
- **Walkthrough (Loom):** _added after recording_

## What it does

1. The driver enters an origin, a destination, a departure time, the load weight in lb, and how
   often to check the weather (every 10, 25 or 50 miles).
2. The backend gets **3 truck routes** from TomTom (truck mode, using load weight and departure time).
3. Each route is cut into checkpoints at the chosen spacing. Each checkpoint gets an **estimated
   arrival time**, interpolated from TomTom's per-turn travel times, so slow city sections and fast
   highway sections are both reflected.
4. For each checkpoint, the app looks up the Open-Meteo forecast for **the hour the truck arrives**
   and classifies it with the spec's wind, rain, snow and load rules.
5. Routes are ranked by No Travel miles, then Severe miles, High miles, average risk and travel
   time. The app explains why the winner won.
6. The map shows every route, its checkpoints, ETAs and risk levels, plus a **weather heatmap** of
   the corridor with a 0–48 h slider.

## Run it locally

Requires Python 3.12+ with [uv](https://docs.astral.sh/uv/), Node 22+, and a free
[TomTom API key](https://developer.tomtom.com/user/register). Weather and map tiles need no key.

```bash
cp .env.example .env            # then set TOMTOM_API_KEY=... and DJANGO_DEBUG=true

# backend (http://127.0.0.1:8000)
cd backend
uv sync
uv run python manage.py runserver

# frontend (http://localhost:5173, proxies /api to Django)
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend  && uv run pytest --cov=trips     # 169 tests, 98% coverage, no network
cd frontend && npm test -- --run             # 109 unit/component tests, ~96% statement coverage
cd frontend && npm run typecheck && npm run build
cd frontend && npm run e2e                   # 3 Playwright end-to-end tests against the production build
```

- Backend tests mock every HTTP call (`respx`). The risk engine is tested against every boundary in
  [docs/03-risk-engine-spec.md](docs/03-risk-engine-spec.md), e.g. 40,000 lb vs 40,001 lb at 40 mph.
- The end-to-end tests run the production build (served under `/static/`, as Django serves it)
  with the API mocked. They plan a trip, check the three ranked routes and the recommendation,
  scrub the heatmap slider (asserting it never refetches), and cover validation and API errors.
  They use the installed Microsoft Edge by default; set `PW_CHANNEL=chrome`, or
  `PW_CHANNEL=chromium` after `npx playwright install chromium`.

## How the logic works

| Concern | Approach |
|---|---|
| Thresholds | Bands are half-open (`[25, 35)`); a value on a shared boundary goes to the **higher** class, except where the spec says `>` (rain > 1.00, snow > 3.0 are No Travel) |
| Load rules | Raise the wind level only: 45–54 mph with > 30,000 lb → No Travel; 35–44 mph with > 40,000 lb → Severe |
| Checkpoint level | The worst of wind (after load rules), rain and snow, with plain-language reasons ("Wind 47 mph with 36,000 lb load → No Travel") |
| Miles per level | Each checkpoint covers the stretch halfway to its neighbours, so the miles add up to the route length |
| Missing forecast | Shown as **"No forecast"**, never counted as Low, and the route is flagged |
| Recommendation | Sort by (No Travel mi, Severe mi, High mi, average risk, duration). Miles are rounded to 0.1 so float noise can't override travel time |
| Third route | TomTom often returns only 2 truck routes on long trips. Fallback routes through via-points offset to either side of the trip midpoint; duplicates (>80% overlap) and detours (>1.5× the fastest time) are rejected |

All decisions, including the ambiguous parts of the spec, are listed in
[docs/01-requirements-audit.md](docs/01-requirements-audit.md) (A1–A12).

## Performance

- **Heatmap slider:** the corridor forecast (49 hours × ~300 points) is loaded **once**. Moving the
  slider only changes which `hN` property drives the GPU heatmap weight (`setPaintProperty`). There
  is no request, no data re-upload and no React re-render of the map.
- **Progressive loading:** routes and checkpoints render first; the heatmap loads in a second request.
- **Caching and compression:** WhiteNoise serves the fingerprinted build assets gzip-compressed
  with `immutable` caching. MapLibre (the largest dependency) ships in its own chunk.
- **Routing latency:** the primary TomTom request and the via-point fallbacks run **concurrently**,
  so planning takes about 6–7 s for a 1,300-mile trip instead of waiting for them one after another.
- **Weather lookups** are snapped to a 0.1° grid (~7 mi, finer than the forecast models resolve),
  deduplicated across routes, batched (100 locations per request), fetched in parallel and cached
  for 30 minutes.

## Project layout

```
backend/
  config/            settings (all from env), urls (API + SPA)
  trips/domain/      pure logic, no I/O: risk, geo, eta, aggregate, recommend, corridor, units
  trips/providers/   TomTom + Open-Meteo clients (timeouts, error mapping, caching)
  trips/services/    orchestration: routes (incl. fallback), plan_trip, heatmap
  trips/api/         serializers (validation), views (error envelope), urls
frontend/src/
  api/               typed API client + response types
  features/trip-form/     origin/destination autocomplete, departure, load, interval
  features/map/           MapLibre routes, checkpoints, corridor heatmap, slider, legend
  features/routes-panel/  ranked route cards, miles-per-level bars, recommendation reason
  styles/tokens.css  design tokens (light + dark), shared by the panel and the map layers
frontend/e2e/        Playwright end-to-end tests
docs/                requirements audit, architecture, risk-engine spec, TODO, Loom script
```

## Frontend

A dispatch-console design: dense, square-edged, tabular numbers. Cobalt marks the recommended
route; risk uses a colour-blind-considerate ramp (teal, yellow, orange, crimson, violet, plus grey
for "No forecast"), and colour is never the only signal: checkpoint dots grow with risk, and every
card, popup and legend prints the level name. Checkpoints are one GPU circle layer, not hundreds of
DOM markers. Clicking a checkpoint shows its ETA, wind/gust, rain, snow, temperature and the reason
for its level. The layout works from 375 px up, supports light and dark mode, respects reduced
motion, and the slider is fully keyboard-operable (arrows, Home/End, Space to play).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/geocode?q=` | Address and place autocomplete (US/CA) |
| POST | `/api/trips/plan` | Routes, checkpoints, risk, recommendation, corridor |
| POST | `/api/trips/heatmap` | 49 hourly risk intensities per corridor point |
| GET | `/api/health` | Health check |

Errors always use `{"error": {"code", "message"}}`. Examples: `INVALID_INPUT` (400),
`NO_ROUTE` (422), `RATE_LIMITED` (429), `ROUTING_UNAVAILABLE` / `WEATHER_UNAVAILABLE` (502).
The full contract is in [docs/02-architecture.md](docs/02-architecture.md).

## Deploy (Render)

`render.yaml` and the `Dockerfile` build the React app and serve it from Django (WhiteNoise), so
the whole app runs as one service at one URL with no CORS. On Render: **New → Blueprint →** pick
this repo, then enter `TOMTOM_API_KEY` when asked.

## Assumptions and limitations

- ETAs assume continuous driving at TomTom's truck speeds. Hours-of-service breaks are not modelled.
- TomTom needs gross weight: we send load + 35,000 lb typical tractor-trailer tare.
- Risk uses sustained 10 m wind; gusts are shown for information only.
- Forecasts cover about 15 days; departures are limited to the next 14 days.
- Free-tier limits: TomTom about 2,500 requests/day; Open-Meteo about 10,000 location-calls/day
  **per IP address**. On hosts whose outgoing IPs are shared with other apps (e.g. Render's free
  plan), that allowance can run out because of other tenants' traffic. The API then returns
  `WEATHER_RATE_LIMITED` with the limit that was hit (minute, hour or day). Setting
  `OPEN_METEO_API_KEY` (commercial plan) switches to a per-key quota. A search uses about 30–150
  location lookups for checkpoints plus up to 150 for the heatmap, and repeat searches are cached
  for 30 minutes across workers.
  Each plan uses up to 5 TomTom calls (primary + 4 concurrent via-point fallbacks). The API is
  throttled per client IP (60/min), using only the trusted proxy hop of `X-Forwarded-For`.
- The heatmap shows a continuous 0–4 intensity (level + position within the level's band), so a
  breezy-but-Low corridor still shows faint colour. Each value stays inside its level's band, but
  the rendered heatmap blends neighbouring points, so treat it as an overview: the checkpoint
  levels are the authoritative risk.
