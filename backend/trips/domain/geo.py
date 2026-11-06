"""Geometry on the sphere: distances, polyline resampling, offsets, route similarity."""

from __future__ import annotations

import math
from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass
from typing import NamedTuple

EARTH_RADIUS_MI = 3958.7613


class Point(NamedTuple):
    lat: float
    lon: float


@dataclass(frozen=True)
class Sample:
    mile: float
    point: Point


def haversine_mi(a: Point, b: Point) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a.lat, a.lon, b.lat, b.lon))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(h)))


def cumulative_miles(points: Sequence[Point]) -> list[float]:
    """Distance from the first point to each point along the polyline."""
    if not points:
        return []
    totals = [0.0]
    for prev, cur in zip(points, points[1:], strict=False):
        totals.append(totals[-1] + haversine_mi(prev, cur))
    return totals


def _lerp(a: Point, b: Point, frac: float) -> Point:
    return Point(a.lat + (b.lat - a.lat) * frac, a.lon + (b.lon - a.lon) * frac)


def point_at_mile(points: Sequence[Point], cum: Sequence[float], mile: float) -> Point:
    """Point at a given distance along the polyline (clamped to the ends)."""
    if mile <= 0:
        return points[0]
    if mile >= cum[-1]:
        return points[-1]
    i = bisect_left(cum, mile)
    seg = cum[i] - cum[i - 1]
    frac = 0.0 if seg == 0 else (mile - cum[i - 1]) / seg
    return _lerp(points[i - 1], points[i], frac)


def resample(points: Sequence[Point], interval_mi: float) -> list[Sample]:
    """Samples every `interval_mi` along the route, always including start and end."""
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    if len(points) < 2:
        raise ValueError("a route needs at least two points")
    cum = cumulative_miles(points)
    total = cum[-1]
    count = int(total // interval_mi)
    miles = [k * interval_mi for k in range(count + 1)]
    if total - miles[-1] > 1e-9:
        miles.append(total)
    return [Sample(mile=m, point=point_at_mile(points, cum, m)) for m in miles]


def initial_bearing_deg(a: Point, b: Point) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlon = math.radians(b.lon - a.lon)
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination_point(origin: Point, bearing_deg: float, distance_mi: float) -> Point:
    lat1, lon1 = math.radians(origin.lat), math.radians(origin.lon)
    brg = math.radians(bearing_deg)
    d = distance_mi / EARTH_RADIUS_MI
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return Point(math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180)


def perpendicular_offset(origin: Point, dest: Point, offset_mi: float, side: int) -> Point:
    """Point `offset_mi` to the left (side=-1) or right (side=+1) of the O→D midpoint."""
    if side not in (-1, 1):
        raise ValueError("side must be -1 (left) or +1 (right)")
    mid = _lerp(origin, dest, 0.5)
    bearing = initial_bearing_deg(origin, dest) + 90 * side
    return destination_point(mid, bearing, offset_mi)


MILES_PER_DEG_LAT = 69.0


def _cell(p: Point, size_deg: float) -> tuple[int, int]:
    return (math.floor(p.lat / size_deg), math.floor(p.lon / size_deg))


def overlap_fraction(
    route: Sequence[Point], other: Sequence[Point], tolerance_mi: float = 1.5, step_mi: float = 5.0
) -> float:
    """Share of `route` (sampled every step_mi) lying within ~tolerance of `other`.

    Uses a grid of tolerance-sized cells, so comparing two 1,000-mile routes is O(n)
    instead of O(n*m) pairwise distances.
    """
    size = tolerance_mi / MILES_PER_DEG_LAT
    cells = {_cell(s.point, size) for s in resample(other, min(step_mi, tolerance_mi / 2))}
    probe = [s.point for s in resample(route, step_mi)]

    def near(p: Point) -> bool:
        row, col = _cell(p, size)
        return any((row + dr, col + dc) in cells for dr in (-1, 0, 1) for dc in (-1, 0, 1))

    return sum(1 for p in probe if near(p)) / len(probe)


def decimate(points: Sequence[Point], min_step_mi: float) -> list[Point]:
    """Drop vertices closer than `min_step_mi` to the last kept one; keeps both ends."""
    if len(points) <= 2:
        return list(points)
    kept = [points[0]]
    for p in points[1:-1]:
        if haversine_mi(kept[-1], p) >= min_step_mi:
            kept.append(p)
    kept.append(points[-1])
    return kept
