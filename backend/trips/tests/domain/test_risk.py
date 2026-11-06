"""Boundary tests for the risk engine. Every row mirrors docs/03-risk-engine-spec.md."""

import math

import pytest

from trips.domain.risk import (
    Conditions,
    RiskLevel,
    assess,
    classify_rain,
    classify_snow,
    classify_wind,
)


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, RiskLevel.LOW),
        (24.9, RiskLevel.LOW),
        (25.0, RiskLevel.MODERATE),
        (34.99, RiskLevel.MODERATE),
        (35.0, RiskLevel.HIGH),
        (44.99, RiskLevel.HIGH),
        (45.0, RiskLevel.SEVERE),
        (54.99, RiskLevel.SEVERE),
        (55.0, RiskLevel.NO_TRAVEL),
        (90.0, RiskLevel.NO_TRAVEL),
    ],
)
def test_classify_wind_boundaries(mph: float, expected: RiskLevel) -> None:
    assert classify_wind(mph) is expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        (0, RiskLevel.LOW),
        (0.099, RiskLevel.LOW),
        (0.10, RiskLevel.MODERATE),
        (0.249, RiskLevel.MODERATE),
        (0.25, RiskLevel.HIGH),
        (0.50, RiskLevel.SEVERE),
        (1.00, RiskLevel.SEVERE),
        (1.001, RiskLevel.NO_TRAVEL),
    ],
)
def test_classify_rain_boundaries(in_hr: float, expected: RiskLevel) -> None:
    assert classify_rain(in_hr) is expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        (0, RiskLevel.LOW),
        (0.49, RiskLevel.LOW),
        (0.5, RiskLevel.MODERATE),
        (1.0, RiskLevel.HIGH),
        (2.0, RiskLevel.SEVERE),
        (3.0, RiskLevel.SEVERE),
        (3.01, RiskLevel.NO_TRAVEL),
    ],
)
def test_classify_snow_boundaries(in_hr: float, expected: RiskLevel) -> None:
    assert classify_snow(in_hr) is expected


def _calm(wind: float = 0.0, rain: float = 0.0, snow: float = 0.0) -> Conditions:
    return Conditions(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow)


@pytest.mark.parametrize(
    ("wind", "load_lb", "expected"),
    [
        (40, 40_000, RiskLevel.HIGH),  # exactly 40,000 does not trigger (spec uses >)
        (40, 40_001, RiskLevel.SEVERE),
        (35, 40_001, RiskLevel.SEVERE),
        (44.9, 79_000, RiskLevel.SEVERE),
        (50, 30_000, RiskLevel.SEVERE),  # exactly 30,000 does not trigger
        (50, 30_001, RiskLevel.NO_TRAVEL),
        (45, 30_001, RiskLevel.NO_TRAVEL),
        (60, 1_000, RiskLevel.NO_TRAVEL),
        (30, 79_000, RiskLevel.MODERATE),  # load rules do not apply below 35 mph
        (34.99, 79_000, RiskLevel.MODERATE),
    ],
)
def test_load_rules_raise_wind_level(wind: float, load_lb: int, expected: RiskLevel) -> None:
    assert assess(_calm(wind=wind), load_lb=load_lb).level is expected


def test_worst_condition_governs() -> None:
    result = assess(_calm(wind=10, rain=0.3, snow=0), load_lb=20_000)
    assert result.level is RiskLevel.HIGH


def test_snow_can_outrank_wind_with_load_rule() -> None:
    # wind 40 + 41,000 lb -> SEVERE; snow 3.5 -> NO_TRAVEL wins
    result = assess(_calm(wind=40, snow=3.5), load_lb=41_000)
    assert result.level is RiskLevel.NO_TRAVEL


def test_calm_weather_is_low_with_no_reasons() -> None:
    result = assess(_calm(), load_lb=10_000)
    assert result.level is RiskLevel.LOW
    assert result.reasons == ()


def test_reasons_explain_load_rule() -> None:
    result = assess(_calm(wind=47), load_lb=36_000)
    assert result.level is RiskLevel.NO_TRAVEL
    assert len(result.reasons) == 1
    reason = result.reasons[0]
    assert "47" in reason and "36,000" in reason and "No Travel" in reason


def test_reasons_list_every_condition_at_the_max_level() -> None:
    result = assess(_calm(wind=38, rain=0.3), load_lb=10_000)  # both HIGH
    assert result.level is RiskLevel.HIGH
    assert len(result.reasons) == 2


def test_reasons_omit_conditions_below_the_max_level() -> None:
    result = assess(_calm(wind=26, rain=0.6), load_lb=10_000)  # MODERATE wind, SEVERE rain
    assert result.level is RiskLevel.SEVERE
    assert len(result.reasons) == 1
    assert "Rain" in result.reasons[0]


def test_level_scores_and_labels() -> None:
    assert [lvl.score for lvl in RiskLevel] == [0, 1, 2, 3, 4]
    assert RiskLevel.NO_TRAVEL.label == "No Travel"
    assert RiskLevel.MODERATE.label == "Moderate"


@pytest.mark.parametrize("bad", [-0.1, math.nan, math.inf])
def test_invalid_measurements_are_rejected(bad: float) -> None:
    with pytest.raises(ValueError):
        classify_wind(bad)
    with pytest.raises(ValueError):
        classify_rain(bad)
    with pytest.raises(ValueError):
        classify_snow(bad)


def test_negative_load_is_rejected() -> None:
    with pytest.raises(ValueError):
        assess(_calm(), load_lb=-1)
