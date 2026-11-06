import pytest

from trips.domain.corridor import corridor_points
from trips.domain.geo import Point, decimate, haversine_mi
from trips.domain.risk import Conditions, RiskLevel, assess, risk_intensity


def _c(wind: float = 0, rain: float = 0, snow: float = 0) -> Conditions:
    return Conditions(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow)


@pytest.mark.parametrize(
    ("conditions", "load", "expected"),
    [
        (_c(), 10_000, 0.0),
        (_c(wind=12.5), 10_000, 0.5),
        (_c(wind=30), 10_000, 1.5),
        (_c(rain=1.5), 10_000, 4.0),
        (_c(wind=40), 41_000, 3.0),  # load rule raises HIGH to SEVERE -> floor of SEVERE
    ],
)
def test_risk_intensity_values(conditions: Conditions, load: int, expected: float) -> None:
    assert risk_intensity(conditions, load) == pytest.approx(expected)


@pytest.mark.parametrize("wind", [0, 10, 24.9, 25, 34.9, 35, 44.9, 45, 54.9, 55, 80])
@pytest.mark.parametrize("load", [10_000, 35_000, 45_000])
def test_intensity_never_contradicts_level(wind: float, load: int) -> None:
    level = assess(_c(wind=wind, rain=0.12), load).level
    intensity = risk_intensity(_c(wind=wind, rain=0.12), load)
    if level is RiskLevel.NO_TRAVEL:
        assert intensity == 4.0
    else:
        assert level.score <= intensity < level.score + 1


def test_decimate_keeps_ends_and_spacing() -> None:
    pts = [Point(0, i * 0.001) for i in range(1000)]  # ~0.07 mi apart
    kept = decimate(pts, 1.0)
    assert kept[0] == pts[0] and kept[-1] == pts[-1]
    assert all(haversine_mi(a, b) >= 1.0 for a, b in zip(kept[:-2], kept[1:-1], strict=False))
    assert len(kept) < 100
    assert decimate(pts[:2], 1.0) == pts[:2]


def test_corridor_covers_both_sides_and_dedupes() -> None:
    route = [Point(32, -97), Point(36, -97)]
    pts = corridor_points([route, route], step_mi=15, offset_mi=20)
    lons = {p.lon for p in pts}
    assert min(lons) < -97.2 and max(lons) > -96.8  # points left and right of the route
    assert len(pts) == len(set(pts))  # the duplicated route added nothing


def test_corridor_respects_max_points() -> None:
    long_route = [Point(30, -120), Point(45, -75)]
    assert len(corridor_points([long_route], max_points=50)) <= 50
    assert corridor_points([]) == []
