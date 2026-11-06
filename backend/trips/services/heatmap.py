"""Risk heatmap along the corridor: 49 hourly risk scores per grid point, fetched once.

The frontend loads this GeoJSON once and scrubs hours by switching which `hN` property
drives the heatmap weight, so the slider never triggers a request.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from trips.domain.geo import Point
from trips.domain.risk import Conditions, risk_intensity
from trips.providers import open_meteo

HEATMAP_HOURS = 48


def _score(weather: open_meteo.HourWeather | None, load_lb: int) -> float:
    if weather is None:
        return 0.0  # no data -> no heat (checkpoints, not the heatmap, carry "No forecast")
    conditions = Conditions(weather.wind_mph, weather.rain_in_hr, weather.snow_in_hr)
    return round(risk_intensity(conditions, load_lb), 2)


def build_heatmap(points: Sequence[Point], departure: datetime, load_lb: int) -> dict[str, Any]:
    start = open_meteo.floor_hour(departure)
    hours = [start + timedelta(hours=h) for h in range(HEATMAP_HOURS + 1)]
    forecast = open_meteo.fetch_hourly(points, hours[0], hours[-1])

    features = []
    for p in points:
        props = {
            f"h{i}": _score(open_meteo.lookup(forecast, p, hour), load_lb)
            for i, hour in enumerate(hours)
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [p.lon, p.lat]},
                "properties": props,
            }
        )
    return {
        "hours": [h.astimezone(UTC).isoformat() for h in hours],
        "geojson": {"type": "FeatureCollection", "features": features},
    }
