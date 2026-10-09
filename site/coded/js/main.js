// Coded Palm House viewer: orbit, photo view, a guided climb up the stair, and WASD walking.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createRenderer, createScene } from './scene.js';
import { climbPose, STAIR } from './staircase.js';
import { HOUSE } from './glasshouse.js';

const container = document.getElementById('view');
const renderer = createRenderer(container);
const { scene } = createScene(renderer);

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 500);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxDistance = 30;

// Matches the original photograph: standing a few metres from the stair, looking up.
const VIEWS = {
  photo: { pos: [0.9, 2.0, 6.6], target: [0.0, 5.4, 0.0], fov: 50 },
  overview: { pos: [11, 9, 13], target: [0, 5, 0], fov: 50 },
  top: { pos: [1.0, STAIR.height + 1.7, 1.0], target: [-6, STAIR.height - 2, -4], fov: 70 },
};

let mode = 'orbit';
let climbT = 0;
const walk = new PointerLockControls(camera, renderer.domElement);
const keys = {};
addEventListener('keydown', (e) => (keys[e.code] = true));
addEventListener('keyup', (e) => (keys[e.code] = false));
walk.addEventListener('unlock', () => { if (mode === 'walk') setMode('orbit'); });

function setView(name) {
  const v = VIEWS[name];
  camera.position.set(...v.pos);
  orbit.target.set(...v.target);
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  orbit.update();
}

function setMode(m) {
  mode = m;
  orbit.enabled = m === 'orbit';
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  document.getElementById('hint').textContent = {
    orbit: 'Drag to orbit · scroll to zoom · right-drag to pan',
    climb: 'Climbing the stair… press Esc or pick another mode to stop',
    walk: 'WASD to walk · mouse to look · Esc to release',
  }[m];
  if (m === 'climb') { climbT = 0; camera.fov = 70; camera.updateProjectionMatrix(); }
  if (m === 'walk') {
    camera.position.set(0, 1.7, 4.5);
    camera.fov = 70; camera.updateProjectionMatrix();
    walk.lock();
  }
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { setMode('orbit'); setView(b.dataset.view); }));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
addEventListener('keydown', (e) => { if (e.code === 'Escape' && mode === 'climb') { setMode('orbit'); setView('top'); } });

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'climb') {
    climbT = Math.min(1, climbT + dt / 45);
    const { pos, look } = climbPose(climbT);
    camera.position.lerp(pos, 0.15);
    camera.lookAt(look);
    if (climbT >= 1) { setMode('orbit'); setView('top'); }
  } else if (mode === 'walk') {
    const sp = 2.2 * dt;
    if (keys.KeyW) walk.moveForward(sp);
    if (keys.KeyS) walk.moveForward(-sp);
    if (keys.KeyA) walk.moveRight(-sp);
    if (keys.KeyD) walk.moveRight(sp);
    const p = camera.position;
    // stay inside the glasshouse and outside the stair column
    const e = (p.x * p.x) / ((HOUSE.a - 0.8) ** 2) + (p.z * p.z) / ((HOUSE.b - 0.8) ** 2);
    if (e > 1) { p.x /= Math.sqrt(e); p.z /= Math.sqrt(e); }
    const r = Math.hypot(p.x, p.z);
    if (r < STAIR.outerR + 0.25) { const k = (STAIR.outerR + 0.25) / r; p.x *= k; p.z *= k; }
    p.y = 1.7;
  } else {
    orbit.update();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

setView(new URLSearchParams(location.search).get('view') || 'photo');
setMode('orbit');
tick();
window.__ready = true;
