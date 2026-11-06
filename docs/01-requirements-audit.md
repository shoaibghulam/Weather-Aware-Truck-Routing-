# 01 — Requirements Audit

Source: `fs-assessment-spotter.pdf` (Spotter — Full Stack Developer, "Weather-Aware Truck Routing").

## 1. Requirements, traced

| ID | Requirement (spec wording) | Our interpretation | Status |
|----|----------------------------|--------------------|--------|
| R1 | React + Django web app | React (Vite + TypeScript) SPA, Django + DRF JSON API | Decided |
| R2 | User enters origin & destination | Free-text inputs with geocoding autocomplete | Decided |
| R3 | User enters departure date/time | `datetime-local` input, sent as ISO-8601 with timezone offset | Decided |
| R4 | User enters load weight | Pounds (lb), integer, validated `1 – 80,000` (US gross limit) | Decided |
| R5 | Generate **3 route options** using a routing API | Truck-profile routing with alternatives; fallback strategy if API returns < 3 | Decided — see §3.1 |
| R6 | Sample weather every **10 / 25 / 50 miles** | User picks the interval (10, 25 or 50 mi); default 25 | Decided — see §3.2 |
| R7 | …using the truck's **estimated arrival time** at each checkpoint | Each checkpoint gets an ETA; weather is read from the forecast hour matching that ETA | Decided — see §3.3 |
| R8 | Calculate weather risk using provided risk/load rules | Pure-function risk engine, exact thresholds in `03-risk-engine-spec.md` | Decided |
| R9 | Recommend best route balancing weather risk and travel time | Lexicographic ranking exactly as the spec's priority list | Decided — see §3.5 |
| R10 | Show all routes, checkpoints, risk levels, ETAs, route summaries **on a map** | MapLibre map: 3 route lines, colored checkpoint markers with popups, summary side panel | Decided |
| R11 | **Weather heatmap along the trip corridor** with **0–48 h forecast slider** | Corridor grid sampled around all routes, 49 hourly values fetched once; slider only changes a GPU paint expression (no refetch) | Decided — see §3.6 |
| D1 | GitHub repository | Needs your GitHub account / repo name | **Needed from you** |
| D2 | Hosted application | Single deploy: Django serves the built React app | **Needed from you** (host account) |
| D3 | 5–10 min Loom walkthrough | Script provided in `docs/` at the end; you record it | **You** |

Evaluation weights drive priority: logic (40%) and map/heatmap smoothness (40%) get the effort;
code quality (15%) and docs (5%) are kept high by construction. "Correctness and clarity over extra features."

## 2. Ambiguities in the spec and the decision taken

Each of these is a judgement call. They are documented in the README so a reviewer sees we noticed.

| # | Ambiguity | Decision | Why |
|---|-----------|----------|-----|
| A1 | Table boundaries overlap (e.g. rain "0.10–0.25" and "0.25–0.50") | Half-open intervals `[low, high)`; a value exactly on a boundary goes to the **higher** class. Exceptions follow the spec's own `>` signs: rain `> 1.00` and snow `> 3.0` are No Travel, so exactly 1.00 / 3.0 is Severe | Safety-conservative and matches the `<` / `≥` / `>` symbols the spec does give |
| A2 | Wind values are continuous (34.6 mph) but bands are integers (25–34, 35–44) | Bands treated as `[25,35)`, `[35,45)`, `[45,55)`, `≥55` | No gaps between 34 and 35 |
| A3 | Sustained wind vs gusts | Classify on **sustained 10 m wind speed**; show gusts in the popup as information | Spec says "wind", not "gust" |
| A4 | Rain and snow both present at one checkpoint | Checkpoint level = **max** of wind, rain, snow levels (after load rules) | Worst hazard governs |
| A5 | "Fewest Severe miles" — but routes can also have No Travel miles | Ranking key starts with **No Travel miles**, then Severe, High, average risk, time | A No-Travel route must never be recommended over a Severe one |
| A6 | How many miles does one checkpoint "own"? | Each checkpoint owns the stretch half-way to its neighbours (first/last own to the ends). Miles sum to route length | Unbiased; interval-independent |
| A7 | "Lowest average risk" | Distance-weighted mean of a numeric score: Low 0, Moderate 1, High 2, Severe 3, No Travel 4 | Simple, explainable |
| A8 | Lexicographic ranking can pick a much slower route for 1 fewer severe mile | Follow the spec literally; the UI shows the trade-off (time delta) so the driver sees it | Spec gives an explicit priority order |
| A9 | Heatmap slider "0–48 hour" — from now or from departure? | **Hours from departure**; label shows absolute local time | The driver cares about the trip window |
| A10 | ETA beyond the forecast horizon | Checkpoint marked **"No forecast"**, never silently treated as Low; route flagged | Correctness over optimism |
| A11 | Driver breaks / Hours-of-Service | Out of scope; ETAs assume continuous driving at the routing API's truck speeds. Stated in README | Spec does not mention it |
| A12 | Departure in the past | Rejected if more than 1 h in the past; capped at +14 days (forecast horizon) | Weather forecasts don't cover the past |

