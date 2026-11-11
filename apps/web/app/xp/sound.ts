/**
 * Diseño sonoro sintetizado con WebAudio: sin archivos de audio (nada que
 * descargar ni licenciar). Cada evento del modelo tiene su firma sonora;
 * se puede silenciar y la preferencia queda en este navegador.
 */
export type Cue = "click" | "send" | "hop" | "deliver" | "fail" | "grip" | "release" | "stall" | "success" | "lens" | "select";

let ctx: AudioContext | null = null;
const KEY = "xp-sound-muted";

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event("xp-sound"));
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t0);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t0 + dur);
  const peak = opts.gain ?? 0.06;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export function play(cue: Cue) {
  if (isMuted()) return;
  switch (cue) {
    case "click": tone(1400, 0.05, { type: "triangle", gain: 0.025 }); break;
    case "select": tone(880, 0.08, { type: "triangle", gain: 0.035 }); break;
    case "send": tone(520, 0.18, { type: "sine", gain: 0.05, slide: 2.2 }); break;
    case "hop": tone(1250, 0.06, { type: "sine", gain: 0.03 }); break;
    case "deliver": [660, 880, 1320].forEach((f, i) => tone(f, 0.22, { gain: 0.045, delay: i * 0.07 })); break;
    case "fail": tone(180, 0.35, { type: "sawtooth", gain: 0.035, slide: 0.6 }); break;
    case "grip": tone(140, 0.12, { type: "square", gain: 0.03, slide: 0.7 }); tone(90, 0.1, { type: "sine", gain: 0.05, delay: 0.03 }); break;
    case "release": tone(240, 0.12, { type: "triangle", gain: 0.03, slide: 1.6 }); break;
    case "stall": tone(110, 0.5, { type: "sawtooth", gain: 0.04 }); tone(116, 0.5, { type: "sawtooth", gain: 0.03 }); break;
    case "success": [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: "triangle", gain: 0.045, delay: i * 0.09 })); break;
    case "lens": tone(300, 0.28, { type: "sine", gain: 0.04, slide: 3 }); break;
  }
}
