"""Plan a trip: routes -> checkpoints -> weather at each ETA -> risk -> ranking -> JSON."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from trips.domain.aggregate import RouteRisk, summarize
from trips.domain.corridor import corridor_points
from trips.domain.eta import build_anchors, eta_at
from trips.domain.geo import Point, cumulative_miles, decimate, resample
from trips.domain.recommend import Candidate, explain, rank
from trips.domain.risk import Conditions, RiskLevel, assess
from trips.providers import open_meteo
from trips.services.routes import RouteOption, find_routes

GEOMETRY_STEP_MI = 0.25  # response polyline resolution; full geometry is used for math


@dataclass(frozen=True)
class TripRequest:
    origin: Point
    destination: Point
    departure: datetime
    load_lb: int
    interval_mi: int


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    point: Point
    eta: datetime
    weather: open_meteo.HourWeather | None
    level: RiskLevel | None
    reasons: tuple[str, ...]


def _sample_route(option: RouteOption, req: TripRequest) -> list[tuple[float, Point, datetime]]:
    """(route mile, point, ETA) every interval. Geometry miles are scaled to the API distance."""
    raw = option.raw
    geom_total = cumulative_miles(raw.points)[-1]
    scale = raw.distance_mi / geom_total if geom_total > 0 else 1.0
    anchors = build_anchors(raw.time_pairs, raw.distance_mi, raw.duration_s)
    samples = resample(raw.points, req.interval_mi / scale)
    return [
        (s.mile * scale, s.point, eta_at(req.departure, anchors, s.mile * scale)) for s in samples
    ]


def _assess(
    mile: float, point: Point, eta: datetime, forecast: open_meteo.Forecast, load_lb: int
) -> Checkpoint:
    weather = open_meteo.lookup(forecast, point, eta)
    if weather is None:
        return Checkpoint(mile, point, eta, None, None, ())
    conditions = Conditions(weather.wind_mph, weather.rain_in_hr, weather.snow_in_hr)
    result = assess(conditions, load_lb)
    return Checkpoint(mile, point, eta, weather, result.level, result.reasons)


def plan_trip(req: TripRequest) -> dict[str, Any]:
    options, notices = find_routes(req.origin, req.destination, req.departure, req.load_lb)
    sampled = [_sample_route(option, req) for option in options]
    all_points = [point for route in sampled for _, point, _ in route]
    last_eta = max(eta for route in sampled for _, _, eta in route)
    forecast = open_meteo.fetch_hourly(all_points, req.departure, last_eta)

    checkpoints = [
        [_assess(mile, point, eta, forecast, req.load_lb) for mile, point, eta in route]
        for route in sampled
    ]
    risks = [
        summarize([c.mile for c in cps], [c.level for c in cps], option.raw.distance_mi)
        for option, cps in zip(options, checkpoints, strict=True)
    ]
    candidates = [
        Candidate(f"r{i}", f"Route {chr(65 + i)}", risks[i], option.raw.duration_s)
        for i, option in enumerate(options)
    ]
    ranked = rank(candidates)
    position = {c.route_id: pos for pos, c in enumerate(ranked)}
    routes = [
        _route_json(c, position[c.route_id], options[int(c.route_id[1:])], checkpoints, req)
        for c in candidates
    ]
    routes.sort(key=lambda r: r["rank"])

    if any(r.no_forecast_mi > 0 for r in risks):
        notices.append(
            "Part of the trip is beyond the weather forecast range; those miles show as "
            "'No forecast' and are not counted as low risk."
        )
    corridor = corridor_points([option.raw.points for option in options])
    return {
        "departure": req.departure.astimezone(UTC).isoformat(),
        "interval_mi": req.interval_mi,
        "load_lb": req.load_lb,
        "routes": routes,
        "recommendation": {"route_id": ranked[0].route_id, "explanation": explain(ranked)},
        "corridor": [[p.lon, p.lat] for p in corridor],
        "notices": notices,
    }


def _r(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def _summary_json(risk: RouteRisk, option: RouteOption, departure: datetime) -> dict[str, Any]:
    raw = option.raw
    return {
        "distance_mi": round(raw.distance_mi, 1),
        "duration_s": round(raw.duration_s),
        "arrival": (departure + timedelta(seconds=raw.duration_s)).astimezone(UTC).isoformat(),
        "traffic_delay_s": round(raw.traffic_delay_s),
        "no_travel_mi": round(risk.no_travel_mi, 1),
        "severe_mi": round(risk.severe_mi, 1),
        "high_mi": round(risk.high_mi, 1),
        "moderate_mi": round(risk.moderate_mi, 1),
        "low_mi": round(risk.low_mi, 1),
        "no_forecast_mi": round(risk.no_forecast_mi, 1),
        "avg_risk": _r(risk.avg_risk, 3),
        "max_level": None if risk.max_level is None else risk.max_level.name,
    }


def _checkpoint_json(c: Checkpoint) -> dict[str, Any]:
    w = c.weather
    return {
        "mile": round(c.mile, 1),
        "lat": round(c.point.lat, 5),
        "lon": round(c.point.lon, 5),
        "eta": c.eta.astimezone(UTC).replace(microsecond=0).isoformat(),
        "level": None if c.level is None else c.level.name,
        "wind_mph": None if w is None else round(w.wind_mph, 1),
        "gust_mph": None if w is None else _r(w.gust_mph, 1),
        "rain_in_hr": None if w is None else round(w.rain_in_hr, 3),
        "snow_in_hr": None if w is None else round(w.snow_in_hr, 3),
        "temp_f": None if w is None else _r(w.temp_f, 0),
        "reasons": list(c.reasons),
    }


def _route_json(
    candidate: Candidate,
    position: int,
    option: RouteOption,
    checkpoints: list[list[Checkpoint]],
    req: TripRequest,
) -> dict[str, Any]:
    index = int(candidate.route_id[1:])
    simplified = decimate(option.raw.points, GEOMETRY_STEP_MI)
    coords = [[round(p.lon, 5), round(p.lat, 5)] for p in simplified]
    return {
        "id": candidate.route_id,
        "name": candidate.name,
        "rank": position + 1,
        "recommended": position == 0,
        "source": option.source,
        "geometry": {"type": "LineString", "coordinates": coords},
        "summary": _summary_json(candidate.risk, option, req.departure),
        "checkpoints": [_checkpoint_json(c) for c in checkpoints[index]],
    }
