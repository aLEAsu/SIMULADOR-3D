"use client";

/**
 * 3D-rendered vertical-plane view of the mechanics scene (same Three.js
 * pipeline as apps/web/app/robotics/ArmScene3D.tsx): the solver only ever
 * sees x, y in its plane — this renders that plane facing the camera and
 * lets you grab the mass (point_mass), the spring anchor, or the pendulum
 * bob and drag them; the backend recomputes on release.
 *
 * The spring is a real wound tube (TubeGeometry along a helix), the
 * pendulum rod a real cylinder, not lines pretending to be objects — per
 * the design brief ("el resorte... debería leerse como un objeto físico").
 * Materials are procedural PBR + a runtime RoomEnvironment (see
 * lib/threeEnvironment.ts), the same explicit decision as the robotics
 * scene: no imported 3D assets.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { applyPBREnvironment, makeKeyLight } from "../lib/threeEnvironment";
import { PhysicsResult, PhysicsScene } from "./types";

interface Props {
  scene: PhysicsScene;
  result: PhysicsResult | null;
  onMassDrag: (x: number, y: number) => void;
  onAnchorDrag: (x: number, y: number) => void;
  onPendulumDrag: (thetaDeg: number) => void;
  onDragEnd: () => void;
  /** True for the brief "energizing" transient between pressing run and the
   * backend answering — pulses the mechanism's own material, never a
   * stand-in for a trajectory the solver hasn't returned. */
  energizing?: boolean;
}

const SCALE = 24;
function toWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * SCALE, y * SCALE, 0);
}
function toSolver(v: THREE.Vector3): [number, number] {
  return [v.x / SCALE, v.y / SCALE];
}

