"""Physics engine adapter over the RK4 point-mass mechanics solver."""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "physics-mechanics-rk4",
    "version": "0.2.0",
    "discipline": "physics",
    "fidelity_level": 3,
    "fidelity_label": (
        "cientifico (integracion RK4; point_mass con gravedad/resorte/amortiguamiento, "
        "pendulo no lineal, plano inclinado con friccion cinetica; multi-cuerpo = N cuerpos "
        "independientes resueltos con el mismo integrador)"
    ),
    "supported_components": ["gravity", "spring", "damping", "pendulum", "incline", "bodies"],
    "units": {
        "mass": "kg", "length": "m", "time": "s", "spring_k": "N/m", "damping_c": "N*s/m (point_mass) o 1/s (pendulum)",
        "incline_angle_deg": "grados", "incline_friction_mu": "adimensional",
    },
    "engine_license": "implementación propia (MIT del proyecto); referencia de validación: myPhysicsLab (Apache-2.0)",
}


def _to_scene(scene: dict) -> solver.PhysicsScene:
    scene = dict(scene)
    bodies = scene.pop("bodies", None)
    result = solver.PhysicsScene(**scene)
    if bodies is not None:
        result.bodies = [_to_scene(b) for b in bodies]
    return result


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
