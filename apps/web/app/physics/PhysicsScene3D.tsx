"use client";

/**
 * 3D-rendered vertical-plane view of the mechanics scene (same Three.js
 * pipeline as apps/web/app/robotics/ArmScene3D.tsx): the solver only ever
 * sees x, y in its plane — this renders that plane facing the camera and
 * lets you grab the mass (point_mass), the spring anchor, or the pendulum
 * bob and drag them; the backend recomputes on release.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PhysicsResult, PhysicsScene } from "./types";

interface Props {
  scene: PhysicsScene;
  result: PhysicsResult | null;
  onMassDrag: (x: number, y: number) => void;
  onAnchorDrag: (x: number, y: number) => void;
  onPendulumDrag: (thetaDeg: number) => void;
  onDragEnd: () => void;
}

const SCALE = 24;
function toWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * SCALE, y * SCALE, 0);
}
function toSolver(v: THREE.Vector3): [number, number] {
  return [v.x / SCALE, v.y / SCALE];
}

export default function PhysicsScene3D({ scene, result, onMassDrag, onAnchorDrag, onPendulumDrag, onDragEnd }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ scene, result, onMassDrag, onAnchorDrag, onPendulumDrag, onDragEnd });
  stateRef.current = { scene, result, onMassDrag, onAnchorDrag, onPendulumDrag, onDragEnd };

  const groupRef = useRef<THREE.Group | null>(null);
  const massHandleRef = useRef<THREE.Mesh | null>(null);
  const anchorHandleRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x0b1220);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 3000);
    camera.position.set(40, 60, 420);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(40, 60, 0);

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(100, 200, 200);
    threeScene.add(key);

    const grid = new THREE.GridHelper(600, 30, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2; // make it a vertical backdrop in the XY plane
    threeScene.add(grid);

    const group = new THREE.Group();
    threeScene.add(group);
    groupRef.current = group;

    const massHandle = new THREE.Mesh(
      new THREE.SphereGeometry(10, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xf87171, emissive: 0x7f1d1d })
    );
    threeScene.add(massHandle);
    massHandleRef.current = massHandle;

    const anchorHandle = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x78350f })
    );
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

    if (scene.mode === "point_mass") {
      massHandleRef.current?.position.copy(toWorld(scene.x0, scene.y0));
      if (anchorHandleRef.current) {
        anchorHandleRef.current.visible = scene.spring_enabled;
        anchorHandleRef.current.position.copy(toWorld(scene.spring_anchor_x, scene.spring_anchor_y));
      }
      if (scene.spring_enabled) {
        const a = toWorld(scene.spring_anchor_x, scene.spring_anchor_y);
        const b = toWorld(scene.x0, scene.y0);
        group.add(makeSpring(a, b));
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
      group.add(makeRod(pivot, bob));
      if (result?.series) {
        const pts = result.series.map((s) => toWorld(s.x, s.y));
        group.add(makeTrail(pts, 0xa78bfa));
      }
    } else {
      // incline: static ramp for visual context, no drag handles
      if (massHandleRef.current) massHandleRef.current.visible = false;
      if (anchorHandleRef.current) anchorHandleRef.current.visible = false;
      const angle = (scene.incline_angle_deg * Math.PI) / 180;
      const len = 10 * SCALE;
      const ramp = new THREE.Mesh(
        new THREE.PlaneGeometry(len, 2),
        new THREE.MeshStandardMaterial({ color: 0x334155, side: THREE.DoubleSide })
      );
      ramp.position.set((len / 2) * Math.cos(angle), (len / 2) * Math.sin(angle), 0);
      ramp.rotation.z = angle;
      group.add(ramp);
      if (result?.series) {
        const pts = result.series.map((s) => toWorld(s.x, s.y));
        group.add(makeTrail(pts, 0xfb923c));
      }
    }
    if (scene.mode !== "incline" && massHandleRef.current) massHandleRef.current.visible = true;
  }, [scene, result]);

  return <div ref={mountRef} style={{ width: "100%", height: 420, borderRadius: 8, overflow: "hidden" }} />;
}

function makeSpring(a: THREE.Vector3, b: THREE.Vector3): THREE.Line {
  const points: THREE.Vector3[] = [];
  const coils = 10;
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(Math.min(6, len * 0.08));
  for (let i = 0; i <= coils * 2; i++) {
    const t = i / (coils * 2);
    const base = new THREE.Vector3().lerpVectors(a, b, t);
    const offset = i === 0 || i === coils * 2 ? 0 : i % 2 === 0 ? 1 : -1;
    points.push(base.add(perp.clone().multiplyScalar(offset)));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xfbbf24 }));
}

function makeRod(a: THREE.Vector3, b: THREE.Vector3): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xa78bfa, linewidth: 2 }));
}

function makeTrail(points: THREE.Vector3[], color: number): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
}