export default function PhysicsScene3D({ scene, result, onMassDrag, onAnchorDrag, onPendulumDrag, onDragEnd, energizing = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ scene, result, onMassDrag, onAnchorDrag, onPendulumDrag, onDragEnd, energizing });
  stateRef.current = { scene, result, onMassDrag, onAnchorDrag, onPendulumDrag, onDragEnd, energizing };

  const groupRef = useRef<THREE.Group | null>(null);
  const massHandleRef = useRef<THREE.Mesh | null>(null);
  const anchorHandleRef = useRef<THREE.Mesh | null>(null);
  const pulseMaterialsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x0a0e18);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 3000);
    camera.position.set(40, 60, 420);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const disposeEnv = applyPBREnvironment(renderer, threeScene);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(40, 60, 0);

    threeScene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1208, 0.6));
    const key = makeKeyLight();
    key.position.set(120, 220, 260);
    key.target.position.set(40, 60, 0);
    threeScene.add(key);
    threeScene.add(key.target);

    const grid = new THREE.GridHelper(600, 30, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2; // make it a vertical backdrop in the XY plane
    threeScene.add(grid);

    // Shadow-catching backdrop behind the action plane — the mechanism casts
    // a real shadow onto it instead of floating with no sense of depth.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 })
    );
    backdrop.position.z = -30;
    backdrop.receiveShadow = true;
    threeScene.add(backdrop);

    const group = new THREE.Group();
    threeScene.add(group);
    groupRef.current = group;

    const massHandle = new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xf87171, emissive: 0xf87171, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1, clearcoat: 0.6 })
    );
    massHandle.castShadow = true;
    threeScene.add(massHandle);
    massHandleRef.current = massHandle;

    const anchorHandle = new THREE.Mesh(
      new THREE.SphereGeometry(8, 20, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0, roughness: 0.3, metalness: 0.5, clearcoat: 0.5 })
    );
    anchorHandle.castShadow = true;
    threeScene.add(anchorHandle);
    anchorHandleRef.current = anchorHandle;

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    let dragging: "mass" | "anchor" | null = null;

    function syncMatrices() {
      camera.updateMatrixWorld(true);
    }

    function toPlanePoint(clientX: number, clientY: number): THREE.Vector3 | null {
      syncMatrices();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
    }

    // Ray-to-point distance instead of exact mesh-triangle intersection:
    // far more forgiving of small pointer/NDC imprecision (scroll drift,
    // sub-pixel rounding) than raycaster.intersectObjects, at the cost of
    // only working for roughly point-like handles — which these are.
    function nearestHandle(candidates: [THREE.Object3D | null, "mass" | "anchor"][], toleranceWorld: number): "mass" | "anchor" | null {
      let best: "mass" | "anchor" | null = null;
      let bestDist = toleranceWorld;
      for (const [obj, tag] of candidates) {
        if (!obj || !obj.visible) continue;
        const toObj = obj.position.clone().sub(raycaster.ray.origin);
        const t = toObj.dot(raycaster.ray.direction);
        if (t < 0) continue; // behind the camera
        const dist = raycaster.ray.distanceToPoint(obj.position);
        if (dist < bestDist) {
          bestDist = dist;
          best = tag;
        }
      }
      return best;
    }

    function handlePointerDown(e: PointerEvent) {
      syncMatrices();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const candidates: [THREE.Object3D | null, "mass" | "anchor"][] = [
        [massHandleRef.current, "mass"],
        [stateRef.current.scene.spring_enabled || stateRef.current.scene.mode === "pendulum" ? anchorHandleRef.current : null, "anchor"],
      ];
      dragging = nearestHandle(candidates, 24);
      if (dragging) {
        controls.enabled = false;
        e.stopPropagation();
      }
    }
    function handlePointerMove(e: PointerEvent) {
      if (!dragging) return;
      const p = toPlanePoint(e.clientX, e.clientY);
      if (!p) return;
      const [x, y] = toSolver(p);
      const st = stateRef.current;
      if (dragging === "mass") {
        if (st.scene.mode === "pendulum") {
          const dx = x - 0, dy = y - 0;
          const theta = Math.atan2(dx, -dy); // 0 = hanging straight down
          st.onPendulumDrag((theta * 180) / Math.PI);
        } else {
          st.onMassDrag(x, y);
        }
      } else {
        st.onAnchorDrag(x, y);
      }
    }
    function handlePointerUp() {
      if (dragging) stateRef.current.onDragEnd();
      dragging = null;
      controls.enabled = true;
    }
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      if (stateRef.current.energizing) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
        for (const mat of pulseMaterialsRef.current) mat.emissiveIntensity = pulse * 1.4;
      } else {
        for (const mat of pulseMaterialsRef.current) mat.emissiveIntensity = 0;
      }
      renderer.render(threeScene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      disposeEnv();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop()!;
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    pulseMaterialsRef.current = [];
    if (massHandleRef.current) pulseMaterialsRef.current.push(massHandleRef.current.material as THREE.MeshPhysicalMaterial);
    if (anchorHandleRef.current) pulseMaterialsRef.current.push(anchorHandleRef.current.material as THREE.MeshPhysicalMaterial);

    function track(mesh: THREE.Mesh) {
      pulseMaterialsRef.current.push(mesh.material as THREE.MeshPhysicalMaterial);
      return mesh;
    }

    if (scene.mode === "point_mass") {
      massHandleRef.current?.position.copy(toWorld(scene.x0, scene.y0));
      if (anchorHandleRef.current) {
        anchorHandleRef.current.visible = scene.spring_enabled;
        anchorHandleRef.current.position.copy(toWorld(scene.spring_anchor_x, scene.spring_anchor_y));
      }
      if (scene.spring_enabled) {
        const a = toWorld(scene.spring_anchor_x, scene.spring_anchor_y);
        const b = toWorld(scene.x0, scene.y0);
        group.add(track(makeSpring(a, b)));
      }
      if (result?.series) {
        const pts = result.series.map((s) => toWorld(s.x, s.y));
        group.add(makeTrail(pts, 0x38bdf8));
      }
    } else if (scene.mode === "pendulum") {
      const pivot = toWorld(0, 0);
      const theta = (scene.pendulum_theta0_deg * Math.PI) / 180;
      const L = scene.pendulum_length * SCALE;
      const bob = new THREE.Vector3(pivot.x + L * Math.sin(theta), pivot.y - L * Math.cos(theta), 0);
      massHandleRef.current?.position.copy(bob);
      if (anchorHandleRef.current) {
        anchorHandleRef.current.visible = true;
        anchorHandleRef.current.position.copy(pivot);
      }
      group.add(track(makeRod(pivot, bob)));
      if (result?.series) {
        const pts = result.series.map((s) => toWorld(s.x, s.y));
        group.add(makeTrail(pts, 0xa78bfa));
      }
    } else {
      // incline: static ramp for visual context, no drag handles
      if (massHandleRef.current) massHandleRef.current.visible = false;
      if (anchorHandleRef.current) anchorHandleRef.current.visible = false;
      // A real wedge (extruded triangle), not a thin floating plate — the
      // hypotenuse sits exactly along the line the solver's point mass moves
      // on, starting at the origin like its real coordinates do.
      const angle = (scene.incline_angle_deg * Math.PI) / 180;
      const len = 10 * SCALE;
      const h = len * Math.tan(angle);
      const depth = 14;
      const wedgeShape = new THREE.Shape();
      wedgeShape.moveTo(0, 0);
      wedgeShape.lineTo(len, 0);
      wedgeShape.lineTo(len, h);
      wedgeShape.lineTo(0, 0);
      const wedgeGeom = new THREE.ExtrudeGeometry(wedgeShape, { depth, bevelEnabled: false });
      wedgeGeom.translate(0, 0, -depth / 2);
      const ramp = new THREE.Mesh(
        wedgeGeom,
        new THREE.MeshPhysicalMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.35, clearcoat: 0.25 })
      );
      ramp.castShadow = true;
      ramp.receiveShadow = true;
      group.add(track(ramp));
      if (result?.series) {
        const pts = result.series.map((s) => toWorld(s.x, s.y));
        group.add(makeTrail(pts, 0xfb923c));
      }
    }
    if (scene.mode !== "incline" && massHandleRef.current) massHandleRef.current.visible = true;
  }, [scene, result]);

  return <div ref={mountRef} style={{ width: "100%", height: 420, borderRadius: 8, overflow: "hidden" }} />;
}

