"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface Props {
  modelUrl: string;
  onLoaded: (meshNames: string[]) => void;
  onLoadError: (message: string) => void;
  selected: string | null;
  onSelect: (name: string | null) => void;
}

export default function AnatomyViewer({ modelUrl, onLoaded, onLoadError, selected, onSelect }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Several meshes in this export share a base name (paired left/right
  // instances, or sub-objects split by material) — group by name so
  // selecting one entry in the UI affects every mesh with that name, and
  // the displayed list has no duplicate rows.
  const meshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  // Original local position per mesh, captured once right after load, so
  // "reponer" can put a detached structure back exactly where it came
  // from. Purely a visual aid (grab a bone and pull it off the skeleton
  // to look at it on its own) — no engine, no claim about biomechanics,
  // consistent with this page already being a viewer, not a simulation.
  const originalPosRef = useRef<Map<THREE.Mesh, THREE.Vector3>>(new Map());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const [detachMode, setDetachMode] = useState(false);
  const detachModeRef = useRef(detachMode);
  detachModeRef.current = detachMode;
  const [movedCount, setMovedCount] = useState(0);
  const resetAllRef = useRef<() => void>(() => {});

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 5000);
    camera.position.set(0, 60, 250);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(150, 200, 150);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-150, -50, -150);
    scene.add(fill);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    let disposed = false;
    let frameId = 0;

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        root.scale.setScalar(150 / maxDim);

        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if ((mesh as THREE.Mesh).isMesh) {
            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map((m) => m.clone());
            } else if (mesh.material) {
              mesh.material = (mesh.material as THREE.Material).clone();
            }
            const group = meshesRef.current.get(mesh.name);
            if (group) group.push(mesh);
            else meshesRef.current.set(mesh.name, [mesh]);
            originalPosRef.current.set(mesh, mesh.position.clone());
          }
        });
        const names = Array.from(meshesRef.current.keys()).sort((a, b) => a.localeCompare(b));
        onLoaded(names);
        scene.add(root);
      },
      undefined,
      (err) => onLoadError(err instanceof Error ? err.message : String(err))
    );

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // --- Detach/drag: grab the selected structure and pull it off the
    // model, along a plane facing the camera through the structure's
    // current position. Window-level pointermove/up (not element-level),
    // and camera.updateMatrixWorld(true) before every raycast: both
    // lessons carried over from the physics/robotics 3D scenes, where
    // relying on the render loop's own timing to keep the camera matrix
    // and event delivery in sync proved unreliable.
    const raycaster = new THREE.Raycaster();
    function syncMatrices() {
      camera.updateMatrixWorld(true);
    }

    function handlePointerDown(e: PointerEvent) {
      if (!detachModeRef.current || !selectedRef.current) return;
      syncMatrices();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const group = meshesRef.current.get(selectedRef.current) ?? [];
      // Ray-to-point distance rather than exact mesh-triangle
      // intersection: forgiving of small pointer imprecision.
      let hitAny = false;
      for (const mesh of group) {
        const worldPos = mesh.getWorldPosition(new THREE.Vector3());
        const toObj = worldPos.clone().sub(raycaster.ray.origin);
        const t = toObj.dot(raycaster.ray.direction);
        if (t < 0) continue;
        if (raycaster.ray.distanceToPoint(worldPos) < 20) { hitAny = true; break; }
      }
      if (!hitAny) return;
      e.stopPropagation();
      controls.enabled = false;

      const anchorWorld = group[0].getWorldPosition(new THREE.Vector3());
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, anchorWorld);
      const startHit = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, startHit);
      const startLocal = group.map((m) => m.position.clone());

      function handleMove(ev: PointerEvent) {
        syncMatrices();
        const r = renderer.domElement.getBoundingClientRect();
        const m2 = new THREE.Vector2(
          ((ev.clientX - r.left) / r.width) * 2 - 1,
          -((ev.clientY - r.top) / r.height) * 2 + 1
        );
        raycaster.setFromCamera(m2, camera);
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
        const worldDelta = hit.clone().sub(startHit);
        group.forEach((mesh, i) => {
          const parentScale = mesh.parent ? mesh.parent.getWorldScale(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
          const localDelta = worldDelta.clone().divide(parentScale);
          mesh.position.copy(startLocal[i].clone().add(localDelta));
        });
        setMovedCount(countMoved());
      }
      function handleUp() {
        controls.enabled = true;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    }
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    function countMoved(): number {
      let n = 0;
      originalPosRef.current.forEach((orig, mesh) => {
        if (mesh.position.distanceTo(orig) > 0.01) n++;
      });
      return n;
    }

    resetAllRef.current = () => {
      originalPosRef.current.forEach((orig, mesh) => mesh.position.copy(orig));
      setMovedCount(0);
    };

    const handleClick = (event: MouseEvent) => {
      if (detachModeRef.current) return; // in detach mode, pointerdown+drag owns interaction
      syncMatrices();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const click = new THREE.Raycaster();
      click.setFromCamera(mouse, camera);
      const intersects = click.intersectObjects(Array.from(meshesRef.current.values()).flat());
      onSelect(intersects.length > 0 ? intersects[0].object.name : null);
    };
    renderer.domElement.addEventListener("click", handleClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();
      renderer.dispose();
      dracoLoader.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      meshesRef.current.clear();
      originalPosRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  useEffect(() => {
    meshesRef.current.forEach((meshes, name) => {
      for (const mesh of meshes) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) {
          const mat = m as THREE.MeshStandardMaterial;
          if (!mat) continue;
          if (selected === null) {
            mat.transparent = false;
            mat.opacity = 1;
            mat.emissive?.setHex(0x000000);
          } else if (name === selected) {
            mat.transparent = false;
            mat.opacity = 1;
            mat.emissive?.setHex(0x1d6fa5);
          } else {
            mat.transparent = true;
            mat.opacity = 0.06;
            mat.emissive?.setHex(0x000000);
          }
          mat.needsUpdate = true;
        }
      }
    });
  }, [selected]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={detachMode} onChange={(e) => setDetachMode(e.target.checked)} />
          Modo armar/desarmar
        </label>
        {detachMode && (
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            {selected ? `Arrastrá "${selected}" para separarla del esqueleto.` : "Seleccioná una estructura primero (fuera del modo armar/desarmar, o en la lista)."}
          </span>
        )}
        {movedCount > 0 && (
          <button className="secondary" onClick={() => resetAllRef.current()}>
            Rearmar todo ({movedCount})
          </button>
        )}
      </div>
      <div ref={mountRef} style={{ width: "100%", height: 480, borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
}
