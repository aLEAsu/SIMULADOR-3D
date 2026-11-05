"use client";

import { ArmResult, Point } from "./types";

const W = 360;
const H = 360;

export default function ArmDiagram({ result }: { result: ArmResult }) {
  const maxReach = result.workspace.r_max * 1.15;
  const scale = (W / 2 - 20) / maxReach;
  const cx = W / 2;
  const cy = H / 2;

  const toScreen = (p: Point) => ({ x: cx + p.x * scale, y: cy - p.y * scale });
  const base = toScreen({ x: 0, y: 0 });
  const joint1 = toScreen(result.joint1);
  const endEff = toScreen(result.end_effector);
  const target = toScreen(result.target);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ maxWidth: 400 }}>
      <circle cx={cx} cy={cy} r={result.workspace.r_max * scale} fill="none" stroke="#1e293b" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={result.workspace.r_min * scale} fill="none" stroke="#1e293b" strokeWidth={1} />
      <line x1={base.x} y1={base.y} x2={joint1.x} y2={joint1.y} stroke="#38bdf8" strokeWidth={5} strokeLinecap="round" />
      <line x1={joint1.x} y1={joint1.y} x2={endEff.x} y2={endEff.y} stroke="#a78bfa" strokeWidth={5} strokeLinecap="round" />
      <circle cx={base.x} cy={base.y} r={7} fill="#0b1220" stroke="#e2e8f0" strokeWidth={2} />
      <circle cx={joint1.x} cy={joint1.y} r={6} fill="#0b1220" stroke="#38bdf8" strokeWidth={2} />
      <circle cx={endEff.x} cy={endEff.y} r={6} fill="#4ade80" />
      <circle cx={target.x} cy={target.y} r={8} fill="none" stroke="#f87171" strokeWidth={2} />
      <text x={base.x} y={base.y + 20} fontSize={9} fill="#94a3b8" textAnchor="middle">base</text>
      <text x={target.x} y={target.y - 12} fontSize={9} fill="#f87171" textAnchor="middle">objetivo</text>
    </svg>
  );
}
