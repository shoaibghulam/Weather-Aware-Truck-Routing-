"""End-to-end tests of POST /api/trips/plan with mocked TomTom and Open-Meteo."""

from datetime import UTC, datetime, timedelta

import pytest

from trips.domain.geo import Point
from trips.tests.conftest import OPEN_METEO, TOMTOM_ROUTING
from trips.tests.fakes import line, tomtom_handler, tt_route, weather_handler

ORIGIN, DEST = Point(32.0, -97.0), Point(35.0, -97.0)
WEST = line(ORIGIN, Point(33.5, -98.5)) + line(Point(33.5, -98.5), DEST)[1:]
CENTER = line(ORIGIN, DEST)
EAST = line(ORIGIN, Point(33.5, -95.5)) + line(Point(33.5, -95.5), DEST)[1:]


def _body(departure: str, **overrides) -> dict:
    body = {
        "origin": {"lat": ORIGIN.lat, "lon": ORIGIN.lon, "label": "A"},
        "destination": {"lat": DEST.lat, "lon": DEST.lon, "label": "B"},
        "departure": departure,
        "load_lb": 36_000,
        "interval_mi": 25,
    }
    return {**body, **overrides}


def _plan(api, body):
    return api.post("/api/trips/plan", body, format="json")


@pytest.mark.django_db
def test_three_api_routes_are_ranked_and_fully_described(api, mock_http, departure) -> None:
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler(
            [tt_route(CENTER, 200), tt_route(WEST, 260), tt_route(EAST, 240)]
        )
    )
    mock_http.get(OPEN_METEO).mock(side_effect=weather_handler())

    resp = _plan(api, _body(departure))

    assert resp.status_code == 200, resp.json()
    data = resp.json()
    assert [r["rank"] for r in data["routes"]] == [1, 2, 3]
    assert data["routes"][0]["recommended"] and data["routes"][0]["name"] == "Route A"
    assert {r["source"] for r in data["routes"]} == {"api"}
    assert "faster" in data["recommendation"]["explanation"]
    first = data["routes"][0]
    cps = first["checkpoints"]
    assert cps[0]["mile"] == 0 and cps[-1]["mile"] == pytest.approx(first["summary"]["distance_mi"])
    assert all(cp["level"] == "LOW" for cp in cps)
    assert cps[0]["eta"] < cps[-1]["eta"]
    assert first["summary"]["low_mi"] == pytest.approx(first["summary"]["distance_mi"], abs=0.2)
    assert data["corridor"] and data["notices"] == []


@pytest.mark.django_db
def test_wind_with_heavy_load_steers_recommendation_to_safer_route(
    api, mock_http, departure
) -> None:
    # Strong wind only west of -97.5: WEST is the fastest route but crosses it.
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler(
            [tt_route(WEST, 180), tt_route(EAST, 240), tt_route(CENTER, 260)]
        )
    )
    mock_http.get(OPEN_METEO).mock(
        side_effect=weather_handler(wind_mph=lambda lat, lon: 50.0 if lon < -97.5 else 5.0)
    )

    data = _plan(api, _body(departure, load_lb=36_000)).json()

    by_name = {r["name"]: r for r in data["routes"]}
    assert by_name["Route A"]["summary"]["no_travel_mi"] > 0  # 50 mph + >30,000 lb
    assert by_name["Route A"]["rank"] == 3
    assert data["recommendation"]["route_id"] == "r1"  # EAST: faster than CENTER, equally calm
    blocked = [cp for cp in by_name["Route A"]["checkpoints"] if cp["level"] == "NO_TRAVEL"]
    assert blocked and "lb load" in blocked[0]["reasons"][0]


@pytest.mark.django_db
def test_light_load_is_severe_not_no_travel(api, mock_http, departure) -> None:
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler([tt_route(WEST, 180)] * 1, via=[tt_route(EAST, 240)])
    )
    mock_http.get(OPEN_METEO).mock(
        side_effect=weather_handler(wind_mph=lambda lat, lon: 50.0 if lon < -97.5 else 5.0)
    )

    data = _plan(api, _body(departure, load_lb=20_000)).json()
    west = next(r for r in data["routes"] if r["name"] == "Route A")
    assert west["summary"]["severe_mi"] > 0 and west["summary"]["no_travel_mi"] == 0


@pytest.mark.django_db
def test_fallback_adds_distinct_via_point_route(api, mock_http, departure) -> None:
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler(
            [tt_route(CENTER, 200), tt_route(WEST, 230)], via=[tt_route(EAST, 240)]
        )
    )
    mock_http.get(OPEN_METEO).mock(side_effect=weather_handler())

    data = _plan(api, _body(departure)).json()

    assert len(data["routes"]) == 3
    assert sorted(r["source"] for r in data["routes"]) == ["api", "api", "via-point"]
    assert data["notices"] == []


