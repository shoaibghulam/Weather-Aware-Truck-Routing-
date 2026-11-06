"""TomTom Routing (truck mode) and Search (geocoding) clients.

The API key is read from settings and only ever sent server-to-server.
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import httpx
from django.conf import settings
from django.core.cache import cache

from trips.domain.geo import Point
from trips.domain.units import lb_to_kg, meters_to_miles
from trips.providers.errors import ProviderError

logger = logging.getLogger(__name__)

ROUTING_URL = "https://api.tomtom.com/routing/1/calculateRoute/{locations}/json"
SEARCH_URL = "https://api.tomtom.com/search/2/search/{query}.json"
# Typical tractor + empty trailer. TomTom's vehicleWeight is the gross weight, the spec's
# input is the load, so gross = load + tare.
TRUCK_TARE_LB = 35_000
GEOCODE_LIMIT = 5
GEOCODE_CACHE_TTL_S = 24 * 3600


@dataclass(frozen=True)
class RawRoute:
    points: tuple[Point, ...]
    distance_mi: float
    duration_s: float
    traffic_delay_s: float
    time_pairs: tuple[tuple[float, float], ...]  # (mile from start, elapsed seconds)


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float


def _api_key() -> str:
    key = settings.TOMTOM_API_KEY
    if not key:
        raise ProviderError("ROUTING_NOT_CONFIGURED", "Routing service is not configured.", 503)
    return key


def _get_json(url: str, params: dict[str, Any], service: str) -> dict[str, Any]:
    try:
        resp = httpx.get(url, params=params, timeout=settings.ROUTING_TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        logger.warning("%s request failed: %s", service, type(exc).__name__)
        raise ProviderError(
            f"{service}_UNAVAILABLE", f"The {service.lower()} service could not be reached."
        ) from exc

    if resp.status_code in (401, 403):
        logger.error("%s rejected the API key (HTTP %s)", service, resp.status_code)
        raise ProviderError(f"{service}_NOT_CONFIGURED", "Routing service is misconfigured.", 503)
    if resp.status_code == 429:
        raise ProviderError(
            f"{service}_RATE_LIMITED", "Too many requests to the routing service. Try again.", 503
        )
    if resp.status_code == 400 and service == "ROUTING":
        logger.info("TomTom routing 400: %s", resp.text[:300])
        raise ProviderError("NO_ROUTE", "No truck route was found between these locations.", 422)
    if resp.status_code >= 400:
        logger.warning("%s HTTP %s: %s", service, resp.status_code, resp.text[:300])
        raise ProviderError(f"{service}_UNAVAILABLE", f"The {service.lower()} service failed.")
    try:
        return resp.json()
    except ValueError as exc:
        raise ProviderError(f"{service}_BAD_RESPONSE", "Unexpected routing response.") from exc


def _depart_param(departure: datetime) -> str:
    if departure <= datetime.now(UTC):
        return "now"  # TomTom rejects departAt in the past
    return departure.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_route(route: dict[str, Any]) -> RawRoute:
    try:
        summary = route["summary"]
        points = tuple(
            Point(p["latitude"], p["longitude"]) for leg in route["legs"] for p in leg["points"]
        )
        instructions = route.get("guidance", {}).get("instructions", [])
        pairs = tuple(
            (meters_to_miles(i["routeOffsetInMeters"]), float(i["travelTimeInSeconds"]))
            for i in instructions
            if "routeOffsetInMeters" in i and "travelTimeInSeconds" in i
        )
        return RawRoute(
            points=points,
            distance_mi=meters_to_miles(summary["lengthInMeters"]),
            duration_s=float(summary["travelTimeInSeconds"]),
            traffic_delay_s=float(summary.get("trafficDelayInSeconds", 0)),
            time_pairs=pairs,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ProviderError("ROUTING_BAD_RESPONSE", "Unexpected routing response.") from exc


def fetch_routes(
    waypoints: Sequence[Point], departure: datetime, load_lb: int, alternatives: int
) -> list[RawRoute]:
    """Truck routes through `waypoints` (origin, optional vias, destination)."""
    locations = ":".join(f"{p.lat:.6f},{p.lon:.6f}" for p in waypoints)
    params: dict[str, Any] = {
        "key": _api_key(),
        "travelMode": "truck",
        "vehicleCommercial": "true",
        "vehicleWeight": round(lb_to_kg(load_lb + TRUCK_TARE_LB)),
        "maxAlternatives": alternatives,
        "routeRepresentation": "polyline",
        "instructionsType": "coded",
        "computeTravelTimeFor": "all",
        "traffic": "true",
        "departAt": _depart_param(departure),
    }
    data = _get_json(ROUTING_URL.format(locations=locations), params, "ROUTING")
    routes = [_parse_route(r) for r in data.get("routes", [])]
    return [r for r in routes if len(r.points) >= 2]


def _place_label(result: dict[str, Any]) -> str:
    address = result.get("address", {}).get("freeformAddress", "")
    poi = result.get("poi", {}).get("name")
    return f"{poi}, {address}" if poi and address else (poi or address)


def geocode(query: str) -> list[Place]:
    cache_key = "geo:" + hashlib.sha256(query.lower().encode()).hexdigest()
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    params = {
        "key": _api_key(),
        "limit": GEOCODE_LIMIT,
        "countrySet": "US,CA",
        "typeahead": "true",
        "idxSet": "Geo,PAD,Addr,POI",
    }
    data = _get_json(SEARCH_URL.format(query=quote(query, safe="")), params, "GEOCODING")
    places = []
    for result in data.get("results", []):
        position = result.get("position") or {}
        label = _place_label(result)
        if label and "lat" in position and "lon" in position:
            places.append(Place(label=label, lat=position["lat"], lon=position["lon"]))
    cache.set(cache_key, places, GEOCODE_CACHE_TTL_S)
    return places
