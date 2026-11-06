"""Rank routes by the spec's priority list and explain the choice in plain language."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from trips.domain.aggregate import RouteRisk


@dataclass(frozen=True)
class Candidate:
    route_id: str
    name: str  # display name, e.g. "Route A"
    risk: RouteRisk
    duration_s: float


def ranking_key(c: Candidate) -> tuple[float, float, float, float, float]:
    """(No Travel mi, Severe mi, High mi, avg risk, time). No Travel first: audit A5."""
    avg = math.inf if c.risk.avg_risk is None else round(c.risk.avg_risk, 3)
    return (
        round(c.risk.no_travel_mi, 1),
        round(c.risk.severe_mi, 1),
        round(c.risk.high_mi, 1),
        avg,
        c.duration_s,
    )


def rank(candidates: Sequence[Candidate]) -> list[Candidate]:
    """Best first. Stable: full ties keep the routing API's order."""
    return sorted(candidates, key=ranking_key)


def _fmt_duration(seconds: float) -> str:
    minutes = round(seconds / 60)
    hours, mins = divmod(minutes, 60)
    return f"{hours} h {mins:02d} min" if hours else f"{mins} min"


def _fmt_miles(miles: float) -> str:
    """12.3 -> '12.3', 42.0 -> '42' (ranking keys are already rounded to 0.1)."""
    return f"{miles:.1f}".rstrip("0").rstrip(".")


def _explain_average(best: Candidate, runner: Candidate, best_avg: float, runner_avg: float) -> str:
    if math.isinf(runner_avg):
        return f"{best.name} has forecast coverage; {runner.name} has no forecast data."
    return (
        f"{best.name} has lower average risk ({best_avg:.3f} vs {runner_avg:.3f} on {runner.name})."
    )


_CRITERIA = (
    ("No Travel miles", 0),
    ("Severe miles", 1),
    ("High-risk miles", 2),
    ("average risk", 3),
)


def explain(ranked: Sequence[Candidate]) -> str:
    """Why ranked[0] beat the runner-up: the first criterion where they differ."""
    if not ranked:
        return "No routes available."
    best = ranked[0]
    if len(ranked) == 1:
        return f"{best.name} is the only route available."
    runner = ranked[1]
    best_key, runner_key = ranking_key(best), ranking_key(runner)

    for label, idx in _CRITERIA:
        if best_key[idx] != runner_key[idx]:
            if idx == 3:
                return _explain_average(best, runner, best_key[3], runner_key[3])
            # Same precision as the ranking key, so the two numbers never print identically.
            return (
                f"{best.name} has fewer {label}: {_fmt_miles(best_key[idx])} vs "
                f"{_fmt_miles(runner_key[idx])} on {runner.name}."
            )
    if best.duration_s < runner.duration_s:
        saved = _fmt_duration(runner.duration_s - best.duration_s)
        return f"Weather risk is equal, and {best.name} is {saved} faster than {runner.name}."
    return f"{best.name} and {runner.name} are equivalent; {best.name} was listed first."
