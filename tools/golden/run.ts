/**
 * Prueba de equivalencia TS ↔ Python (Node ≥ 22.6 con type-stripping):
 *
 *   python tools/golden/golden.py > tools/golden/expected.json
 *   node tools/golden/run.ts
 *
 * Compara cada campo calculado. Para la ruta BFS solo se exige igual
 * longitud (Python itera un set; con varias rutas mínimas puede elegir otra).
 */
import { readFileSync } from "node:fs";
import { runTopology } from "../../apps/web/app/lib/engines/networking.ts";
import { solveArm, solveSpatial, forward, DEFAULT_ARM } from "../../apps/web/app/lib/engines/robotics.ts";

const here = new URL(".", import.meta.url);
const scenes = JSON.parse(readFileSync(new URL("scenes.json", here), "utf8"));
const expected = JSON.parse(readFileSync(new URL("expected.json", here), "utf8"));

let failures = 0, checks = 0;
const fail = (m: string) => { failures++; console.error("  ✗ " + m); };
const eq = (label: string, a: unknown, b: unknown) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${label}: TS=${JSON.stringify(a)} PY=${JSON.stringify(b)}`); };
const near = (label: string, a: number, b: number, tol = 1e-9) => { checks++; if (!(Math.abs(a - b) <= tol)) fail(`${label}: TS=${a} PY=${b}`); };

scenes.networking.forEach((s: any, i: number) => {
  console.log(`redes · ${s.name}`);
  const ts = runTopology(s.devices, s.links), py = expected.networking[i];
  eq("ok", ts.ok, true);
  eq("subnets", ts.subnets, py.subnets);
  eq("n pares", ts.reachability.length, py.reachability.length);
  ts.reachability.forEach((p, k) => {
    const q = py.reachability[k];
    for (const f of ["a", "b", "physically_connected", "same_subnet", "hops", "l3_reachable", "reason"] as const) eq(`${p.a}-${p.b}.${f}`, (p as any)[f], q[f]);
    eq(`${p.a}-${p.b}.path.length`, p.path?.length ?? null, q.path?.length ?? null);
  });
});

scenes.robotics.forEach((s: any, i: number) => {
  console.log(`robótica · escena ${i + 1} (${s.l3 ? 3 : 2} eslabones, codo ${s.elbow})`);
  const ts: any = solveArm(s), py = expected.robotics[i];
  for (const k of Object.keys(py)) {
    if (typeof py[k] === "number") near(k, ts[k], py[k], k.includes("error") ? 1e-9 : 1e-9);
    else if (py[k] && typeof py[k] === "object") for (const kk of Object.keys(py[k])) near(`${k}.${kk}`, ts[k][kk], py[k][kk]);
  }
});

console.log("robótica espacial · ida y vuelta IK→FK");
for (const [x, y, z] of [[0.6, 0.1, 0.3], [0.2, 0.5, -0.6], [-0.5, 0.2, 0.4]]) {
  const s = solveSpatial(DEFAULT_ARM, x, y, z, -90, "up");
  if (!s.joints) { fail(`sin solución para ${x},${y},${z}: ${s.reason}`); continue; }
  const t = forward(DEFAULT_ARM, s.joints).tool;
  near(`FK(${x},${y},${z})`, Math.hypot(t[0] - x, t[1] - y, t[2] - z), 0, 1e-12);
}

console.log(`\n${checks - failures}/${checks} comprobaciones superadas`);
process.exit(failures ? 1 : 0);
