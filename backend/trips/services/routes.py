"""Find up to three distinct truck routes.

TomTom's truck mode often returns only two alternatives on long trips (verified live,
see docs/TODO.md). When that happens we ask for routes forced through a via-point offset
to either side of the trip midpoint, and keep only those that are genuinely different
and not absurd detours.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime

from trips.domain.geo import Point, haversine_mi, overlap_fraction, perpendicular_offset
from trips.providers import tomtom
from trips.providers.errors import ProviderError

logger = logging.getLogger(__name__)

TARGET_ROUTES = 3
DUPLICATE_OVERLAP = 0.8  # >80% of a candidate within ~1.5 mi of an existing route = same route
MAX_DETOUR_RATIO = 1.5  # reject via-routes taking 50%+ longer than the fastest
VIA_OFFSET_FRACTIONS = (0.15, 0.3)  # of the straight-line trip length


@dataclass(frozen=True)
class RouteOption:
    raw: tomtom.RawRoute
    source: str  # "api" | "via-point"


def _via_points(origin: Point, destination: Point) -> list[Point]:
    straight = haversine_mi(origin, destination)
    return [
        perpendicular_offset(origin, destination, straight * fraction, side)
        for fraction in VIA_OFFSET_FRACTIONS
        for side in (-1, 1)
    ]


def find_routes(
    origin: Point, destination: Point, departure: datetime, load_lb: int
) -> tuple[list[RouteOption], list[str]]:
    """Primary request and via-point fallbacks run concurrently.

    TomTom's alternatives request takes several seconds on long trips; waiting for it before
    starting the fallbacks would add their latency on top. The fallback results are simply
    discarded when the primary request already returns three routes.
    """
    vias = _via_points(origin, destination)
    pool = ThreadPoolExecutor(max_workers=len(vias) + 1)
    try:
        primary_future = pool.submit(
            tomtom.fetch_routes, [origin, destination], departure, load_lb, TARGET_ROUTES - 1
        )
        via_futures = [
            pool.submit(_fetch_via, origin, via, destination, departure, load_lb) for via in vias
        ]
        primary = primary_future.result()
        if not primary:
            raise ProviderError(
                "NO_ROUTE", "No truck route was found between these locations.", 422
            )
        options = [RouteOption(r, "api") for r in primary[:TARGET_ROUTES]]
        if len(options) < TARGET_ROUTES:
            options += _select_via_options([f.result() for f in via_futures], options)
    finally:
        # Never make the user wait on fallbacks once the outcome is known (e.g. primary failed).
        pool.shutdown(wait=False, cancel_futures=True)

    notices = []
    if len(options) < TARGET_ROUTES:
        notices.append(
            f"Only {len(options)} distinct truck route(s) could be found between these points."
        )
    return options, notices


def _fetch_via(
    origin: Point, via: Point, destination: Point, departure: datetime, load_lb: int
) -> tomtom.RawRoute | None:
    try:
        routes = tomtom.fetch_routes([origin, via, destination], departure, load_lb, 0)
    except ProviderError as exc:
        logger.info("via-point route skipped: %s", exc.code)
        return None
    return routes[0] if routes else None


def _is_distinct(candidate: tomtom.RawRoute, others: list[RouteOption]) -> bool:
    return all(
        overlap_fraction(candidate.points, other.raw.points) < DUPLICATE_OVERLAP for other in others
    )


def _select_via_options(
    candidates: list[tomtom.RawRoute | None], existing: list[RouteOption]
) -> list[RouteOption]:
    """Keep via-routes that are not detours and not duplicates, until we have three."""
    fastest = min(option.raw.duration_s for option in existing)
    accepted: list[RouteOption] = []
    for candidate in candidates:
        if len(existing) + len(accepted) >= TARGET_ROUTES:
            break
        if candidate is None or candidate.duration_s > fastest * MAX_DETOUR_RATIO:
            continue
        if _is_distinct(candidate, existing + accepted):
            accepted.append(RouteOption(candidate, "via-point"))
    return accepted