/** A real wound coil (TubeGeometry along a 3D helix) between two points,
 * not a flat zigzag line pretending to be a spring. */
function makeSpring(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const coils = 10;
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(dir.length(), 0.001);
  const axis = dir.clone().normalize();
  const amp = Math.min(6, len * 0.08);
  const arbitrary = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const perp1 = new THREE.Vector3().crossVectors(axis, arbitrary).normalize();
  const perp2 = new THREE.Vector3().crossVectors(axis, perp1).normalize();
  const segments = coils * 16;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = t * coils * Math.PI * 2;
    const taper = t < 0.03 ? t / 0.03 : t > 0.97 ? (1 - t) / 0.03 : 1; // flatten near the ends so it meets the handles cleanly
    const base = new THREE.Vector3().lerpVectors(a, b, t);
    const offset = new THREE.Vector3()
      .addScaledVector(perp1, Math.cos(theta) * amp * taper)
      .addScaledVector(perp2, Math.sin(theta) * amp * taper);
    points.push(base.add(offset));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geom = new THREE.TubeGeometry(curve, segments, 0.8, 8, false);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0, metalness: 0.85, roughness: 0.3, clearcoat: 0.3 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A real cylindrical rod instead of a line — the pendulum arm is a rigid
 * body, not a plotted segment. */
function makeRod(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(dir.length(), 0.001);
  const geom = new THREE.CylinderGeometry(0.9, 0.9, length, 14);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xa78bfa, emissive: 0xa78bfa, emissiveIntensity: 0, metalness: 0.6, roughness: 0.35, clearcoat: 0.4 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

/** The plotted trajectory history — explicitly a data trace, not a
 * physical object, so it stays a glowing line rather than gaining volume. */
function makeTrail(points: THREE.Vector3[], color: number): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
}
