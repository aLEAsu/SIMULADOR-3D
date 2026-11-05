"""Growing Degree Days (GDD) crop development solver.

Real, textbook agronomic method (also called growing degree units / heat
units), widely used by agricultural extension services to predict crop
development stages from daily temperature:

    GDD_day = max(0, (Tmax + Tmin) / 2 - Tbase)
    GDD_accumulated(day) = sum(GDD_day for day in 1..day)

A stage (germination/flowering/maturity) is reached on the first day the
accumulated GDD crosses its threshold.

docs/00-discovery.md explicitly forbids inventing species-specific
numbers without documentary backing. This module does NOT hardcode
species thresholds: Tbase and the stage thresholds are caller-supplied
parameters. The UI may offer commonly-cited reference defaults, clearly
labeled as unverified starting points to be checked against a local
agronomic source — never as validated fact.
"""
from __future__ import annotations

from dataclasses import dataclass


class GrowthModelError(ValueError):
    pass


@dataclass
class DailyWeather:
    day: int
    tmin: float
    tmax: float


@dataclass
class Thresholds:
    germination: float
    flowering: float
    maturity: float


def validate(t_base: float, days: list[DailyWeather], thresholds: Thresholds) -> list[str]:
    errors: list[str] = []
    if not days:
        errors.append("Se necesita al menos un día de clima (tmin/tmax).")
    for d in days:
        if d.tmax < d.tmin:
            errors.append(f"Día {d.day}: tmax ({d.tmax}) es menor que tmin ({d.tmin}).")
    if thresholds.germination <= 0 or thresholds.flowering <= 0 or thresholds.maturity <= 0:
        errors.append("Los umbrales de GDD deben ser positivos.")
    if not (thresholds.germination < thresholds.flowering < thresholds.maturity):
        errors.append("Los umbrales deben cumplir germinación < floración < madurez.")
    return errors


def run_growth(t_base: float, days: list[DailyWeather], thresholds: Thresholds) -> dict:
    errors = validate(t_base, days, thresholds)
    if errors:
        raise GrowthModelError("; ".join(errors))

    series = []
    accumulated = 0.0
    stage_days: dict[str, int | None] = {"germination": None, "flowering": None, "maturity": None}
    stage_order = [
        ("germination", thresholds.germination),
        ("flowering", thresholds.flowering),
        ("maturity", thresholds.maturity),
    ]

    for d in sorted(days, key=lambda x: x.day):
        daily_gdd = max(0.0, (d.tmax + d.tmin) / 2 - t_base)
        accumulated += daily_gdd
        for stage_name, threshold in stage_order:
            if stage_days[stage_name] is None and accumulated >= threshold:
                stage_days[stage_name] = d.day
        series.append({"day": d.day, "gdd_day": daily_gdd, "gdd_accumulated": accumulated})

    current_stage = "sin germinar"
    if stage_days["maturity"] is not None:
        current_stage = "madurez"
    elif stage_days["flowering"] is not None:
        current_stage = "floración"
    elif stage_days["germination"] is not None:
        current_stage = "germinada, en desarrollo vegetativo"

    return {
        "series": series,
        "total_gdd": accumulated,
        "stage_reached_on_day": stage_days,
        "current_stage": current_stage,
    }
