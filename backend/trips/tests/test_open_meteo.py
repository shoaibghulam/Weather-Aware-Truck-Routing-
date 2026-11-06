from datetime import UTC, datetime, timedelta

import httpx
import pytest

from trips.domain.geo import Point
from trips.providers import open_meteo
from trips.providers.errors import ProviderError
from trips.tests.conftest import OPEN_METEO
from trips.tests.fakes import weather_handler

NOW = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)


def test_hour_helpers() -> None:
    t = datetime(2026, 1, 1, 10, 20, tzinfo=UTC)
    assert open_meteo.floor_hour(t).hour == 10
    assert open_meteo.ceil_hour(t).hour == 11
    assert open_meteo.ceil_hour(t.replace(minute=0)) == t.replace(minute=0)


def test_grid_key_snaps_to_tenth_degree() -> None:
    assert open_meteo.grid_key(Point(32.7767, -96.7970)) == (32.8, -96.8)


def test_fetch_converts_units_and_dedupes_cells(mock_http) -> None:
    route = mock_http.get(OPEN_METEO).mock(
        side_effect=weather_handler(wind_mph=lambda la, lo: 20.0, rain_mm=2.54, snow_cm=2.54)
    )
    points = [Point(32.01, -97.0), Point(32.02, -97.01), Point(40.0, -100.0)]

    forecast = open_meteo.fetch_hourly(points, NOW, NOW + timedelta(hours=3))

    assert len(forecast) == 2  # first two share a grid cell
    weather = open_meteo.lookup(forecast, points[0], NOW + timedelta(minutes=30))
    assert weather.wind_mph == pytest.approx(20.0)
    assert weather.rain_in_hr == pytest.approx(0.1)
    assert weather.snow_in_hr == pytest.approx(1.0)
    assert weather.temp_f == pytest.approx(50.0)
    # cached: same window again makes no new request
    open_meteo.fetch_hourly(points, NOW, NOW + timedelta(hours=3))
    assert route.call_count == 1


def test_batches_large_requests(mock_http) -> None:
    route = mock_http.get(OPEN_METEO).mock(side_effect=weather_handler())
    points = [Point(30 + i * 0.2, -97) for i in range(150)]
    forecast = open_meteo.fetch_hourly(points, NOW, NOW + timedelta(hours=1))
    assert len(forecast) == 150 and route.call_count == 2


def test_window_beyond_horizon_returns_nothing(mock_http) -> None:
    far = NOW + timedelta(days=20)
    assert open_meteo.fetch_hourly([Point(32, -97)], far, far + timedelta(hours=2)) == {}
    assert open_meteo.fetch_hourly([], NOW, NOW) == {}


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (httpx.Response(429), "WEATHER_RATE_LIMITED"),
        (httpx.Response(400, json={"error": True}), "WEATHER_UNAVAILABLE"),
        (httpx.Response(200, text="not json"), "WEATHER_BAD_RESPONSE"),
        (httpx.Response(200, json=[{"hourly": {}}, {"hourly": {}}]), "WEATHER_BAD_RESPONSE"),
        (httpx.Response(200, json={"nope": 1}), "WEATHER_BAD_RESPONSE"),
    ],
)
def test_errors_are_mapped(mock_http, response: httpx.Response, code: str) -> None:
    mock_http.get(OPEN_METEO).mock(return_value=response)
    with pytest.raises(ProviderError) as info:
        open_meteo.fetch_hourly([Point(32, -97)], NOW, NOW + timedelta(hours=1))
    assert info.value.code == code


@pytest.mark.parametrize(
    ("reason", "expected"),
    [
        ("Daily API request limit exceeded. Please try again tomorrow.", "today"),
        ("Hourly API request limit exceeded. Please try again in the next hour.", "this hour"),
        ("Minutely API request limit exceeded. Please try again in one minute.", "minute"),
        ("", "minute"),
    ],
)
def test_rate_limit_message_names_the_limit(mock_http, reason: str, expected: str) -> None:
    mock_http.get(OPEN_METEO).respond(429, json={"error": True, "reason": reason})
    with pytest.raises(ProviderError) as info:
        open_meteo.fetch_hourly([Point(32, -97)], NOW, NOW + timedelta(hours=1))
    assert info.value.code == "WEATHER_RATE_LIMITED" and info.value.status == 503
    assert expected in info.value.message


def test_api_key_is_sent_when_configured(mock_http, settings) -> None:
    settings.OPEN_METEO_API_KEY = "om-test"
    route = mock_http.get(OPEN_METEO).mock(side_effect=weather_handler())
    open_meteo.fetch_hourly([Point(32, -97)], NOW, NOW + timedelta(hours=1))
    assert route.calls.last.request.url.params["apikey"] == "om-test"


def test_network_error_is_mapped(mock_http) -> None:
    mock_http.get(OPEN_METEO).mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(ProviderError) as info:
        open_meteo.fetch_hourly([Point(32, -97)], NOW, NOW + timedelta(hours=1))
    assert info.value.code == "WEATHER_UNAVAILABLE"
