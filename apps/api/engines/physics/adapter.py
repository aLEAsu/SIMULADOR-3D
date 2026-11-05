"""Physics engine adapter over the RK4 point-mass mechanics solver."""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "physics-mechanics-rk4",
    "version": "0.1.0",
    "discipline": "physics",
    "fidelity_level": 3,
    "fidelity_label": "cientifico (integracion RK4 de F=ma; gravedad, resorte de Hooke, amortiguamiento lineal)",
    "supported_components": ["gravity", "spring", "damping"],
    "units": {"mass": "kg", "length": "m", "time": "s", "spring_k": "N/m", "damping_c": "N*s/m"},
    "engine_license": "implementación propia (MIT del proyecto); referencia de validación: myPhysicsLab (Apache-2.0)",
}


def _to_scene(scene: dict) -> solver.PhysicsScene:
    return solver.PhysicsScene(**scene)


def validate(scene: dict) -> dict:
    errors = solver.validate(_to_scene(scene))
    return {"ok": not errors, "errors": errors}


def run(scene: dict) -> dict:
    result = solver.run_mechanics(_to_scene(scene))
    return {
        "adapter": ADAPTER_METADATA["name"],
        "adapter_version": ADAPTER_METADATA["version"],
        "fidelity_level": ADAPTER_METADATA["fidelity_level"],
        **result,
    }
