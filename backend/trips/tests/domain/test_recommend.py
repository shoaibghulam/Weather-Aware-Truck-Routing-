from trips.domain.aggregate import RouteRisk
from trips.domain.recommend import Candidate, explain, rank
from trips.domain.risk import RiskLevel


def _risk(
    no_travel: float = 0, severe: float = 0, high: float = 0, avg: float | None = 0.0
) -> RouteRisk:
    return RouteRisk(no_travel, severe, high, 0, 0, 0, avg, RiskLevel.LOW)


def _c(name: str, risk: RouteRisk, hours: float) -> Candidate:
    return Candidate(route_id=name, name=name, risk=risk, duration_s=hours * 3600)


def _order(cands: list[Candidate]) -> list[str]:
    return [c.name for c in rank(cands)]


def test_fewest_severe_miles_beats_faster_route() -> None:
    fast_risky = _c("A", _risk(severe=10), 10)
    slow_safe = _c("B", _risk(severe=0, high=50), 14)
    assert _order([fast_risky, slow_safe]) == ["B", "A"]


def test_no_travel_outranks_everything() -> None:
    blocked = _c("A", _risk(no_travel=5), 8)
    severe = _c("B", _risk(severe=200), 12)
    assert _order([blocked, severe]) == ["B", "A"]


def test_high_miles_break_severe_tie() -> None:
    a = _c("A", _risk(severe=5, high=40), 9)
    b = _c("B", _risk(severe=5, high=10), 11)
    assert _order([a, b]) == ["B", "A"]


def test_average_risk_breaks_mileage_tie() -> None:
    a = _c("A", _risk(avg=0.8), 9)
    b = _c("B", _risk(avg=0.3), 11)
    assert _order([a, b]) == ["B", "A"]


def test_travel_time_is_last_tiebreaker() -> None:
    a = _c("A", _risk(), 12)
    b = _c("B", _risk(), 10)
    assert _order([a, b]) == ["B", "A"]


def test_float_noise_does_not_override_travel_time() -> None:
    a = _c("A", _risk(severe=10.0001), 9)
    b = _c("B", _risk(severe=10.0), 11)
    assert _order([a, b]) == ["A", "B"]  # equal after rounding -> faster wins


def test_unknown_average_ranks_after_known() -> None:
    a = _c("A", _risk(avg=None), 9)
    b = _c("B", _risk(avg=3.0), 11)
    assert _order([a, b]) == ["B", "A"]


def test_explanations_name_the_deciding_criterion() -> None:
    assert explain([]) == "No routes available."
    assert "only route" in explain([_c("A", _risk(), 1)])

    sev = explain(rank([_c("A", _risk(severe=42), 9), _c("B", _risk(), 11)]))
    assert sev == "B has fewer Severe miles: 0 vs 42 on A."

    avg = explain(rank([_c("A", _risk(avg=0.9), 9), _c("B", _risk(avg=0.2), 11)]))
    assert "lower average risk" in avg and "0.20" in avg

    faster = explain(rank([_c("A", _risk(), 11.5), _c("B", _risk(), 10)]))
    assert faster == "Weather risk is equal, and B is 1 h 30 min faster than A."

    tie = explain([_c("A", _risk(), 10), _c("B", _risk(), 10)])
    assert "equivalent" in tie


def test_explanation_never_prints_identical_numbers() -> None:
    close_miles = explain(
        rank([_c("A", _risk(no_travel=12.4), 9), _c("B", _risk(no_travel=12.3), 9)])
    )
    assert close_miles == "B has fewer No Travel miles: 12.3 vs 12.4 on A."

    close_avg = explain(rank([_c("A", _risk(avg=0.124), 9), _c("B", _risk(avg=0.121), 9)]))
    assert "0.121 vs 0.124" in close_avg


def test_explanation_when_runner_up_has_no_forecast() -> None:
    text = explain(rank([_c("A", _risk(avg=None), 9), _c("B", _risk(avg=1.0), 11)]))
    assert text == "B has forecast coverage; A has no forecast data."
