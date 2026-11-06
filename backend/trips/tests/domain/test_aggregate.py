import pytest

from trips.domain.aggregate import owned_miles, summarize
from trips.domain.risk import RiskLevel as L


def test_owned_miles_split_halfway_and_sum_to_total() -> None:
    owned = owned_miles([0, 25, 50, 60], total_mi=60)
    assert owned == pytest.approx([12.5, 25, 17.5, 5])
    assert sum(owned) == pytest.approx(60)


def test_owned_miles_edge_cases() -> None:
    assert owned_miles([], 10) == []
    assert owned_miles([0], 10) == [10]


def test_summarize_totals_by_level() -> None:
    risk = summarize([0, 25, 50, 75, 100], [L.LOW, L.HIGH, L.SEVERE, L.LOW, L.LOW], 100)
    assert risk.high_mi == pytest.approx(25)
    assert risk.severe_mi == pytest.approx(25)
    assert risk.low_mi == pytest.approx(50)
    assert risk.no_travel_mi == 0 and risk.no_forecast_mi == 0
    assert risk.max_level is L.SEVERE
    # (2*25 + 3*25) / 100
    assert risk.avg_risk == pytest.approx(1.25)


def test_no_forecast_miles_are_excluded_from_average() -> None:
    risk = summarize([0, 50, 100], [L.HIGH, None, None], 100)
    assert risk.no_forecast_mi == pytest.approx(75)
    assert risk.high_mi == pytest.approx(25)
    assert risk.avg_risk == pytest.approx(2.0)


def test_route_with_no_forecast_at_all() -> None:
    risk = summarize([0, 100], [None, None], 100)
    assert risk.avg_risk is None and risk.max_level is None
    assert risk.no_forecast_mi == pytest.approx(100)


def test_summarize_rejects_mismatched_lengths() -> None:
    with pytest.raises(ValueError):
        summarize([0, 10], [L.LOW], 10)
