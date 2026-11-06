"""Weather risk classification for a single checkpoint.

Pure functions, no I/O. The thresholds are the spec's tables, encoded once as data.
See docs/03-risk-engine-spec.md for the boundary decisions (A1/A2 in the audit).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def score(self) -> int:
        return int(self)

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class Band:
    """Values below `limit` (or at it, when `inclusive`) fall into `level`."""

    limit: float
    inclusive: bool
    level: RiskLevel

    def contains(self, value: float) -> bool:
        return value <= self.limit if self.inclusive else value < self.limit


# Anything above the last band is NO_TRAVEL.
WIND_BANDS_MPH: tuple[Band, ...] = (
    Band(25.0, False, RiskLevel.LOW),
    Band(35.0, False, RiskLevel.MODERATE),
    Band(45.0, False, RiskLevel.HIGH),
    Band(55.0, False, RiskLevel.SEVERE),
)
RAIN_BANDS_IN_HR: tuple[Band, ...] = (
    Band(0.10, False, RiskLevel.LOW),
    Band(0.25, False, RiskLevel.MODERATE),
    Band(0.50, False, RiskLevel.HIGH),
    Band(1.00, True, RiskLevel.SEVERE),  # spec: No Travel is "> 1.00"
)
SNOW_BANDS_IN_HR: tuple[Band, ...] = (
    Band(0.5, False, RiskLevel.LOW),
    Band(1.0, False, RiskLevel.MODERATE),
    Band(2.0, False, RiskLevel.HIGH),
    Band(3.0, True, RiskLevel.SEVERE),  # spec: No Travel is "> 3.0"
)

# Load rules: (wind level they apply to, load must exceed this, resulting level)
LOAD_RULES: tuple[tuple[RiskLevel, int, RiskLevel], ...] = (
    (RiskLevel.SEVERE, 30_000, RiskLevel.NO_TRAVEL),  # 45–54 mph + >30,000 lb
    (RiskLevel.HIGH, 40_000, RiskLevel.SEVERE),  # 35–44 mph + >40,000 lb
)


@dataclass(frozen=True)
class Conditions:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True)
class Assessment:
    level: RiskLevel
    reasons: tuple[str, ...]


def _validate_measurement(value: float, name: str) -> None:
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be a finite, non-negative number, got {value!r}")


def _classify(value: float, bands: tuple[Band, ...], name: str) -> RiskLevel:
    _validate_measurement(value, name)
    for band in bands:
        if band.contains(value):
            return band.level
    return RiskLevel.NO_TRAVEL


def classify_wind(mph: float) -> RiskLevel:
    return _classify(mph, WIND_BANDS_MPH, "wind_mph")


def classify_rain(in_hr: float) -> RiskLevel:
    return _classify(in_hr, RAIN_BANDS_IN_HR, "rain_in_hr")


def classify_snow(in_hr: float) -> RiskLevel:
    return _classify(in_hr, SNOW_BANDS_IN_HR, "snow_in_hr")


def apply_load_rules(wind_level: RiskLevel, load_lb: int) -> RiskLevel:
    """Raise the wind level for heavy loads. Never lowers a level."""
    for applies_to, min_exclusive_lb, result in LOAD_RULES:
        if wind_level is applies_to and load_lb > min_exclusive_lb:
            return max(wind_level, result)
    return wind_level


def _band_position(value: float, bands: tuple[Band, ...]) -> float:
    """Level score plus how far `value` sits inside its band (0..1)."""
    lower = 0.0
    for band in bands:
        if band.contains(value):
            span = band.limit - lower
            return band.level.score + min((value - lower) / span, 0.999)
        lower = band.limit
    return float(RiskLevel.NO_TRAVEL.score)


def risk_intensity(conditions: Conditions, load_lb: int) -> float:
    """Continuous 0–4 score for the heatmap: never contradicts `assess`.

    Always in [level, level + 1) for the assessed level, so a calm-but-breezy hour shows
    faint heat instead of nothing, while colours still agree with the discrete levels.
    """
    level = assess(conditions, load_lb).level
    if level is RiskLevel.NO_TRAVEL:
        return float(level.score)
    raw = max(
        _band_position(conditions.wind_mph, WIND_BANDS_MPH),
        _band_position(conditions.rain_in_hr, RAIN_BANDS_IN_HR),
        _band_position(conditions.snow_in_hr, SNOW_BANDS_IN_HR),
    )
    return min(max(raw, float(level.score)), level.score + 0.999)


def assess(conditions: Conditions, load_lb: int) -> Assessment:
    """Checkpoint level = worst of (wind after load rules, rain, snow), with reasons."""
    if load_lb < 0:
        raise ValueError(f"load_lb must be non-negative, got {load_lb!r}")

    base_wind = classify_wind(conditions.wind_mph)
    wind = apply_load_rules(base_wind, load_lb)
    rain = classify_rain(conditions.rain_in_hr)
    snow = classify_snow(conditions.snow_in_hr)
    level = max(wind, rain, snow)

    if level is RiskLevel.LOW:
        return Assessment(level=level, reasons=())

    wind_text = f"Wind {conditions.wind_mph:.0f} mph"
    if wind is not base_wind:
        wind_text += f" with {load_lb:,} lb load"
    candidates = (
        (wind, wind_text),
        (rain, f"Rain {conditions.rain_in_hr:.2f} in/hr"),
        (snow, f"Snow {conditions.snow_in_hr:.2f} in/hr"),
    )
    reasons = tuple(f"{text} → {lvl.label}" for lvl, text in candidates if lvl is level)
    return Assessment(level=level, reasons=reasons)
