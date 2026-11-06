import math

import pytest

from trips.domain import units
from trips.domain.geo import (
    Point,
    cumulative_miles,
    destination_point,
    haversine_mi,
    initial_bearing_deg,
    overlap_fraction,
    perpendicular_offset,
    resample,
)

DALLAS = Point(32.7767, -96.7970)
DENVER = Point(39.7392, -104.9903)


def test_unit_conversions() -> None:
    assert units.meters_to_miles(1609.344) == pytest.approx(1.0)
    assert units.miles_to_meters(1) == pytest.approx(1609.344)
    assert units.kmh_to_mph(100) == pytest.approx(62.137, abs=1e-3)
    assert units.mm_to_in(25.4) == pytest.approx(1.0)
    assert units.cm_to_in(2.54) == pytest.approx(1.0)
    assert units.lb_to_kg(36_000) == pytest.approx(16_329.3, abs=0.1)
    assert units.c_to_f(0) == 32 and units.c_to_f(100) == 212


def test_haversine_known_distance() -> None:
    # Dallas -> Denver great-circle distance is ~663 miles
    assert haversine_mi(DALLAS, DENVER) == pytest.approx(663, abs=3)
    assert haversine_mi(DALLAS, DALLAS) == 0


def test_cumulative_miles_is_monotonic() -> None:
    pts = [Point(0, 0), Point(0, 1), Point(0, 2)]
    cum = cumulative_miles(pts)
    assert cum[0] == 0 and cum[1] < cum[2]
    assert cum[2] == pytest.approx(2 * cum[1])
    assert cumulative_miles([]) == []


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_resample_includes_start_and_end_at_interval(interval: int) -> None:
    line = [Point(0, 0), Point(0, 3)]  # ~207 mi along the equator
    total = cumulative_miles(line)[-1]
    samples = resample(line, interval)
    assert samples[0].mile == 0 and samples[0].point == line[0]
    assert samples[-1].mile == pytest.approx(total)
    assert samples[-1].point == pytest.approx(line[-1])
    gaps = [b.mile - a.mile for a, b in zip(samples, samples[1:], strict=False)]
    assert all(g == pytest.approx(interval) for g in gaps[:-1])
    assert 0 < gaps[-1] <= interval + 1e-9


def test_resample_does_not_duplicate_end_on_exact_multiple() -> None:
    line = [Point(0, 0), Point(0, 1)]
    total = cumulative_miles(line)[-1]
    samples = resample(line, total / 2)
    assert len(samples) == 3


def test_resample_point_lies_on_polyline() -> None:
    line = [Point(0, 0), Point(0, 1), Point(1, 1)]
    seg = cumulative_miles(line)[1]
    mid = resample(line, seg / 2)[1].point
    assert mid.lat == pytest.approx(0) and mid.lon == pytest.approx(0.5)


@pytest.mark.parametrize("bad", [0, -5])
def test_resample_rejects_bad_interval(bad: float) -> None:
    with pytest.raises(ValueError):
        resample([Point(0, 0), Point(0, 1)], bad)


def test_resample_rejects_single_point() -> None:
    with pytest.raises(ValueError):
        resample([Point(0, 0)], 10)


def test_bearing_and_destination_roundtrip() -> None:
    assert initial_bearing_deg(Point(0, 0), Point(1, 0)) == pytest.approx(0)
    assert initial_bearing_deg(Point(0, 0), Point(0, 1)) == pytest.approx(90)
    p = destination_point(DALLAS, 45, 100)
    assert haversine_mi(DALLAS, p) == pytest.approx(100, rel=1e-6)
    assert initial_bearing_deg(DALLAS, p) == pytest.approx(45, abs=0.01)


def test_perpendicular_offset_sides_are_opposite_and_at_distance() -> None:
    o, d = Point(0, 0), Point(0, 2)  # heading east; left is north
    left = perpendicular_offset(o, d, 50, side=-1)
    right = perpendicular_offset(o, d, 50, side=+1)
    assert left.lat > 0 > right.lat
    assert haversine_mi(Point(0, 1), left) == pytest.approx(50, rel=1e-6)
    with pytest.raises(ValueError):
        perpendicular_offset(o, d, 50, side=0)


def test_overlap_fraction_identical_vs_distinct_routes() -> None:
    a = [Point(0, 0), Point(0, 2)]
    far = [Point(1, 0), Point(1, 2)]  # ~69 miles north, parallel
    assert overlap_fraction(a, a) == 1.0
    assert overlap_fraction(a, far) == 0.0
    assert math.isclose(overlap_fraction(a, list(reversed(a))), 1.0)
