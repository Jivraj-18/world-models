// Loads a world-model Gaussian splat into a Three.js scene.
// Both SHARP and HY-World WorldMirror output in the OpenCV camera frame (x right, y down, z forward)
// with the source photo's camera at the origin. We flip it into Three.js (y up, -z forward) and then
// place it so that source camera sits wherever `cameraPose` says.
import * as THREE from 'three';
import * as GaussianSplats3D from 'gaussian-splats-3d';
import { ASSETS } from '../../js/config.js';

export const MODELS = {
  // scale: splat units → scene metres, fitted by world-model/cut_stair.py so the photographed stair
  // lands on the coded one. SHARP is metric already (a fit on all 1.18M splats gave 1.08); WorldMirror normalises depth to ~1.
  sharp: { file: `${ASSETS}/models/sharp.splat`, label: 'Apple SHARP', scale: 1.08, note: 'single image → 3DGS in under a second (research-only licence)' },
  hyworld: { file: `${ASSETS}/models/hyworld.splat`, label: 'Tencent HY-World 2.0 (WorldMirror)', scale: 9.15, note: 'single image → 3DGS reconstruction' },
  // Marble's native .spz; scale = the world's metric_scale_factor from the World API response.
  marble: { file: `${ASSETS}/models/marble.spz`, label: 'World Labs Marble 1.1 Plus', scale: 2.0108, note: 'single image + prompt → full 360° generated world' },
  // HY-World 2.1 world generated on 3d.hunyuan.tencent.com (Image/scene mode) and exported as .spz.
  hyworld21: { file: `${ASSETS}/models/hyworld21.splat`, label: 'Tencent HY-World 2.1 (web)', scale: 1, frame: 'zup', note: 'single image → generated explorable world' },
  // NVIDIA Lyra 2.0 (generated video -> reconstructed 3DGS). ~4M of 11.2M splats, thinned per voxel by world-model/ply_to_spz.py. `photo` is the
  // camera of the reconstructed frame that matches the input photo (world-model/outputs/.../photo_cameras.json).
  lyra_A: { file: `${ASSETS}/models/lyra_A_zoom_fast.spz`, label: 'NVIDIA Lyra 2.0 (zoom, fast)', scale: 1,
            photo: { pos: [-0.015, -1.567, -8.932], target: [-0.027, -1.58, -11.932], up: [-0.036, 0.999, -0.004], fov: 37.9 } },
  lyra_B: { file: `${ASSETS}/models/lyra_B_orbit_fast.spz`, label: 'NVIDIA Lyra 2.0 (orbit, fast)', scale: 1,
            photo: { pos: [-3.993, 0.057, -2.547], target: [-1.301, 0.008, -3.87], up: [0.012, 1.0, -0.014], fov: 37.8 } },
  // Same splats with their own staircase cut out, for the hybrid.
  hyworld_bg: { file: `${ASSETS}/models/hyworld_bg.splat`, label: 'HY-World 2.0, stair removed', scale: 9.15 },
  sharp_bg: { file: `${ASSETS}/models/sharp_bg.splat`, label: 'SHARP, stair removed', scale: 1.08 },
};

// Axis conventions: OpenCV (y down, z forward) for SHARP / WorldMirror / Marble; z-up with +y forward
// for the HY-World 2.1 web export. Both map to Three.js (y up, -z forward).
const TO_THREE = {
  opencv: new THREE.Matrix4().makeRotationX(Math.PI),
  zup: new THREE.Matrix4().makeRotationX(-Math.PI / 2),
};

// Returns the matrix that maps splat space into the scene so the photo camera lands on cameraPose.
export function splatPlacement(cameraPose = new THREE.Matrix4(), scale = 1, frame = 'opencv') {
  return new THREE.Matrix4().multiplyMatrices(cameraPose, TO_THREE[frame]).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
}

export async function addSplat(scene, name, matrix, onProgress) {
  const viewer = new GaussianSplats3D.DropInViewer({
    sharedMemoryForWorkers: false, // GitHub Pages cannot send the COOP/COEP headers SharedArrayBuffer needs
    gpuAcceleratedSort: false,
    sphericalHarmonicsDegree: 0,
  });
  // Transform the viewer object itself; the per-scene transform options did not render reliably.
  matrix.decompose(viewer.position, viewer.quaternion, viewer.scale);
  scene.add(viewer);
  await viewer.addSplatScene(MODELS[name].file, {
    format: MODELS[name].file.endsWith('.spz') ? GaussianSplats3D.SceneFormat.Spz : GaussianSplats3D.SceneFormat.Splat,
    splatAlphaRemovalThreshold: 5,
    showLoadingUI: false,
    onProgress: (pct) => onProgress?.(pct),
  });
  return viewer;
}
