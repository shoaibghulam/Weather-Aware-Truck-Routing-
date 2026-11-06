from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
import respx
from django.core.cache import cache
from rest_framework.test import APIClient

TOMTOM_ROUTING = "https://api.tomtom.com/routing/1/calculateRoute/"
TOMTOM_SEARCH = "https://api.tomtom.com/search/2/search/"
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"


@pytest.fixture(autouse=True)
def _isolated(settings) -> Iterator[None]:
    settings.TOMTOM_API_KEY = "test-key"
    settings.OPEN_METEO_BASE_URL = OPEN_METEO
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def mock_http() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:  # every request must be mocked
        yield router


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def departure() -> str:
    soon = datetime.now(UTC) + timedelta(hours=2)
    return soon.replace(minute=0, second=0, microsecond=0).isoformat()
