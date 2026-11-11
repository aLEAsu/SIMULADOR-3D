"use client";

/**
 * Cuerpo multicapa: cuatro sistemas de Z-Anatomy (derivados de BodyParts3D)
 * que comparten el mismo espacio de coordenadas (metros, figura ≈ 1,8 m),
 * por lo que se superponen sin recentrar cada modelo.
 *
 * Identidad de estructura: nombre ORIGINAL del nodo glTF (userData.name),
 * no el nombre saneado por GLTFLoader — así se conserva la lateralidad
 * (.l/.r) y la nomenclatura de la fuente. Ningún dato de la ficha se inventa
 * a partir del nombre: lateralidad = sufijo de la fuente, grupo funcional =
 * nombre de material que asigna Z-Anatomy, medidas = caja envolvente real.
 */
import { MutableRefObject, Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type LayerId = "muscular" | "nervous" | "cardiovascular" | "skeletal";
export interface LayerDef { id: LayerId; label: string; url: string; color: string; }
export const LAYERS: LayerDef[] = [
  { id: "muscular", label: "Muscular", url: "/models/anatomy/muscular-system.glb", color: "#ff7a59" },
  { id: "nervous", label: "Nervioso", url: "/models/anatomy/nervous-system.glb", color: "#ffd166" },
  { id: "cardiovascular", label: "Cardiovascular", url: "/models/anatomy/cardiovascular-system.glb", color: "#ff4d6d" },
  { id: "skeletal", label: "Óseo", url: "/models/anatomy/skeletal-system.glb", color: "#efe6cf" },
];

export interface Structure { key: string; name: string; base: string; side: "izquierda" | "derecha" | null; layer: LayerId; material: string; }
export interface LayerState { visible: boolean; opacity: number; }

export interface Registry {
  byKey: Map<string, { s: Structure; meshes: THREE.Mesh[] }>;
  ready: Set<LayerId>;
}

const ATTACHMENT = /^(origin|end|insertion)/i;

/** Convención visual de atlas (no es dato de la fuente: solo color). */
export function atlasColor(layer: LayerId, mat: string): string {
  const n = mat.toLowerCase();
  if (/tendon|aponeur|ligament|fascia/.test(n)) return "#e9dcc4";
  if (/cartilage|disc/.test(n)) return "#9fc3d6";
  if (layer === "skeletal") return /^origin/.test(n) ? "#d9534f" : /^end/.test(n) ? "#3f7fd9" : "#eadfc6";
  if (layer === "muscular") return "#b5473c";
  if (layer === "cardiovascular") return /vein/.test(n) ? (/pulmonary/.test(n) ? "#d23b4a" : "#3d5fbf") : /pulmonary artery/.test(n) ? "#4d6ad0" : "#cf2f3c";
  if (layer === "nervous") return /lcr/.test(n) ? "#8fd3ff" : /brain|lobe|gyr|cortex|cerebell|nucleus|matter/.test(n) ? "#e9b7a8" : "#f2cf5b";
  return "#cccccc";
}

export function baseName(n: string) {
  return n.replace(/(\.\d{3})+$/, "").replace(/\.(l|r|j|i|g|t|o\d?[lr]?|e[lr]?)$/i, "").trim();
}
export function sideOf(n: string): Structure["side"] {
  const m = n.replace(/(\.\d{3})+$/, "").match(/\.(o\d?|e)?([lr])$/i);
  return m ? (m[2].toLowerCase() === "l" ? "izquierda" : "derecha") : null;
}

const highlightMat = new THREE.MeshPhysicalMaterial({ color: "#ffb547", emissive: "#ff9a1f", emissiveIntensity: 0.9, roughness: 0.35, clearcoat: 0.6 });
const targetMat = new THREE.MeshPhysicalMaterial({ color: "#5df2a5", emissive: "#2bd685", emissiveIntensity: 1.1, roughness: 0.35 });

function ghostMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_vertex>
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
      #include <clipping_planes_vertex>
      gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_fragment>
      void main(){
      #include <clipping_planes_fragment>
      float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(uColor * (0.25 + f*1.6), 0.04 + f*0.55); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, clipping: true,
  });
}

