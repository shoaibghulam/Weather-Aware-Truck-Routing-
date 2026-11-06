"""Turn per-checkpoint levels into per-route mileage totals and an average risk."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from trips.domain.risk import RiskLevel


@dataclass(frozen=True)
class RouteRisk:
    no_travel_mi: float
    severe_mi: float
    high_mi: float
    moderate_mi: float
    low_mi: float
    no_forecast_mi: float
    avg_risk: float | None  # None when no checkpoint had a forecast
    max_level: RiskLevel | None


def owned_miles(checkpoint_miles: Sequence[float], total_mi: float) -> list[float]:
    """Each checkpoint owns the stretch half-way to its neighbours (audit A6)."""
    n = len(checkpoint_miles)
    if n == 0:
        return []
    if n == 1:
        return [total_mi]
    bounds = [0.0]
    bounds += [(a + b) / 2 for a, b in zip(checkpoint_miles, checkpoint_miles[1:], strict=False)]
    bounds.append(total_mi)
    return [bounds[i + 1] - bounds[i] for i in range(n)]


def summarize(
    checkpoint_miles: Sequence[float], levels: Sequence[RiskLevel | None], total_mi: float
) -> RouteRisk:
    """`levels[i]` is None when checkpoint i has no forecast (audit A10)."""
    if len(checkpoint_miles) != len(levels):
        raise ValueError("checkpoint_miles and levels must be the same length")
    owned = owned_miles(checkpoint_miles, total_mi)

    by_level = {level: 0.0 for level in RiskLevel}
    no_forecast = 0.0
    for miles, level in zip(owned, levels, strict=True):
        if level is None:
            no_forecast += miles
        else:
            by_level[level] += miles

    forecast_miles = sum(by_level.values())
    avg = (
        sum(level.score * miles for level, miles in by_level.items()) / forecast_miles
        if forecast_miles > 0
        else None
    )
    known = [lvl for lvl in levels if lvl is not None]
    return RouteRisk(
        no_travel_mi=by_level[RiskLevel.NO_TRAVEL],
        severe_mi=by_level[RiskLevel.SEVERE],
        high_mi=by_level[RiskLevel.HIGH],
        moderate_mi=by_level[RiskLevel.MODERATE],
        low_mi=by_level[RiskLevel.LOW],
        no_forecast_mi=no_forecast,
        avg_risk=avg,
        max_level=max(known) if known else None,
    )
