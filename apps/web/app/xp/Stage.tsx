"use client";

/**
 * Escenario 3D compartido: renderer ACES, sombras suaves, entorno de estudio
 * generado en tiempo de ejecución con Lightformers (nada descargado: misma
 * regla del proyecto que lib/threeEnvironment.ts) y post-procesado
 * cinematográfico (bloom solo en lo emisivo + viñeta).
 *
 * Bloom con luminanceThreshold alto: solo brilla lo que el modelo marca como
 * "vivo" (paquetes, corriente, objetivos), nunca la escena entera.
 */
import { Component, ReactNode, Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

interface Props {
  children: ReactNode;
  camera?: { position: [number, number, number]; fov?: number; near?: number; far?: number };
  background?: string;
  fog?: [number, number];
  bloom?: number;
  onPointerMissed?: (e: MouseEvent) => void;
  className?: string;
}

export function StudioEnvironment({ intensity = 1 }: { intensity?: number }) {
  return (
    <Environment resolution={256} frames={1}>
      <group rotation={[-Math.PI / 3, 0, 0]}>
        <Lightformer form="rect" intensity={2.2 * intensity} position={[0, 5, -9]} scale={[10, 10, 1]} color="#cfe0ff" />
        <Lightformer form="rect" intensity={1.4 * intensity} position={[-6, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1.6, 1]} color="#ffd9a0" />
        <Lightformer form="rect" intensity={1.0 * intensity} position={[6, -1, -1]} rotation-y={-Math.PI / 2} scale={[20, 0.8, 1]} color="#8fe9ff" />
      </group>
    </Environment>
  );
}

function hasWebGL(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

function NoGL({ detail }: { detail?: string }) {
  return (
    <div className="xp-nogl" role="alert">
      <div>
        <p className="xp-eyebrow" style={{ justifyContent: "center" }}><i /> Gráficos 3D no disponibles</p>
        <h2 className="xp-h2">Este equipo no pudo iniciar WebGL</h2>
        <p className="xp-p xp-muted">Activa la aceleración por hardware del navegador o prueba con Chrome, Edge o Firefox actualizados. Los paneles de la misión siguen funcionando.</p>
        {detail && <p className="xp-p xp-small xp-mono xp-muted" style={{ marginTop: 10 }}>{detail}</p>}
      </div>
    </div>
  );
}

/** Si el render 3D falla (contexto perdido, shader, GPU), se muestra un aviso en vez de una pantalla en blanco. */
class GLBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() { return this.state.error ? <NoGL detail={this.state.error} /> : this.props.children; }
}

export default function Stage(props: Props) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => { setGl(hasWebGL()); }, []);
  if (gl === false) return <div className="xp-canvas"><NoGL /></div>;
  if (gl === null) return <div className="xp-canvas" />;
  return <GLBoundary><StageCanvas {...props} /></GLBoundary>;
}

function StageCanvas({ children, camera, background = "#04060c", fog, bloom = 0.9, onPointerMissed, className }: Props) {
  // Calidad adaptativa: si los FPS caen, menos resolución y sin post-proceso;
  // la simulación es la misma, solo cambia el costo de dibujarla.
  const [dpr, setDpr] = useState(1.5);
  const [fx, setFx] = useState(true);
  return (
    <div className={`xp-canvas ${className ?? ""}`}>
      <Canvas
        shadows
        dpr={dpr}
        camera={{ position: camera?.position ?? [6, 5, 8], fov: camera?.fov ?? 42, near: camera?.near ?? 0.05, far: camera?.far ?? 400 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: "high-performance" }}
        onPointerMissed={onPointerMissed}
      >
        <color attach="background" args={[background]} />
        {fog && <fog attach="fog" args={[background, fog[0], fog[1]]} />}
        <AdaptiveDpr pixelated={false} />
        <PerformanceMonitor flipflops={3} onIncline={() => setDpr(1.75)}
          onDecline={() => setDpr((d) => { if (d <= 1) setFx(false); return 1; })} onFallback={() => { setDpr(1); setFx(false); }} />
        <Suspense fallback={null}>
          <StudioEnvironment />
          {children}
        </Suspense>
        {fx && (
          <EffectComposer multisampling={4} enableNormalPass={false}>
            <Bloom mipmapBlur intensity={bloom} luminanceThreshold={0.85} luminanceSmoothing={0.2} radius={0.7} />
            <Vignette eskil={false} offset={0.18} darkness={0.72} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
