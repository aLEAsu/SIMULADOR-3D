"""Electronics engine adapter — implements the universal engine contract
described in docs/01-architecture.md over the MNA DC solver.

DC analysis is algebraic (not time-stepped), so pause/step/reset are not
meaningful here and say so explicitly instead of faking support.
"""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "electronics-dc",
    "version": "0.1.0",
    "discipline": "electronics",
    "fidelity_level": 3,  # 1 conceptual .. 5 validado experimentalmente
    "fidelity_label": "cientifico (analisis nodal DC, sin componentes no lineales)",
    "supported_components": ["resistor", "dc_source"],
    "units": {"resistor": "ohm", "dc_source": "volt"},
    "engine_license": "implementacion propia (MIT del proyecto); candidato de reemplazo: ngspice (BSD-3-Clause)",
}


def _to_components(scene: dict) -> list[solver.Component]:
    return [solver.Component(**item) for item in scene.get("components", [])]


def validate(scene: dict) -> dict:
    components = _to_components(scene)
    errors = solver.validate(components)
    return {"ok": not errors, "errors": errors}


def run(scene: dict) -> dict:
    components = _to_components(scene)
    result = solver.run_dc(components)
    return {
        "adapter": ADAPTER_METADATA["name"],
        "adapter_version": ADAPTER_METADATA["version"],
        "fidelity_level": ADAPTER_METADATA["fidelity_level"],
        **result,
    }


def pause(_handle=None):
    raise NotImplementedError("DC es un analisis algebraico instantaneo: pause() no aplica.")


def step(_handle=None, _dt=None):
    raise NotImplementedError("DC es un analisis algebraico instantaneo: step() no aplica.")


def reset(_handle=None):
    raise NotImplementedError("No hay estado persistente entre corridas DC: reset() no aplica.")
