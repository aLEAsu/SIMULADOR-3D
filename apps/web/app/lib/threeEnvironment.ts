/**
 * Shared PBR lighting setup for the 3D scenes (ArmScene3D, PhysicsScene3D):
 * real shadow maps + a synthetic studio environment map for reflections on
 * MeshPhysicalMaterial, instead of the flat ambient+directional-only
 * lighting both scenes used before. Uses three's own `RoomEnvironment` —
 * generated at runtime, not a downloaded HDRI — per the project's standing
 * rule against 3D assets of uncertain license (docs/01-architecture.md,
 * docs/03-design-system.md §4): nothing here is fetched from a third party.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function applyPBREnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  return () => {
    envTexture.dispose();
    pmrem.dispose();
  };
}

export function makeKeyLight(): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0015;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 800;
  return light;
}
