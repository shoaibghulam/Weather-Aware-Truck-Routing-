"""Estimated arrival time at any distance along a route.

The routing API gives (distance from start, cumulative travel time) pairs at guidance points.
Interpolating between them respects real speed changes (cities, grades, traffic) instead of
assuming one average speed for the whole trip.
"""

from __future__ import annotations

from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class TimeAnchor:
    mile: float
    elapsed_s: float


def build_anchors(
    pairs: Sequence[tuple[float, float]], total_mi: float, total_s: float
) -> list[TimeAnchor]:
    """Sorted, monotonic anchors including (0, 0) and (total_mi, total_s)."""
    anchors = {0.0: 0.0, total_mi: total_s}
    for mile, elapsed in pairs:
        if 0 < mile < total_mi:
            anchors[mile] = elapsed
    ordered = sorted(anchors.items())
    result: list[TimeAnchor] = []
    latest = 0.0
    for mile, elapsed in ordered:
        latest = max(latest, min(elapsed, total_s))  # enforce monotonic, bounded time
        result.append(TimeAnchor(mile, latest))
    return result


def elapsed_at(anchors: Sequence[TimeAnchor], mile: float) -> float:
    if mile <= anchors[0].mile:
        return anchors[0].elapsed_s
    if mile >= anchors[-1].mile:
        return anchors[-1].elapsed_s
    miles = [a.mile for a in anchors]
    i = bisect_left(miles, mile)
    lo, hi = anchors[i - 1], anchors[i]
    frac = (mile - lo.mile) / (hi.mile - lo.mile)
    return lo.elapsed_s + (hi.elapsed_s - lo.elapsed_s) * frac


def eta_at(departure: datetime, anchors: Sequence[TimeAnchor], mile: float) -> datetime:
    if departure.tzinfo is None:
        raise ValueError("departure must be timezone-aware")
    return departure + timedelta(seconds=elapsed_at(anchors, mile))
