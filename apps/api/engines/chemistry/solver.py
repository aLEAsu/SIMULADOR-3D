"""Strong acid / strong base titration solver — exact mole-balance
calculation (not an animation, not a lookup table).

Model (standard general-chemistry titration curve, fully dissociated
strong acid/base, 25 °C):

    moles_H  = C_analyte * V_analyte   (if analyte is an acid)
    moles_OH = C_titrant * V_titrant_added  (titrant is always the
               opposite type of the analyte — you titrate an acid with a
               base, or a base with an acid)

    net = moles_H - moles_OH
    [H+] = net / V_total            if net > 0
    [OH-] = -net / V_total          if net < 0
    pH = -log10([H+])  or  pH = 14 - (-log10([OH-]))

Kw = 1.0e-14 is the standard textbook equilibrium constant of water at
25 °C (a real, universally cited constant — not invented; see
docs/00-discovery.md's rule against inventing species-specific data,
which this is not: it is a physical constant of water, independent of
species). The equivalence volume (where net == 0 exactly) is computed
in closed form and injected into the series so pH = 7.00 can be checked
exactly, not just approximately via discretization.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

KW_25C = 1.0e-14


class TitrationError(ValueError):
    pass


@dataclass
class TitrationScene:
    analyte_type: str  # "acid" | "base"
    analyte_conc: float  # mol/L
    analyte_volume: float  # L
    titrant_conc: float  # mol/L
    max_titrant_volume: float  # L
    steps: int = 40
    ka: float | None = None  # weak acid equilibrium constant, only when analyte_type == "acid"
    kb: float | None = None  # weak base equilibrium constant, only when analyte_type == "base"


def validate(scene: TitrationScene) -> list[str]:
    errors: list[str] = []
    if scene.analyte_type not in ("acid", "base"):
        errors.append("analyte_type debe ser 'acid' o 'base'.")
    if scene.analyte_conc <= 0:
        errors.append("La concentración del analito debe ser > 0 mol/L.")
    if scene.analyte_volume <= 0:
        errors.append("El volumen del analito debe ser > 0 L.")
    if scene.titrant_conc <= 0:
        errors.append("La concentración del titulante debe ser > 0 mol/L.")
    if scene.max_titrant_volume <= 0:
        errors.append("El volumen máximo de titulante debe ser > 0 L.")
    if not (1 <= scene.steps <= 2000):
        errors.append("steps debe estar entre 1 y 2000.")
    if scene.ka is not None and scene.ka <= 0:
        errors.append("Ka debe ser > 0.")
    if scene.kb is not None and scene.kb <= 0:
        errors.append("Kb debe ser > 0.")
    if scene.analyte_type == "base" and scene.ka is not None:
        errors.append("ka no aplica cuando el analito es una base (usá kb).")
    if scene.analyte_type == "acid" and scene.kb is not None:
        errors.append("kb no aplica cuando el analito es un ácido (usá ka).")
    return errors


def _solve_h_bisection(f, lo_exp: float = -14.0, hi_exp: float = 1.0, iters: int = 200) -> float:
    """f([H+]) is monotonically increasing in [H+] for every charge-balance
    equation used below (more H+ always pushes the LHS of the balance up
    and the RHS down), so a plain bisection on log10([H+]) is exact,
    robust, and needs no initial guess — unlike Newton's method here."""
    lo, hi = lo_exp, hi_exp
    f_lo = f(10 ** lo)
    for _ in range(iters):
        mid = (lo + hi) / 2
        if (f(10 ** mid) > 0) == (f_lo > 0):
            lo = mid
        else:
            hi = mid
    return 10 ** ((lo + hi) / 2)


def _ph_at(scene: TitrationScene, v_titrant: float) -> float:
    total_volume = scene.analyte_volume + v_titrant
    c_analyte = scene.analyte_conc * scene.analyte_volume / total_volume
    c_titrant = scene.titrant_conc * v_titrant / total_volume

    if scene.analyte_type == "acid" and scene.ka is not None:
        # Weak monoprotic acid HA titrated with strong base: exact charge
        # balance [Na+] + [H+] = [OH-] + [A-], with [A-] = C_HA_total *
        # Ka/(Ka+[H+]) (the standard alpha-fraction form). Solved
        # numerically, not via the Henderson-Hasselbalch approximation.
        ka = scene.ka
        def f(h: float) -> float:
            oh = KW_25C / h
            a_minus = c_analyte * ka / (ka + h)
            return (c_titrant + h) - (oh + a_minus)
        h = _solve_h_bisection(f)
        return -math.log10(h)

    if scene.analyte_type == "base" and scene.kb is not None:
        # Weak monoprotic base B titrated with strong acid: exact charge
        # balance [H+] + [BH+] = [OH-] + [X-] (X- = strong-acid
        # counterion), with [BH+] = C_B_total * [H+]/(Ka_conj+[H+]) where
        # Ka_conj = Kw/Kb is the conjugate acid's Ka.
        ka_conj = KW_25C / scene.kb
        def f(h: float) -> float:
            oh = KW_25C / h
            bh_plus = c_analyte * h / (ka_conj + h)
            return (h + bh_plus) - (oh + c_titrant)
        h = _solve_h_bisection(f)
        return -math.log10(h)

    # Strong acid / strong base: exact closed-form mole balance.
    moles_analyte = scene.analyte_conc * scene.analyte_volume
    moles_titrant = scene.titrant_conc * v_titrant
    if scene.analyte_type == "acid":
        net = moles_analyte - moles_titrant  # moles_H - moles_OH
    else:
        net = moles_titrant - moles_analyte  # moles_H(titrant) - moles_OH(analyte)

    if abs(net) < 1e-15:
        return 7.0
    if net > 0:
        h = net / total_volume
        return -math.log10(h)
    oh = -net / total_volume
    poh = -math.log10(oh)
    return 14.0 - poh


def run_titration(scene: TitrationScene) -> dict:
    errors = validate(scene)
    if errors:
        raise TitrationError("; ".join(errors))

    moles_analyte = scene.analyte_conc * scene.analyte_volume
    equivalence_volume = moles_analyte / scene.titrant_conc

    volumes = sorted(
        {round(i * scene.max_titrant_volume / scene.steps, 12) for i in range(scene.steps + 1)}
        | ({round(equivalence_volume, 12)} if 0 <= equivalence_volume <= scene.max_titrant_volume else set())
    )

    series = [
        {"titrant_volume": v, "ph": _ph_at(scene, v), "total_volume": scene.analyte_volume + v}
        for v in volumes
    ]

    return {
        "series": series,
        "equivalence_volume": equivalence_volume,
        "equivalence_in_range": 0 <= equivalence_volume <= scene.max_titrant_volume,
        "kw": KW_25C,
    }
