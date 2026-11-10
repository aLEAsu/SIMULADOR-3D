"""Genera resultados de referencia con los solvers Python (fuente original).

    python tools/golden/golden.py > tools/golden/expected.json
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from engines.networking import adapter as net  # noqa: E402
from engines.robotics import solver as rob  # noqa: E402

scenes = json.loads((Path(__file__).parent / "scenes.json").read_text(encoding="utf-8"))
out = {"networking": [], "robotics": []}
for s in scenes["networking"]:
    out["networking"].append(net.run({"devices": s["devices"], "links": s["links"]}))
for s in scenes["robotics"]:
    out["robotics"].append(rob.solve_arm(rob.ArmScene(**s)))
print(json.dumps(out, indent=1))
