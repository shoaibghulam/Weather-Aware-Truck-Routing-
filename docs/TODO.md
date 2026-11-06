# TODO — Weather-Aware Truck Routing

Legend: `[ ]` open · `[x]` done · `[!]` blocked on input from you

## Needed from you

| # | Item | When needed | Notes |
|---|------|-------------|-------|
| N1 | ~~TomTom API key~~ ✅ in `.env` | Phase 2 (routing) | Free: developer.tomtom.com → sign up → "My Dashboard" → copy key. Put in `.env` as `TOMTOM_API_KEY=` — do **not** paste it in chat if you can avoid it |
| N2 | ~~GitHub repo~~ ✅ remote `origin` = shoaibghulam/Weather-Aware-Truck-Routing- (not pushed yet) | Phase 6 | I'll prepare everything; you create/approve the push |
| N3 | Hosting account (Render or Railway recommended) | Phase 6 | Free tier works; Render free sleeps after 15 min idle |
| N4 | Confirm ambiguity decisions A1–A12 in `01-requirements-audit.md` | Any time | Defaults are chosen; only reply if you disagree |
| N5 | Record the Loom (5–10 min) | Phase 7 | I'll write the script |

## Phase 0 — Setup & verification
- [x] Read spec, write audit / architecture / risk spec / TODO
- [x] Project `CLAUDE.md`
- [x] `git init`, `.gitignore`, `.env.example`
- [x] Verify TomTom + Open-Meteo live (2026-11-06): TomTom truck mode often returns only **2** routes
      (DAL→DEN, CHI→ATL) → via-point fallback is required; guidance has `routeOffsetInMeters` +
      `travelTimeInSeconds`; `routeRepresentation=none` is invalid (use `summaryOnly`/`polyline`).
      Open-Meteo returns a list for multi-location, metric units (km/h, mm, cm).

## Phase 1 — Backend domain (pure logic, TDD) — *no key needed*
- [x] Django 5 + DRF project skeleton (`backend/`), pytest configured
- [x] `domain/units.py` + tests
- [x] `domain/risk.py` — every row of the boundary table in `03-risk-engine-spec.md` (46 tests, 100% cov)
- [x] `domain/geo.py` — haversine, cumulative distance, resample at 10/25/50 mi, lateral offsets, overlap
- [x] `domain/aggregate.py` — owned miles, route summary, avg risk, NO_FORECAST handling
- [x] `domain/recommend.py` — ranking key + human explanation
- [x] `domain/eta.py` — ETA interpolation from (offset, travel_time) guidance anchors
- [x] Coverage ≥ 95% on `domain/` — **100%, 80 tests**

## Phase 2 — Providers & API
- [x] Open-Meteo client: batched multi-location hourly, metric→imperial, cache, timeouts (respx-mocked tests)
- [x] TomTom routing client: truck mode, weight, departAt, alternatives, guidance
- [x] Fallback to reach 3 routes (via-point offsets + geometry dedupe), run concurrently with primary
- [x] Geocoding endpoint (TomTom Search) with caching
- [x] `plan_trip` service + `POST /api/trips/plan` (live: 1,334-mi trip in ~6.5 s)
- [x] `build_heatmap` service + `POST /api/trips/heatmap` (continuous 0–4 intensity)
- [x] Error envelope, throttling, input validation; API key kept out of logs
- [x] API integration tests — **166 backend tests, 98% coverage**

## Phase 3 — Frontend foundation
- [x] Vite + React + TS + Tailwind v4 + tokens; Vitest
- [x] Design direction chosen (ui-ux-pro-max) — dispatch-console feel, not template UI
- [x] Typed API client + TanStack Query
- [x] Trip form: geocode autocomplete, departure, load, interval; validation

## Phase 4 — Map & heatmap (40% of grade)
- [x] MapLibre map, 3 route lines, recommended route emphasized, hover/select sync with panel
- [x] Checkpoint markers colored by level, popup: ETA, wind/gust, rain, snow, reasons
- [x] Routes panel: summary, miles per level bar, time delta vs fastest, recommendation reason
- [x] Heatmap layer with h0–h48 properties; slider swaps paint expression only
- [x] Slider: keyboard accessible, play/pause, shows absolute time (truck-position marker: not done, stretch)
- [x] Legend; reduced-motion; dark/light; mobile layout
- [x] Performance check: slider = 1 setPaintProperty per change, no refetch (asserted in tests + e2e); fps on a real GPU not measured (headless software WebGL only)

## Phase 5 — Quality
- [x] Code review agents (python/django/react reviewers) — fix CRITICAL/HIGH
- [x] Security review (keys, validation, throttling)
- [x] Playwright E2E: plan trip → 3 routes → recommended → slider moves heatmap
- [x] Coverage ≥ 80% both sides

## Phase 6 — Deploy
- [x] WhiteNoise serves built SPA; production settings via env
- [x] Dockerfile + render.yaml; health endpoint
- [!] Deploy (needs N2, N3)

## Phase 7 — Docs & walkthrough
- [x] README: setup, architecture, decisions (A1–A12), trade-offs
- [x] Loom script (5–10 min)

## Verification log (2026-11-06)
- Backend 169 tests / 98% cov; frontend 109 tests / ~96% stmt cov; 3 Playwright e2e pass; tsc clean; ruff clean.
- Live: Dallas→Denver 3 routes (1 via-point) in ~7–9 s in the browser; Seattle→Denver (1,334 mi) ~6.5 s.
- Fixed during verification: MapLibre worker 404 in production build; API key in httpx logs; heatmap too faint; e2e preview base path; review MEDIUMs (throttle XFF spoofing, explanation precision, fallback wait on primary failure).
- Docker image NOT built locally (Docker Desktop not running); production settings verified with collectstatic + DEBUG=false.