function Layer({ def, state, registry, lens, selected, target, showAttachments, isolate, onPick, onReady }: {
  def: LayerDef; state: LayerState; registry: MutableRefObject<Registry>; lens: boolean; selected: string | null; target: string | null;
  showAttachments: boolean; isolate: string | null; onPick: (key: string, e: ThreeEvent<MouseEvent>) => void; onReady: (id: LayerId) => void;
}) {
  const { scene } = useGLTF(def.url, "/draco/");
  const ghost = useMemo(() => ghostMaterial(def.color), [def.color]);
  const meshes = useRef<THREE.Mesh[]>([]);
  const origMats = useRef(new Map<THREE.Mesh, THREE.Material | THREE.Material[]>());

  // indexado (una vez por capa)
  useEffect(() => {
    const list: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const named = (x: THREE.Object3D | null): THREE.Object3D | null => (x && (x.userData?.name ? x : named(x.parent)));
      if (o.userData?.name && /^Cross Section/i.test(o.userData.name)) { o.visible = false; return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const owner = named(m) ?? m;
      const name: string = owner.userData?.name ?? m.name;
      const matName = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? "";
      // Z-Anatomy incluye líneas guía de etiquetas (sufijos .j / .i): no son
      // estructuras anatómicas, se ocultan y no entran al catálogo.
      if (/^Cross Section/i.test(name) || /\.(j|i)(\.\d{3})?$/i.test(name)) { m.visible = false; m.userData.skip = true; return; }
      m.userData.structure = `${def.id}::${name}`;
      m.userData.attachment = def.id === "skeletal" && ATTACHMENT.test(matName);
      m.castShadow = false; m.receiveShadow = false;
      origMats.current.set(m, m.material);
      // materiales a PBR coherente con la escena (se conservan color y nombre)
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      // El FBX→GLB pierde los colores de la fuente (todos gris 0.8): se aplica
      // la convención de color de atlas según el NOMBRE de material de la fuente.
      mats.forEach((mt) => { const s = mt as THREE.MeshStandardMaterial; if (s.isMeshStandardMaterial) { s.color.set(atlasColor(def.id, s.name)); s.userData.veil = /fascia|aponeur/i.test(s.name); s.roughness = 0.5; s.metalness = 0.05; s.envMapIntensity = 0.7; } });
      list.push(m);
      const key = m.userData.structure as string;
      const entry = registry.current.byKey.get(key);
      if (entry) entry.meshes.push(m);
      else registry.current.byKey.set(key, { s: { key, name, base: baseName(name), side: sideOf(name), layer: def.id, material: matName.replace(/\.\d{3}$/, "").replace(/-\d+$/, "") }, meshes: [m] });
    });
    meshes.current = list;
    registry.current.ready.add(def.id);
    onReady(def.id);
  }, [scene, def.id, registry, onReady]);

  // opacidad de capa sobre materiales originales
  useEffect(() => {
    const seen = new Set<THREE.Material>();
    origMats.current.forEach((mat) => (Array.isArray(mat) ? mat : [mat]).forEach((mt) => {
      if (seen.has(mt)) return; seen.add(mt);
      // fascias/aponeurosis: velo translúcido para que se lea el músculo debajo
      const op = state.opacity * (mt.userData.veil ? 0.22 : 1);
      mt.transparent = op < 0.999; mt.opacity = op; mt.depthWrite = op > 0.6; mt.needsUpdate = true;
    }));
  }, [state.opacity]);

  // asignación de material por malla (selección / objetivo / lente)
  useEffect(() => {
    for (const m of meshes.current) {
      const key = m.userData.structure as string;
      const att = m.userData.attachment as boolean;
      m.visible = isolate ? key === isolate : !att || showAttachments;
      if (key === selected) m.material = highlightMat;
      else if (key === target) m.material = targetMat;
      else if (lens) m.material = ghost;
      else m.material = origMats.current.get(m)!;
    }
  }, [lens, selected, target, ghost, showAttachments, isolate]);

  return (
    <primitive object={scene} visible={state.visible}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const m = e.intersections.find((h) => h.object.visible && (h.object as THREE.Mesh).isMesh && isVisibleChain(h.object))?.object;
        if (!m || m !== e.object) return;
        e.stopPropagation();
        onPick(m.userData.structure, e);
      }} />
  );
}

