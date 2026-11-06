"""Geocode, heatmap, health and SPA endpoints."""

import httpx
import pytest

from trips.tests.conftest import OPEN_METEO, TOMTOM_SEARCH
from trips.tests.fakes import weather_handler


@pytest.mark.django_db
def test_health(api) -> None:
    assert api.get("/api/health").json() == {"status": "ok"}


@pytest.mark.django_db
def test_geocode_maps_results_and_caches(api, mock_http) -> None:
    route = mock_http.get(url__startswith=TOMTOM_SEARCH).respond(
        200,
        json={
            "results": [
                {
                    "address": {"freeformAddress": "Dallas, TX"},
                    "position": {"lat": 32.7, "lon": -96.8},
                },
                {
                    "poi": {"name": "Love's Travel Stop"},
                    "address": {"freeformAddress": "Denton, TX"},
                    "position": {"lat": 33.2, "lon": -97.1},
                },
                {"address": {}, "position": {"lat": 1, "lon": 1}},  # no label -> dropped
            ]
        },
    )

    first = api.get("/api/geocode", {"q": "Dallas"}).json()
    api.get("/api/geocode", {"q": "dallas"})

    assert first["results"] == [
        {"label": "Dallas, TX", "lat": 32.7, "lon": -96.8},
        {"label": "Love's Travel Stop, Denton, TX", "lat": 33.2, "lon": -97.1},
    ]
    assert route.call_count == 1  # second (case-insensitive) query served from cache


@pytest.mark.django_db
@pytest.mark.parametrize("query", ["", "a", "x" * 101])
def test_geocode_rejects_bad_query(api, query) -> None:
    resp = api.get("/api/geocode", {"q": query})
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "INVALID_INPUT"


@pytest.mark.django_db
def test_geocode_network_failure(api, mock_http) -> None:
    mock_http.get(url__startswith=TOMTOM_SEARCH).mock(side_effect=httpx.ConnectTimeout("t"))
    resp = api.get("/api/geocode", {"q": "Dallas"})
    assert resp.status_code == 502 and resp.json()["error"]["code"] == "GEOCODING_UNAVAILABLE"


@pytest.mark.django_db
def test_heatmap_has_49_hours_per_point(api, mock_http, departure) -> None:
    mock_http.get(OPEN_METEO).mock(
        side_effect=weather_handler(wind_mph=lambda lat, lon: 30.0 if lat > 33 else 5.0)
    )
    body = {"departure": departure, "load_lb": 20_000, "points": [[-97, 32], [-97, 34]]}

    data = api.post("/api/trips/heatmap", body, format="json").json()

    assert len(data["hours"]) == 49
    calm, windy = data["geojson"]["features"]
    assert calm["geometry"]["coordinates"] == [-97, 32]
    assert set(calm["properties"]) == {f"h{i}" for i in range(49)}
    assert 0 < calm["properties"]["h0"] < 1  # breezy but Low
    assert 1 <= windy["properties"]["h0"] < 2  # 30 mph -> Moderate


@pytest.mark.django_db
@pytest.mark.parametrize("points", [[], [[200, 0]], [[0, 95]], [[1, 2, 3]], [[0, 0]] * 401])
def test_heatmap_validates_points(api, departure, points) -> None:
    body = {"departure": departure, "load_lb": 20_000, "points": points}
    resp = api.post("/api/trips/heatmap", body, format="json")
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "INVALID_INPUT"


@pytest.mark.django_db
def test_spa_served_when_built(client, settings, tmp_path) -> None:
    settings.FRONTEND_DIST = tmp_path
    assert client.get("/").status_code == 503
    (tmp_path / "index.html").write_text("<html>app</html>")
    resp = client.get("/some/client/route")
    assert resp.status_code == 200 and b"app" in b"".join(resp.streaming_content)


@pytest.mark.django_db
def test_unknown_api_path_is_404(client) -> None:
    assert client.get("/api/nope").status_code == 404
