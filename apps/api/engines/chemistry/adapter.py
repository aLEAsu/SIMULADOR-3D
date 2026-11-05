"""Chemistry engine adapter over the strong acid/base titration solver.

Fidelity level 3 (científico): exact closed-form mole-balance calculation
for fully-dissociated strong acids/bases at 25 °C. Does NOT model weak
acid/base equilibria (Ka/Kb), buffers, or polyprotic species — that is
explicitly out of scope for this adapter, not silently approximated.
"""
from __future__ import annotations

from . import solver

ADAPTER_METADATA = {
    "name": "chemistry-titration-strong",
    "version": "0.2.0",
    "discipline": "chemistry",
    "fidelity_level": 3,
    "fidelity_label": (
        "cientifico (balance de moles exacto para acido/base fuerte; equilibrio acido/base debil "
        "resuelto numericamente por balance de carga exacto cuando se da ka/kb, 25 C)"
    ),
    "supported_components": ["analyte", "titrant", "ka", "kb"],
    "units": {"concentration": "mol/L", "volume": "L", "ka": "adimensional", "kb": "adimensional"},
    "engine_license": "implementación propia (MIT del proyecto) sobre el modelo estándar de titulación ácido-base de química general",
}


def _to_scene(scene: dict) -> solver.TitrationScene:
    return solver.TitrationScene(**scene)


def validate(scene: dict) -> dict:
    errors = solver.validate(_to_scene(scene))
    return {"ok": not errors, "errors": errors}


def run(scene: dict) -> dict:
    result = solver.run_titration(_to_scene(scene))
    return {
        "adapter": ADAPTER_METADATA["name"],
        "adapter_version": ADAPTER_METADATA["version"],
        "fidelity_level": ADAPTER_METADATA["fidelity_level"],
        **result,
    }
