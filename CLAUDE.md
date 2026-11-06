# Weather-Aware Truck Routing (Spotter assessment)

React + Django app that recommends the safest truck route using weather along the route,
load weight and travel time. Spec: `fs-assessment-spotter.pdf`. Read `docs/` before working.

## Docs (source of truth)
- `docs/01-requirements-audit.md` — requirements, ambiguity decisions A1–A12, provider choices
- `docs/02-architecture.md` — layout, request flow, API contract
- `docs/03-risk-engine-spec.md` — exact thresholds and boundary tests. **Never change risk logic without updating this file and its tests together.**
- `docs/TODO.md` — phased task list; tick items as they land

## Grading priorities
40% route/weather/risk/recommendation logic · 40% map + heatmap smoothness · 15% code quality · 5% docs.
Correctness and clarity over extra features.

## Layout
- `backend/` — Django 5 + DRF. `trips/domain/` is pure (no I/O, no Django imports). I/O lives in `trips/providers/`. Orchestration in `trips/services/`.
- `frontend/` — Vite + React + TS + MapLibre. Heatmap slider must only call `setPaintProperty`; never refetch or re-upload data while scrubbing.

## Commands
- Backend tests: `cd backend && uv run pytest`
- Backend dev: `cd backend && uv run python manage.py runserver`
- Frontend: `cd frontend && npm run dev` / `npm test` / `npm run build`

## Rules
- Third-party keys only in `.env` (server side). The browser never sees `TOMTOM_API_KEY`.
- All outbound HTTP has a timeout and maps failures to the error envelope.
- Tests first for domain logic. Mock HTTP with `respx`; no live API calls in tests.
- Units: providers return metric; convert once in `domain/units.py`. Internally: miles, mph, in/hr, lb.
- Times are timezone-aware UTC internally; ISO-8601 at the API boundary.

## Agents / skills to use here
- Backend changes → `django-reviewer` / `python-reviewer`; domain logic → `tdd-guide`
- Frontend → `react-reviewer`; UI design → `ui-ux-pro-max` skill
- Before deploy → `security-reviewer`
