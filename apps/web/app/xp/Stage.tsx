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
import { ReactNode, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Lightformer } from "@react-three/drei";
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
        <Lightformer form="ring" intensity={0.8 * intensity} position={[0, 6, 4]} scale={4} color="#ffffff" />
      </group>
    </Environment>
  );
}

export default function Stage({ children, camera, background = "#04060c", fog, bloom = 0.9, onPointerMissed, className }: Props) {
  return (
    <div className={`xp-canvas ${className ?? ""}`}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: camera?.position ?? [6, 5, 8], fov: camera?.fov ?? 42, near: camera?.near ?? 0.05, far: camera?.far ?? 400 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: "high-performance" }}
        onPointerMissed={onPointerMissed}
      >
        <color attach="background" args={[background]} />
        {fog && <fog attach="fog" args={[background, fog[0], fog[1]]} />}
        <AdaptiveDpr pixelated={false} />
        <Suspense fallback={null}>
          <StudioEnvironment />
          {children}
        </Suspense>
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={bloom} luminanceThreshold={0.85} luminanceSmoothing={0.2} radius={0.7} />
          <Vignette eskil={false} offset={0.18} darkness={0.72} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