function isVisibleChain(o: THREE.Object3D | null): boolean { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }

/** Lleva cámara y objetivo de órbita hacia un foco con amortiguación. */
function CameraRig({ focus, controls }: { focus: { center: THREE.Vector3; radius: number; id: number } | null; controls: MutableRefObject<any> }) {
  const { camera } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3; t: number } | null>(null);
  useEffect(() => {
    if (!focus || !controls.current) return;
    const dir = camera.position.clone().sub(controls.current.target).normalize();
    const dist = Math.max(0.25, focus.radius * 3.2);
    goal.current = { pos: focus.center.clone().add(dir.multiplyScalar(dist)), tgt: focus.center.clone(), t: 0 };
  }, [focus, camera, controls]);
  useFrame((_, dt) => {
    const g = goal.current; if (!g || !controls.current) return;
    g.t += dt; const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(g.pos, k); controls.current.target.lerp(g.tgt, k); controls.current.update();
    if (g.t > 2) goal.current = null;
  });
  return null;
}

function Clipper({ plane, enabled }: { plane: THREE.Plane; enabled: boolean }) {
  const { gl } = useThree();
  useEffect(() => { gl.clippingPlanes = enabled ? [plane] : []; return () => { gl.clippingPlanes = []; }; }, [gl, plane, enabled]);
  return null;
}

export default function AnatomyScene({ layers, registry, lens, selected, target, showAttachments, isolate, focus, clip, onPick, onReady }: {
  layers: Record<LayerId, LayerState>; registry: MutableRefObject<Registry>; lens: boolean; selected: string | null; target: string | null;
  showAttachments: boolean; isolate: string | null; focus: { center: THREE.Vector3; radius: number; id: number } | null;
  clip: { enabled: boolean; plane: THREE.Plane };
  onPick: (key: string, e: ThreeEvent<MouseEvent>) => void; onReady: (id: LayerId) => void;
}) {
  const controls = useRef<any>(null);
  return (
    <>
      <OrbitControls ref={controls} makeDefault target={[0, 0.98, 0]} minDistance={0.15} maxDistance={5} enableDamping />
      <CameraRig focus={focus} controls={controls} />
      <Clipper plane={clip.plane} enabled={clip.enabled} />
      <hemisphereLight args={["#c8d6ff", "#1a120a", 0.55]} />
      <directionalLight position={[2, 3, 2.5]} intensity={2.2} />
      <directionalLight position={[-2.5, 1.5, -2]} intensity={1.2} color="#8fe9ff" />
      <spotLight position={[0, 4, 0]} angle={0.5} penumbra={1} intensity={8} color="#ffd9a0" />
      {/* plataforma */}
      <mesh position={[0, -0.01, 0]} receiveShadow><cylinderGeometry args={[0.55, 0.6, 0.02, 96]} /><meshPhysicalMaterial color="#0b111c" metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.53, 0.545, 128]} /><meshStandardMaterial color="#000" emissive="#5ee7ff" emissiveIntensity={2} toneMapped={false} /></mesh>
      {LAYERS.map((def) => (
        <Suspense key={def.id} fallback={null}>
          <Layer def={def} state={layers[def.id]} registry={registry} lens={lens} selected={selected} target={target}
            showAttachments={showAttachments} isolate={isolate} onPick={onPick} onReady={onReady} />
        </Suspense>
      ))}
    </>
  );
}

export function structureBounds(registry: Registry, key: string) {
  const e = registry.byKey.get(key); if (!e) return null;
  const box = new THREE.Box3();
  e.meshes.forEach((m) => { m.updateWorldMatrix(true, false); box.expandByObject(m); });
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  return { box, size, center, radius: size.length() / 2 };
}
