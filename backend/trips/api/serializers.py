"""Request validation at the API boundary."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from rest_framework import serializers

from trips.domain.geo import Point, haversine_mi

MAX_LOAD_LB = 80_000
INTERVALS_MI = (10, 25, 50)
MAX_PAST = timedelta(hours=1)
MAX_FUTURE = timedelta(days=14)
MAX_HEATMAP_POINTS = 400
MIN_TRIP_MI = 1.0


def validate_departure_window(value: datetime) -> datetime:
    now = datetime.now(UTC)
    if value < now - MAX_PAST:
        raise serializers.ValidationError("Departure cannot be in the past.")
    if value > now + MAX_FUTURE:
        raise serializers.ValidationError(
            "Departure must be within the next 14 days (weather forecast range)."
        )
    return value


class PlaceSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField(validators=[validate_departure_window])
    load_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)
    interval_mi = serializers.ChoiceField(choices=INTERVALS_MI)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        origin = Point(attrs["origin"]["lat"], attrs["origin"]["lon"])
        destination = Point(attrs["destination"]["lat"], attrs["destination"]["lon"])
        if haversine_mi(origin, destination) < MIN_TRIP_MI:
            raise serializers.ValidationError(
                "Origin and destination must be at least 1 mile apart."
            )
        return attrs


class HeatmapRequestSerializer(serializers.Serializer):
    departure = serializers.DateTimeField(validators=[validate_departure_window])
    load_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)
    points = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        min_length=1,
        max_length=MAX_HEATMAP_POINTS,
    )

    def validate_points(self, value: list[list[float]]) -> list[Point]:
        points = []
        for lon, lat in value:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise serializers.ValidationError("Each point must be [lon, lat] in range.")
            points.append(Point(lat, lon))
        return points
