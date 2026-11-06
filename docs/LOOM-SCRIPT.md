# Loom walkthrough script (target: 7–8 minutes)

Written for you to read from while recording. Times are approximate. Have the hosted app open,
plus the repo in your editor. Do one practice plan first so TomTom's cache is warm.

## 1. The problem, in one breath (0:00–0:40)
"A driver gives an origin, a destination, a departure time and a load weight. The app compares
three truck routes by checking the forecast at each checkpoint **at the time the truck will be
there**, applies Spotter's wind, rain, snow and load rules, and recommends the safest route,
using travel time as the tie-breaker."

## 2. Live demo: plan a trip (0:40–2:30)
- Type **Dallas** → pick *Dallas, TX*; **Denver** → *Denver, CO*. Point out that autocomplete
  includes truck stops.
- Load **42,000 lb**, interval **25 mi**, departure in the next few hours. Click **Plan routes**.
- While it loads (about 7 s): "TomTom truck routing with alternatives is slow on long trips, so
  the backend runs the primary request and the fallback requests in parallel."
- Results:
  - Three routes. The recommended one is highlighted on the map and in the panel.
  - Read out the **"Why this route"** sentence.
  - Route cards show distance, drive time, difference vs the fastest, arrival, and a bar of miles
    per risk level.
  - Point at a card marked **Via-point**: "TomTom returned two truck routes here, so the third is
    forced through a waypoint to one side. Duplicates and big detours are rejected."
- Click a checkpoint dot: ETA, wind and gusts, rain, snow, temperature, level and the **reason**.

## 3. Heatmap and slider (2:30–3:45)
- Drag the slider from T+0 to T+48; then press **Play**.
- "The corridor forecast, 49 hours by about 300 points, is fetched **once**. Moving the slider only
  changes which hour's value drives the GPU heatmap weight, through MapLibre's `setPaintProperty`.
  No network request and no React re-render of the map, which is why scrubbing stays smooth."
- "Colours match the checkpoint legend. Calm-but-breezy areas still show faint teal, so you can
  tell 'covered, low risk' apart from 'no data'."
- Show the phone layout quickly (browser devtools at 375 px).

## 4. The logic, in code (3:45–6:00)
Open `backend/trips/domain/`. This folder is pure Python with no I/O.
- `risk.py`: the spec's tables as data (`Band`).
  - Boundary choices: half-open bands; a value on a shared boundary goes to the higher class,
    except where the spec says `>`.
  - Load rules only ever raise a level: 50 mph with 30,001 lb is No Travel, while exactly
    30,000 lb is not.
- `eta.py`: arrival time at a checkpoint interpolates TomTom's per-turn elapsed times, so slow city
  sections and fast highways are both reflected. Weather comes from the forecast hour containing
  that ETA.
- `aggregate.py`: each checkpoint covers the stretch halfway to its neighbours, so the miles add up
  to the route length. Missing forecasts are **No forecast**, never counted as Low.
- `recommend.py`: the sort key follows the spec's order, with No Travel miles first. Miles are
  rounded to 0.1 so float noise can't override travel time. The explanation names the deciding
  criterion.
- Mention `docs/01-requirements-audit.md`: 12 places where the spec is ambiguous, each with a
  decision.

## 5. Quality (6:00–7:00)
- Backend: 169 tests, 98% coverage, every HTTP call mocked; the risk engine is tested at every
  boundary in the spec.
- Frontend: 109 unit tests, plus 3 Playwright end-to-end tests against the production build.
- Robustness:
  - All errors use one `{error: {code, message}}` envelope.
  - Every outbound call has a timeout.
  - The API key stays server-side and is kept out of the logs.
  - Requests are throttled per client.
- Deploy: one Docker image; Django serves the React build with WhiteNoise. One URL, no CORS.

## 6. Trade-offs and next steps (7:00–7:45)
- No hours-of-service breaks yet. ETAs assume continuous driving.
- Gross weight = load + 35,000 lb tare for TomTom's truck restrictions.
- Next steps:
  - A gust-based risk option.
  - Persisting trips.
  - Re-routing when the forecast changes.
  - A paid weather tier for higher traffic.
