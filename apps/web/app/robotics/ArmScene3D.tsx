"use client";

/**
 * 3D-rendered view of the (strictly planar) robotic arm: the math is
 * exactly the same 2D kinematics as before (solver.py only ever sees
 * x, y, and an optional orientation), this just renders the links as
 * solid 3D bars on a ground plane and lets you grab the end-effector
 * target (and, in 3-link mode, its orientation handle) and drag it —
 * same Three.js pipeline as apps/web/app/anatomy/AnatomyViewer.tsx.
 * Solver plane (x, y) maps to Three.js ground plane (x, -z), height 0.
 *
 * Materials are procedural PBR (MeshPhysicalMaterial + a runtime-generated
 * RoomEnvironment, see lib/threeEnvironment.ts), not imported models —
 * explicit decision in docs/03-design-system.md §4, consistent with the
 * project's standing rule against 3D assets of uncertain license.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { applyPBREnvironment, makeKeyLight } from "../lib/threeEnvironment";
import { ArmResult, ArmScene } from "./types";

interface Props {
  scene: ArmScene;
  result: ArmResult | null;
  onTargetDrag: (x: number, y: number) => void;
  onPhiDrag: (phiDeg: number) => void;
  onDragEnd: () => void;
  /** True for the brief "energizing" transient between pressing run and the
   * backend answering — pulses the arm's own material, never a stand-in
   * for a pose the solver hasn't returned. */
  energizing?: boolean;
}

const SCALE = 20; // world units per solver unit, purely visual

function toWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * SCALE, 0, -y * SCALE);
}
function toSolver(v: THREE.Vector3): [number, number] {
  return [v.x / SCALE, -v.z / SCALE];
}

function makeBone(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(dir.length(), 0.001);
  const geom = new THREE.CylinderGeometry(radius, radius, length, 20);
  const mat = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.32, metalness: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.25 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

function makeJoint(color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 20, 20),
    new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.3, metalness: 0.8, clearcoat: 0.5 })
  );
  mesh.castShadow = true;
  return mesh;
}

