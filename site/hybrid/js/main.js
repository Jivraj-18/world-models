// Hybrid viewer: the coded staircase (exact, climbable geometry) placed inside the world-model splat
// (photographic plants, glass and light). The splat's source camera is pinned to the coded scene's
// photo-view camera, so both line up from the original viewpoint; scale and depth can be fine-tuned.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer, createScene } from '../../coded/js/scene.js';
import { climbPose } from '../../coded/js/staircase.js';
import { MODELS, addSplat, splatPlacement } from '../../splat/js/splat.js';

const params = new URLSearchParams(location.search);
const container = document.getElementById('view');
const renderer = createRenderer(container);
const { scene, model } = createScene(renderer);
model.parts.house.visible = false;
model.parts.plants.visible = false;

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 500);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

// Same as the coded page's photo view: where the photographer stood.
const PHOTO = { pos: new THREE.Vector3(0.9, 2.0, 6.6), target: new THREE.Vector3(0, 5.4, 0) };
const VIEWS = {
  photo: () => { camera.position.copy(PHOTO.pos); orbit.target.copy(PHOTO.target); },
  side: () => { camera.position.set(6.5, 3.0, 3.5); orbit.target.set(0, 4.5, 0); },
};

function photoCameraPose(shift) {
  const m = new THREE.Matrix4().lookAt(PHOTO.pos, PHOTO.target, new THREE.Vector3(0, 1, 0));
  const forward = PHOTO.target.clone().sub(PHOTO.pos).normalize();
  m.setPosition(PHOTO.pos.clone().addScaledVector(forward, -shift));
  return m;
}

let splat = null;
const status = document.getElementById('status');
const ui = (id) => document.getElementById(id);
ui('src').value = ['hyworld', 'hyworld_bg', 'sharp', 'sharp_bg', 'marble'].includes(params.get('model')) ? params.get('model') : 'sharp_bg';

async function loadSplat() {
  if (splat) { scene.remove(splat); splat.dispose?.(); splat = null; }
  const m = splatPlacement(photoCameraPose(+ui('shift').value), MODELS[ui('src').value].scale * +ui('scale').value, MODELS[ui('src').value].frame);
  status.textContent = 'Loading splat…';
  try {
    splat = await addSplat(scene, ui('src').value, m, (p) => (status.textContent = `Loading splat… ${Math.round(p)}%`));
    splat.visible = ui('lSplat').checked;
    status.textContent = '';
  } catch (e) {
    status.textContent = 'Splat not available: ' + e.message;
  }
  window.__ready = true;
}

ui('lStair').onchange = (e) => (model.parts.stair.visible = e.target.checked);
ui('lHouse').onchange = (e) => (model.parts.house.visible = e.target.checked);
ui('lPlants').onchange = (e) => (model.parts.plants.visible = e.target.checked);
ui('lSplat').onchange = (e) => { if (splat) splat.visible = e.target.checked; };
for (const id of ['src', 'scale', 'shift']) ui(id).onchange = loadSplat;

let mode = 'orbit', climbT = 0;
function setMode(m) {
  mode = m;
  orbit.enabled = m === 'orbit';
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  ui('hint').textContent = m === 'climb'
    ? 'Climbing the coded stair through the splat… Esc to stop'
    : 'The stair is real geometry; the plants and glass are the world model\'s splat. Toggle layers on the right.';
  if (m === 'climb') climbT = 0;
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { setMode('orbit'); VIEWS[b.dataset.view](); orbit.update(); }));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
addEventListener('keydown', (e) => { if (e.code === 'Escape') setMode('orbit'); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'climb') {
    climbT = Math.min(1, climbT + dt / 45);
    const { pos, look } = climbPose(climbT);
    camera.position.lerp(pos, 0.15);
    camera.lookAt(look);
    if (climbT >= 1) setMode('orbit');
  } else orbit.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

VIEWS[params.get('view') || 'photo']();
orbit.update();
setMode('orbit');
loadSplat();
