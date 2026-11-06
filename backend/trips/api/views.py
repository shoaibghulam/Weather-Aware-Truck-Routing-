"""HTTP endpoints. Every error leaves through one envelope: {"error": {"code", "message"}}."""

from __future__ import annotations

import logging
from typing import Any

from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.views import exception_handler as drf_exception_handler

from trips.api.serializers import HeatmapRequestSerializer, PlanRequestSerializer
from trips.domain.geo import Point
from trips.providers import tomtom
from trips.providers.errors import ProviderError
from trips.services.heatmap import build_heatmap
from trips.services.plan_trip import TripRequest, plan_trip

logger = logging.getLogger(__name__)

GEOCODE_MIN_CHARS = 2
GEOCODE_MAX_CHARS = 100


def error_response(code: str, message: str, status: int, **extra: Any) -> Response:
    return Response({"error": {"code": code, "message": message, **extra}}, status=status)


def _first_message(detail: Any) -> str:
    if isinstance(detail, dict):
        key, value = next(iter(detail.items()))
        inner = _first_message(value)
        return inner if key == "non_field_errors" else f"{key}: {inner}"
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    return str(detail)


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    if isinstance(exc, ProviderError):
        return error_response(exc.code, exc.message, exc.status)
    if isinstance(exc, ValidationError):
        return error_response("INVALID_INPUT", _first_message(exc.detail), 400, fields=exc.detail)
    if isinstance(exc, Throttled):
        return error_response(
            "RATE_LIMITED", "Too many requests. Please wait a moment and try again.", 429
        )
    response = drf_exception_handler(exc, context)
    if response is not None:
        detail = response.data.get("detail", "Request failed.") if response.data else ""
        return error_response("REQUEST_ERROR", str(detail), response.status_code)
    logger.exception("Unhandled API error", exc_info=exc)
    return error_response("INTERNAL_ERROR", "Something went wrong on our side.", 500)


class HealthView(APIView):
    throttle_classes: list = []

    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class GeocodeView(APIView):
    def get(self, request: Request) -> Response:
        query = request.query_params.get("q", "").strip()
        if not GEOCODE_MIN_CHARS <= len(query) <= GEOCODE_MAX_CHARS:
            return error_response("INVALID_INPUT", "Search text must be 2-100 characters.", 400)
        places = tomtom.geocode(query)
        return Response(
            {"results": [{"label": p.label, "lat": p.lat, "lon": p.lon} for p in places]}
        )


class PlanTripView(APIView):
    def post(self, request: Request) -> Response:
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        trip = TripRequest(
            origin=Point(data["origin"]["lat"], data["origin"]["lon"]),
            destination=Point(data["destination"]["lat"], data["destination"]["lon"]),
            departure=data["departure"],
            load_lb=data["load_lb"],
            interval_mi=data["interval_mi"],
        )
        return Response(plan_trip(trip))


class HeatmapView(APIView):
    def post(self, request: Request) -> Response:
        serializer = HeatmapRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return Response(build_heatmap(data["points"], data["departure"], data["load_lb"]))
