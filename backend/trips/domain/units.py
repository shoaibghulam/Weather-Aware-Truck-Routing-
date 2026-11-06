"""Unit conversions. Providers return metric; everything internal is imperial (mi, mph, in, lb)."""

METERS_PER_MILE = 1609.344
KMH_PER_MPH = 1.609344
MM_PER_INCH = 25.4
CM_PER_INCH = 2.54
KG_PER_LB = 0.45359237


def meters_to_miles(meters: float) -> float:
    return meters / METERS_PER_MILE


def miles_to_meters(miles: float) -> float:
    return miles * METERS_PER_MILE


def kmh_to_mph(kmh: float) -> float:
    return kmh / KMH_PER_MPH


def mm_to_in(mm: float) -> float:
    return mm / MM_PER_INCH


def cm_to_in(cm: float) -> float:
    return cm / CM_PER_INCH


def lb_to_kg(lb: float) -> float:
    return lb * KG_PER_LB


def c_to_f(celsius: float) -> float:
    return celsius * 9 / 5 + 32
