"""Synthetic TomTom and Open-Meteo responses for tests. No real data, no network."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

import httpx

from trips.domain.geo import Point, cumulative_miles
from trips.domain.units import KMH_PER_MPH, METERS_PER_MILE

WindFn = Callable[[float, float], float]  # (lat, lon) -> mph


def line(start: Point, end: Point, n: int = 60) -> list[Point]:
    return [
        Point(
            start.lat + (end.lat - start.lat) * i / (n - 1),
            start.lon + (end.lon - start.lon) * i / (n - 1),
        )
        for i in range(n)
    ]


def tt_route(points: list[Point], minutes: float) -> dict:
    cum = cumulative_miles(points)
    half = len(points) // 2
    return {
        "summary": {
            "lengthInMeters": cum[-1] * METERS_PER_MILE,
            "travelTimeInSeconds": minutes * 60,
            "trafficDelayInSeconds": 0,
        },
        "legs": [{"points": [{"latitude": p.lat, "longitude": p.lon} for p in points]}],
        "guidance": {
            "instructions": [
                {"routeOffsetInMeters": 0, "travelTimeInSeconds": 0},
                {
                    "routeOffsetInMeters": cum[half] * METERS_PER_MILE,
                    "travelTimeInSeconds": minutes * 30,
                },
            ]
        },
    }


def tomtom_handler(
    primary: list[dict], via: list[dict] | None = None, status: int = 200
) -> Callable[[httpx.Request], httpx.Response]:
    """Two-waypoint requests get `primary`; via-point (3+) requests get `via`."""

    def handle(request: httpx.Request) -> httpx.Response:
        if status != 200:
            return httpx.Response(status, json={"detailedError": {"code": "X"}})
        locations = request.url.path.split("/calculateRoute/")[1].split("/json")[0]
        is_via = locations.count(":") >= 2
        return httpx.Response(200, json={"routes": (via or []) if is_via else primary})

    return handle


def weather_handler(
    wind_mph: WindFn = lambda lat, lon: 5.0,
    rain_mm: float = 0.0,
    snow_cm: float = 0.0,
    nulls: bool = False,
) -> Callable[[httpx.Request], httpx.Response]:
    def handle(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        lats = [float(v) for v in params["latitude"].split(",")]
        lons = [float(v) for v in params["longitude"].split(",")]
        start = datetime.fromisoformat(params["start_hour"])
        end = datetime.fromisoformat(params["end_hour"])
        hours = int((end - start) / timedelta(hours=1)) + 1
        times = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(hours)]

        def series(value: float | None) -> list[float | None]:
            return [None if nulls else value] * hours

        locations = [
            {
                "hourly": {
                    "time": times,
                    "wind_speed_10m": series(wind_mph(lat, lon) * KMH_PER_MPH),
                    "wind_gusts_10m": series(wind_mph(lat, lon) * KMH_PER_MPH * 1.3),
                    "rain": series(rain_mm),
                    "showers": series(0.0),
                    "snowfall": series(snow_cm),
                    "temperature_2m": series(10.0),
                }
            }
            for lat, lon in zip(lats, lons, strict=True)
        ]
        return httpx.Response(200, json=locations if len(locations) > 1 else locations[0])

    return handle
