"""Agriculture engine adapter over the Growing Degree Days solver.

Fidelity level 2 (educativo cuantitativo): GDD is a real, citable method,
but this adapter does not model soil nutrients, water stress, pests or
photoperiod — only thermal time. Do not present its output as a DSSAT/
APSIM-grade yield prediction.
"""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "agriculture-gdd",
    "version": "0.2.0",
    "discipline": "agriculture",
    "fidelity_level": 2,
    "fidelity_label": (
        "educativo cuantitativo (grados-dia de crecimiento / GDD; multi-parcela = N parcelas "
        "independientes con el mismo modelo; no modela suelo, agua ni plagas)"
    ),
    "supported_components": ["crop_cycle", "plots"],
    "units": {"temperature": "celsius", "gdd": "grados-dia acumulados"},
    "engine_license": "implementación propia (MIT del proyecto) sobre el método GDD de dominio público",
}


def _parse_one(scene: dict) -> tuple[str, float, list["solver.DailyWeather"], "solver.Thresholds"]:
    t_base = float(scene.get("t_base", 10))
    days = [solver.DailyWeather(**d) for d in scene.get("days", [])]
    th = scene.get("thresholds", {})
    thresholds = solver.Thresholds(
        germination=float(th.get("germination", 0)),
        flowering=float(th.get("flowering", 0)),
        maturity=float(th.get("maturity", 0)),
    )
    label = str(scene.get("label", ""))
    return label, t_base, days, thresholds


def _parse(scene: dict):
    # Backward compatible: a scene with no "plots" key parses as a single
    # plot via the original fields (t_base/days/thresholds at the top).
    _, t_base, days, thresholds = _parse_one(scene)
    return t_base, days, thresholds


def validate(scene: dict) -> dict:
    if "plots" in scene:
        errors: list[str] = []
        for i, plot in enumerate(scene["plots"]):
            _, t_base, days, thresholds = _parse_one(plot)
            for e in solver.validate(t_base, days, thresholds):
                errors.append(f"Parcela {i + 1} ({plot.get('label', 'sin nombre')}): {e}")
        return {"ok": not errors, "errors": errors}
    t_base, days, thresholds = _parse(scene)
    errors = solver.validate(t_base, days, thresholds)
    return {"ok": not errors, "errors": errors}


def run(scene: dict) -> dict:
    if "plots" in scene:
        plots = [_parse_one(p) for p in scene["plots"]]
        result = solver.run_growth_multi(plots)
    else:
        t_base, days, thresholds = _parse(scene)
        result = solver.run_growth(t_base, days, thresholds)
    return {
        "adapter": ADAPTER_METADATA["name"],
        "adapter_version": ADAPTER_METADATA["version"],
        "fidelity_level": ADAPTER_METADATA["fidelity_level"],
        **result,
    }