export default function ArmScene3D({ scene, result, onTargetDrag, onPhiDrag, onDragEnd, energizing = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    scene: ArmScene; result: ArmResult | null;
    onTargetDrag: typeof onTargetDrag; onPhiDrag: typeof onPhiDrag; onDragEnd: typeof onDragEnd;
    energizing: boolean;
  }>({ scene, result, onTargetDrag, onPhiDrag, onDragEnd, energizing });
  stateRef.current = { scene, result, onTargetDrag, onPhiDrag, onDragEnd, energizing };

  const groupRef = useRef<THREE.Group | null>(null);
  const targetHandleRef = useRef<THREE.Mesh | null>(null);
  const phiHandleRef = useRef<THREE.Mesh | null>(null);
  const boneMaterialsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x0a0e18);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(140, 160, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const disposeEnv = applyPBREnvironment(renderer, threeScene);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    threeScene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1208, 0.6));
    const key = makeKeyLight();
    key.position.set(150, 220, 120);
    key.shadow.camera.left = -220;
    key.shadow.camera.right = 220;
    key.shadow.camera.top = 220;
    key.shadow.camera.bottom = -220;
    threeScene.add(key);

    const grid = new THREE.GridHelper(400, 20, 0x334155, 0x1e293b);
    threeScene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(220, 48),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    threeScene.add(floor);

    const group = new THREE.Group();
    threeScene.add(group);
    groupRef.current = group;

    const targetHandle = new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xf87171, emissive: 0x7f1d1d, roughness: 0.25, metalness: 0.1, clearcoat: 0.6 })
    );
    targetHandle.castShadow = true;
    threeScene.add(targetHandle);
    targetHandleRef.current = targetHandle;

    const phiHandle = new THREE.Mesh(
      new THREE.ConeGeometry(3.5, 8, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.4, clearcoat: 0.5 })
    );
    phiHandle.castShadow = true;
    threeScene.add(phiHandle);
    phiHandleRef.current = phiHandle;

    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let dragging: "target" | "phi" | null = null;

    // requestAnimationFrame (and with it, the camera's matrixWorld refresh
    // that OrbitControls.update() normally does every frame) pauses whenever
    // this tab/pane is backgrounded. A pointerdown right after regaining
    // focus — before a new frame has run — would raycast against a stale
    // camera matrix and miss. Forcing an update here makes hit-testing
    // correct regardless of the render loop's own timing.
    function syncMatrices() {
      camera.updateMatrixWorld(true);
    }

    function pointerToGround(clientX: number, clientY: number): THREE.Vector3 | null {
      syncMatrices();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
    }

    // Ray-to-point distance instead of exact mesh-triangle intersection:
    // far more forgiving of small pointer/NDC imprecision (scroll drift,
    // sub-pixel rounding, stale layout between measurement and event) than
    // raycaster.intersectObjects, at the cost of only working for roughly
    // point-like handles — which these are.
    function nearestHandle(candidates: [THREE.Object3D | null, "target" | "phi"][], toleranceWorld: number): "target" | "phi" | null {
      let best: "target" | "phi" | null = null;
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
      dragging = nearestHandle([[targetHandleRef.current, "target"], [phiHandleRef.current, "phi"]], 24);
      if (dragging) {
        controls.enabled = false;
        e.stopPropagation();
      }
    }
    function handlePointerMove(e: PointerEvent) {
      if (!dragging) return;
      const ground = pointerToGround(e.clientX, e.clientY);
      if (!ground) return;
      if (dragging === "target") {
        const [x, y] = toSolver(ground);
        stateRef.current.onTargetDrag(x, y);
      } else {
        const t = stateRef.current.scene;
        const tx = t.target_x * SCALE, tz = -t.target_y * SCALE;
        const phi = Math.atan2(-(ground.z - tz), ground.x - tx);
        stateRef.current.onPhiDrag((phi * 180) / Math.PI);
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
        for (const mat of boneMaterialsRef.current) mat.emissiveIntensity = pulse * 1.4;
      } else {
        for (const mat of boneMaterialsRef.current) mat.emissiveIntensity = 0;
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

  // Rebuild the arm geometry + handle positions whenever the scene/result change.
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
    boneMaterialsRef.current = [];

    const base = toWorld(0, 0);
    const baseMesh = new THREE.Mesh(new THREE.SphereGeometry(3.5, 20, 20), new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.6, clearcoat: 0.5 }));
    baseMesh.castShadow = true;
    group.add(baseMesh);

    function trackBone(mesh: THREE.Mesh) {
      boneMaterialsRef.current.push(mesh.material as THREE.MeshPhysicalMaterial);
      return mesh;
    }

    if (result) {
      const j1 = toWorld(result.joint1.x, result.joint1.y);
      group.add(trackBone(makeBone(base, j1, 2.2, 0x38bdf8)));
      const joint1 = makeJoint(0x38bdf8);
      joint1.translateX(j1.x).translateZ(j1.z);
      group.add(trackBone(joint1));

      if (result.link_count === 3 && result.joint2) {
        const j2 = toWorld(result.joint2.x, result.joint2.y);
        const ee = toWorld(result.end_effector.x, result.end_effector.y);
        group.add(trackBone(makeBone(j1, j2, 2.2, 0xa78bfa)));
        const joint2 = makeJoint(0xa78bfa);
        joint2.translateX(j2.x).translateZ(j2.z);
        group.add(trackBone(joint2));
        group.add(trackBone(makeBone(j2, ee, 1.8, 0xf472b6)));
      } else {
        const ee = toWorld(result.end_effector.x, result.end_effector.y);
        group.add(trackBone(makeBone(j1, ee, 2.2, 0xa78bfa)));
      }
    }

    if (targetHandleRef.current) {
      const p = toWorld(scene.target_x, scene.target_y);
      targetHandleRef.current.position.set(p.x, 2, p.z);
    }
    if (phiHandleRef.current) {
      const has3 = scene.l3 != null && scene.l3 > 0;
      phiHandleRef.current.visible = has3;
      if (has3) {
        const phi = ((scene.target_phi_deg ?? 0) * Math.PI) / 180;
        const tp = toWorld(scene.target_x, scene.target_y);
        const handleDist = (scene.l3 ?? 1) * SCALE * 0.5;
        phiHandleRef.current.position.set(tp.x + Math.cos(phi) * handleDist, 2, tp.z - Math.sin(phi) * handleDist);
      }
    }
  }, [scene, result]);

  return <div ref={mountRef} style={{ width: "100%", height: 420, borderRadius: 8, overflow: "hidden" }} />;
}
