# 03 — Risk Engine Specification

The single source of truth for classification. Tests in `backend/` assert every row below.

## Levels and scores

| Level | Score |
|-------|-------|
| LOW | 0 |
| MODERATE | 1 |
| HIGH | 2 |
| SEVERE | 3 |
| NO_TRAVEL | 4 |
| NO_FORECAST | — (excluded from averages; route flagged) |

## Per-condition thresholds (units: mph, in/hr)

Intervals are half-open `[a, b)` unless marked. See audit A1/A2.

| Condition | LOW | MODERATE | HIGH | SEVERE | NO_TRAVEL |
|-----------|-----|----------|------|--------|-----------|
| Wind (sustained) | `< 25` | `[25, 35)` | `[35, 45)` | `[45, 55)` | `≥ 55` |
| Rain (rain + showers) | `< 0.10` | `[0.10, 0.25)` | `[0.25, 0.50)` | `[0.50, 1.00]` | `> 1.00` |
| Snow | `< 0.5` | `[0.5, 1.0)` | `[1.0, 2.0)` | `[2.0, 3.0]` | `> 3.0` |

## Load rules (load in lb) — applied to the wind level

1. wind `≥ 55` → NO_TRAVEL (any load) — already the base level.
2. wind in `[45, 55)` **and** load `> 30,000` → NO_TRAVEL.
3. wind in `[35, 45)` **and** load `> 40,000` → SEVERE.

Load rules only ever **raise** a level. Exactly 30,000 / 40,000 lb do not trigger (spec uses `>`).

## Checkpoint level

`level = max(wind_level_after_load, rain_level, snow_level)`

The result carries `reasons`: the conditions that produced the max level, e.g.
`["wind 47 mph + 36,000 lb load → No Travel"]`, so the UI can explain it.

## Route aggregation

- Checkpoint `i` owns miles `[ (d[i-1]+d[i])/2 , (d[i]+d[i+1])/2 )`; the first owns from 0, the last to the end.
- `no_travel_mi`, `severe_mi`, `high_mi`, `moderate_mi`, `low_mi`, `no_forecast_mi` = summed owned miles per level.
- `avg_risk` = Σ(score × owned_mi) / Σ(owned_mi) over checkpoints that have a forecast.
- `max_level` = worst level on the route.

## Recommendation

Sort ascending by `(round(no_travel_mi,1), round(severe_mi,1), round(high_mi,1), round(avg_risk,3), duration_s)`.
Index 0 is recommended. Ties beyond all keys keep API order (stable sort).

## Boundary test table (must all pass)

| Input | Expected |
|-------|----------|
| wind 24.9 | LOW |
| wind 25.0 | MODERATE |
| wind 34.99 | MODERATE |
| wind 35.0 | HIGH |
| wind 45.0 | SEVERE |
| wind 55.0 | NO_TRAVEL |
| rain 0.099 | LOW |
| rain 0.10 | MODERATE |
| rain 0.25 | HIGH |
| rain 0.50 | SEVERE |
| rain 1.00 | SEVERE |
| rain 1.001 | NO_TRAVEL |
| snow 0.49 | LOW |
| snow 0.5 | MODERATE |
| snow 1.0 | HIGH |
| snow 2.0 | SEVERE |
| snow 3.0 | SEVERE |
| snow 3.01 | NO_TRAVEL |
| wind 40, load 40,000 | HIGH |
| wind 40, load 40,001 | SEVERE |
| wind 50, load 30,000 | SEVERE |
| wind 50, load 30,001 | NO_TRAVEL |
| wind 60, load 1,000 | NO_TRAVEL |
| wind 30, load 79,000 | MODERATE (load rules don't apply below 35) |
| wind 10, rain 0.3, snow 0 | HIGH (rain governs) |
