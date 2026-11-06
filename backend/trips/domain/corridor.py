"""Heatmap sample grid along the trip corridor (audit §3.6)."""

from __future__ import annotations

from collections.abc import Sequence

from trips.domain.geo import Point, destination_point, initial_bearing_deg, resample

MAX_STEP_MI = 5000.0


def _snap(p: Point, grid_deg: float) -> tuple[int, int]:
    return (round(p.lat / grid_deg), round(p.lon / grid_deg))


def _build(
    routes: Sequence[Sequence[Point]], step_mi: float, offset_mi: float, grid_deg: float
) -> list[Point]:
    cells: dict[tuple[int, int], Point] = {}
    for route in routes:
        samples = resample(route, step_mi)
        last = len(samples) - 1
        for i, sample in enumerate(samples):
            before, after = samples[max(i - 1, 0)].point, samples[min(i + 1, last)].point
            bearing = initial_bearing_deg(before, after) if before != after else 0.0
            for p in (
                sample.point,
                destination_point(sample.point, bearing - 90, offset_mi),
                destination_point(sample.point, bearing + 90, offset_mi),
            ):
                key = _snap(p, grid_deg)
                cells.setdefault(
                    key, Point(round(key[0] * grid_deg, 4), round(key[1] * grid_deg, 4))
                )
    return list(cells.values())


def corridor_points(
    routes: Sequence[Sequence[Point]],
    step_mi: float = 20.0,
    offset_mi: float = 20.0,
    max_points: int = 150,
    grid_deg: float = 0.2,
) -> list[Point]:
    """Points on and either side of every route, deduplicated on a grid, capped in count.

    The step widens until the grid fits `max_points`, so long trips stay within the
    weather API budget while short trips get a dense corridor.
    """
    if not routes:
        return []
    step = step_mi
    while True:
        points = _build(routes, step, offset_mi, grid_deg)
        if len(points) <= max_points or step >= MAX_STEP_MI:
            return points[:max_points]
        step *= 1.5
