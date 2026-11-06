"""Open-Meteo hourly forecast client: batched, cached, metric in -> imperial out.

Locations are snapped to a 0.1 degree grid (~7 mi). Forecast models resolve ~3-11 km, so
this loses nothing and lets overlapping routes and the heatmap share lookups.
Hourly precipitation is the amount in the preceding hour, i.e. directly an in/hr rate.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache

from trips.domain.geo import Point
from trips.domain.units import c_to_f, cm_to_in, kmh_to_mph, mm_to_in
from trips.providers.errors import ProviderError

logger = logging.getLogger(__name__)

HOURLY_VARS = ("wind_speed_10m", "wind_gusts_10m", "rain", "showers", "snowfall", "temperature_2m")
GRID_DEG = 0.1
BATCH_SIZE = 100
MAX_WORKERS = 4
CACHE_TTL_S = 30 * 60
FORECAST_HORIZON = timedelta(days=15)

GridKey = tuple[float, float]


@dataclass(frozen=True)
class HourWeather:
    wind_mph: float
    gust_mph: float | None
    rain_in_hr: float
    snow_in_hr: float
    temp_f: float | None


Series = dict[datetime, HourWeather]
Forecast = dict[GridKey, Series]


def floor_hour(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def ceil_hour(dt: datetime) -> datetime:
    floored = floor_hour(dt)
    return floored if floored == dt.astimezone(UTC) else floored + timedelta(hours=1)


def grid_key(p: Point) -> GridKey:
    return (
        round(round(p.lat / GRID_DEG) * GRID_DEG, 2),
        round(round(p.lon / GRID_DEG) * GRID_DEG, 2),
    )


def lookup(forecast: Forecast, point: Point, at: datetime) -> HourWeather | None:
    """Weather for the hour bucket containing `at` (values describe the preceding hour)."""
    return forecast.get(grid_key(point), {}).get(ceil_hour(at))


def _cache_key(key: GridKey, start: datetime, end: datetime) -> str:
    return f"om:{key[0]}:{key[1]}:{start:%Y%m%d%H}:{end:%Y%m%d%H}"


def fetch_hourly(points: Iterable[Point], start: datetime, end: datetime) -> Forecast:
    """Hourly forecast for every grid cell touched by `points`, between start and end."""
    start, end = floor_hour(start), ceil_hour(end)
    end = min(end, floor_hour(datetime.now(UTC)) + FORECAST_HORIZON)
    keys = list(dict.fromkeys(grid_key(p) for p in points))
    if not keys or start > end:
        return {}

    forecast: Forecast = {}
    missing: list[GridKey] = []
    for key in keys:
        cached = cache.get(_cache_key(key, start, end))
        if cached is None:
            missing.append(key)
        else:
            forecast[key] = cached

    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        results = pool.map(lambda batch: _fetch_batch(batch, start, end), batches)
        for batch, series_list in zip(batches, results, strict=True):
            for key, series in zip(batch, series_list, strict=True):
                forecast[key] = series
                cache.set(_cache_key(key, start, end), series, CACHE_TTL_S)
    return forecast


def _fetch_batch(keys: list[GridKey], start: datetime, end: datetime) -> list[Series]:
    params = {
        "latitude": ",".join(f"{k[0]:.2f}" for k in keys),
        "longitude": ",".join(f"{k[1]:.2f}" for k in keys),
        "hourly": ",".join(HOURLY_VARS),
        "timezone": "GMT",
        "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY
    try:
        resp = httpx.get(
            settings.OPEN_METEO_BASE_URL, params=params, timeout=settings.HTTP_TIMEOUT_SECONDS
        )
    except httpx.HTTPError as exc:
        logger.warning("Open-Meteo request failed: %s", type(exc).__name__)
        raise ProviderError(
            "WEATHER_UNAVAILABLE", "The weather service could not be reached."
        ) from exc
    if resp.status_code == 429:
        raise _rate_limit_error(resp)
    if resp.status_code >= 400:
        logger.warning("Open-Meteo HTTP %s: %s", resp.status_code, resp.text[:300])
        raise ProviderError("WEATHER_UNAVAILABLE", "The weather service rejected the request.")
    try:
        data = resp.json()
    except ValueError as exc:
        raise ProviderError("WEATHER_BAD_RESPONSE", "Unexpected weather response.") from exc
    locations = data if isinstance(data, list) else [data]
    if len(locations) != len(keys):
        raise ProviderError("WEATHER_BAD_RESPONSE", "Unexpected weather response.")
    return [_parse_series(loc) for loc in locations]


_LIMIT_MESSAGES = {
    "minutely": "Weather data limit reached for this minute. Try again in a minute.",
    "hourly": "Weather data limit reached for this hour. Try again later.",
    "daily": (
        "The free weather-data allowance for this server is used up for today. "
        "Try again tomorrow, or configure OPEN_METEO_API_KEY."
    ),
}


def _rate_limit_error(resp: httpx.Response) -> ProviderError:
    """Open-Meteo's free tier limits per IP (minute/hour/day); say which one was hit.

    On shared-egress hosts (e.g. Render free) other tenants count against the same IP.
    """
    try:
        reason = str(resp.json().get("reason", ""))
    except (ValueError, AttributeError):
        reason = resp.text[:200]
    logger.warning("Open-Meteo rate limit: %s", reason or "<no reason given>")
    period = next((p for p in _LIMIT_MESSAGES if p in reason.lower()), "minutely")
    return ProviderError("WEATHER_RATE_LIMITED", _LIMIT_MESSAGES[period], 503)


def _parse_series(location: dict[str, Any]) -> Series:
    try:
        hourly = location["hourly"]
        times = hourly["time"]
        columns = [hourly[var] for var in HOURLY_VARS]
    except (KeyError, TypeError) as exc:
        raise ProviderError("WEATHER_BAD_RESPONSE", "Unexpected weather response.") from exc

    series: Series = {}
    for i, stamp in enumerate(times):
        wind, gust, rain, showers, snow, temp = (column[i] for column in columns)
        if wind is None or rain is None or snow is None:
            continue  # beyond the model's range: leave the hour missing (audit A10)
        series[datetime.fromisoformat(stamp).replace(tzinfo=UTC)] = HourWeather(
            wind_mph=kmh_to_mph(max(wind, 0.0)),
            gust_mph=None if gust is None else kmh_to_mph(max(gust, 0.0)),
            rain_in_hr=mm_to_in(max(rain + (showers or 0.0), 0.0)),
            snow_in_hr=cm_to_in(max(snow, 0.0)),
            temp_f=None if temp is None else c_to_f(temp),
        )
    return series
