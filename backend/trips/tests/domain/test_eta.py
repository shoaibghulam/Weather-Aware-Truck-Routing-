from datetime import UTC, datetime, timedelta

import pytest

from trips.domain.eta import build_anchors, elapsed_at, eta_at

DEPART = datetime(2026, 11, 7, 14, 0, tzinfo=UTC)


def test_anchors_include_ends_and_sort() -> None:
    anchors = build_anchors([(60, 3600), (20, 1500)], total_mi=100, total_s=6000)
    assert [a.mile for a in anchors] == [0, 20, 60, 100]
    assert anchors[0].elapsed_s == 0 and anchors[-1].elapsed_s == 6000


def test_anchors_drop_out_of_range_and_force_monotonic_time() -> None:
    anchors = build_anchors([(-5, 10), (150, 9), (30, 2000), (40, 1000)], 100, 6000)
    assert [a.mile for a in anchors] == [0, 30, 40, 100]
    times = [a.elapsed_s for a in anchors]
    assert times == sorted(times)  # 40 mi can't be earlier than 30 mi


def test_interpolation_respects_uneven_speed() -> None:
    # slow first half (city), fast second half (highway)
    anchors = build_anchors([(50, 4000)], total_mi=100, total_s=6000)
    assert elapsed_at(anchors, 25) == pytest.approx(2000)
    assert elapsed_at(anchors, 75) == pytest.approx(5000)


def test_elapsed_is_clamped_outside_route() -> None:
    anchors = build_anchors([], total_mi=100, total_s=6000)
    assert elapsed_at(anchors, -10) == 0
    assert elapsed_at(anchors, 500) == 6000


def test_eta_adds_elapsed_to_departure() -> None:
    anchors = build_anchors([], total_mi=100, total_s=7200)
    assert eta_at(DEPART, anchors, 50) == DEPART + timedelta(hours=1)


def test_eta_requires_timezone_aware_departure() -> None:
    anchors = build_anchors([], total_mi=100, total_s=7200)
    with pytest.raises(ValueError):
        eta_at(datetime(2026, 11, 7, 14, 0), anchors, 10)  # noqa: DTZ001