@pytest.mark.django_db
def test_fallback_rejects_duplicates_and_detours(api, mock_http, departure) -> None:
    duplicate, detour = tt_route(CENTER, 205), tt_route(EAST, 900)
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler(
            [tt_route(CENTER, 200), tt_route(WEST, 230)], via=[duplicate, detour]
        )
    )
    mock_http.get(OPEN_METEO).mock(side_effect=weather_handler())

    data = _plan(api, _body(departure)).json()

    assert len(data["routes"]) == 2
    assert "Only 2 distinct" in data["notices"][0]


@pytest.mark.django_db
def test_missing_forecast_is_flagged_not_low(api, mock_http, departure) -> None:
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler([tt_route(CENTER, 200)] * 3)
    )
    mock_http.get(OPEN_METEO).mock(side_effect=weather_handler(nulls=True))

    data = _plan(api, _body(departure)).json()

    route = data["routes"][0]
    assert all(cp["level"] is None and cp["wind_mph"] is None for cp in route["checkpoints"])
    assert route["summary"]["avg_risk"] is None
    assert route["summary"]["low_mi"] == 0
    assert any("forecast" in n for n in data["notices"])


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"load_lb": 0}, "load_lb"),
        ({"load_lb": 90_000}, "load_lb"),
        ({"interval_mi": 15}, "interval_mi"),
        ({"departure": "2020-01-01T00:00:00Z"}, "departure"),
        ({"departure": (datetime.now(UTC) + timedelta(days=30)).isoformat()}, "departure"),
        ({"destination": {"lat": 32.0, "lon": -97.0}}, "apart"),
        ({"origin": {"lat": 95, "lon": 0}}, "origin"),
    ],
)
def test_invalid_input_returns_error_envelope(api, departure, overrides, field) -> None:
    resp = _plan(api, {**_body(departure), **overrides})
    assert resp.status_code == 400
    error = resp.json()["error"]
    assert error["code"] == "INVALID_INPUT"
    assert field in error["message"] or field in str(error.get("fields"))


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status", "code", "http"),
    [
        (400, "NO_ROUTE", 422),
        (500, "ROUTING_UNAVAILABLE", 502),
        (403, "ROUTING_NOT_CONFIGURED", 503),
        (429, "ROUTING_RATE_LIMITED", 503),
    ],
)
def test_routing_failures_map_to_clear_errors(api, mock_http, departure, status, code, http):
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler([], status=status)
    )
    resp = _plan(api, _body(departure))
    assert resp.status_code == http
    assert resp.json()["error"]["code"] == code
    assert "test-key" not in resp.content.decode()


@pytest.mark.django_db
def test_no_routes_returned_is_no_route(api, mock_http, departure) -> None:
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(side_effect=tomtom_handler([]))
    resp = _plan(api, _body(departure))
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "NO_ROUTE"


@pytest.mark.django_db
def test_weather_outage_maps_to_502(api, mock_http, departure) -> None:
    mock_http.get(url__startswith=TOMTOM_ROUTING).mock(
        side_effect=tomtom_handler([tt_route(CENTER, 200)] * 3)
    )
    mock_http.get(OPEN_METEO).respond(500, text="boom")
    resp = _plan(api, _body(departure))
    assert resp.status_code == 502 and resp.json()["error"]["code"] == "WEATHER_UNAVAILABLE"


def test_failed_primary_does_not_wait_for_slow_fallbacks(monkeypatch) -> None:
    import time

    from trips.providers.errors import ProviderError
    from trips.services import routes

    def fake_fetch(waypoints, departure, load_lb, alternatives):
        if len(waypoints) == 2:
            raise ProviderError("NO_ROUTE", "none", 422)
        time.sleep(2)  # a hanging via-point request
        return []

    monkeypatch.setattr(routes.tomtom, "fetch_routes", fake_fetch)
    started = time.perf_counter()
    with pytest.raises(ProviderError):
        routes.find_routes(ORIGIN, DEST, datetime.now(UTC), 20_000)
    assert time.perf_counter() - started < 1.0


@pytest.mark.django_db
def test_missing_api_key_is_reported(api, settings, departure) -> None:
    settings.TOMTOM_API_KEY = ""
    resp = _plan(api, _body(departure))
    assert resp.status_code == 503 and resp.json()["error"]["code"] == "ROUTING_NOT_CONFIGURED"