## 3. Key technical decisions

### 3.1 Routing — TomTom Routing API (truck mode) — *recommended*
- `travelMode=truck`, `vehicleWeight` (kg, converted from lb) → truck-legal roads and truck speeds. Load weight therefore affects routing **and** risk.
- `maxAlternatives=2` → up to 3 routes. `departAt` → traffic-aware travel time.
- `instructionsType=coded` gives `routeOffsetInMeters` + cumulative `travelTimeInSeconds` per guidance point → accurate checkpoint ETAs by interpolation (better than straight-line speed).
- Free tier: ~2,500 requests/day, no card. Same key covers geocoding (Search API).
- **Fallback when < 3 routes:** re-query with a via-point offset perpendicular to the route midpoint (left/right ~10–15% of route length), dedupe near-identical geometries. If still < 3, show what exists and say why.
- Alternatives considered: HERE (also truck, comparable), Mapbox/OSRM (no truck profile → weaker story), ORS (alternatives limited on long trips).

> Facts about third-party APIs above are from prior knowledge; Phase 0 verifies them against live docs before code depends on them.

### 3.2 Checkpoint sampling
Resample the route polyline by cumulative haversine distance at the chosen interval; always include mile 0 (origin) and the destination.

### 3.3 Weather — Open-Meteo Forecast API (no key)
- Hourly `wind_speed_10m`, `wind_gusts_10m`, `rain`, `showers`, `snowfall`, `temperature_2m`, `weather_code`.
- Request **metric** units and convert in code (km/h → mph, mm → in, cm → in) so units are never ambiguous.
- Hourly values are "amount in the preceding hour" → directly an **in/hr rate**.
- Many coordinates per request (batched), cached by `(lat, lon rounded to 0.05°, hour)`.

### 3.4 Risk engine
Pure Python functions, no I/O, 100% unit-tested on every boundary. See `03-risk-engine-spec.md`.

### 3.5 Recommendation
Sort key per route: `(no_travel_mi, severe_mi, high_mi, avg_risk, duration_s)`. Miles rounded to 0.1 to avoid float ties. The UI explains *why* the winner won ("0 severe miles vs 42 on Route B").

### 3.6 Heatmap performance (40% of the grade rides on this)
- Corridor grid: points along each route every ~10 mi plus lateral offsets (±15 mi), deduped to a ~0.1° grid.
- One request fetches **49 hourly risk scores per point**; stored as GeoJSON properties `h0…h48`.
- MapLibre native `heatmap` layer; the slider calls `setPaintProperty('heatmap-weight', ['get', 'h' + hour])`. **No network, no data re-upload, no React re-render of the map** → 60 fps scrubbing.
- Routes render first; heatmap loads in a second request (progressive, perceived-fast).

## 4. Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Routing API returns fewer than 3 routes | R5 fails | Via-point fallback (§3.1) + honest UI message |
| Open-Meteo rate limit (~10k location-calls/day free) | Heatmap fails under load | Batch + cache + dedupe grid; graceful degradation (routes still work) |
| Free hosting cold starts (Render free sleeps) | Slow first load during review | Warm-up note in README; or paid tier / Railway |
| API key leaked to frontend | Security | All third-party calls go through Django; key only in server `.env` |
| Long trips exceed 48 h / forecast horizon | Missing data | A10 handling |
