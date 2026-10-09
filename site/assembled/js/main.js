// Assembled scene: every piece is generated from the single source photo, then composed by code.
//   surroundings + light : Marble's 360° panorama on a GroundedSkybox (floor stays put as you move)
//   staircase / palms    : image-to-3D meshes (TRELLIS.2, Hunyuan3D) made from crops of the photo
//   layout, shadows      : code
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { buildStaircase } from '../../coded/js/staircase.js';
import { ASSETS } from '../../js/config.js';

// Generated meshes, listed if present. `height` is the real-world height they are scaled to (metres).
const STAIRS = {
  hunyuan31: { file: `${ASSETS}/models/objects/stair_hunyuan31.glb`, label: 'Hunyuan3D 3.1 (web)' },
  tripo: { file: `${ASSETS}/models/objects/stair_tripo.glb`, label: 'Tripo H3.1' },
  rodin: { file: `${ASSETS}/models/objects/stair_rodin.glb`, label: 'Rodin Gen-2.5' },
  hunyuan: { file: `${ASSETS}/models/objects/stair_hunyuan.glb`, label: 'Hunyuan3D 2.1' },
  trellis: { file: `${ASSETS}/models/objects/stair_trellis.glb`, label: 'TRELLIS.2' },
  coded: { label: 'Coded (fallback)' },
};
const PALMS = {
  hunyuan31: { file: `${ASSETS}/models/objects/palm_hunyuan31.glb`, label: 'Hunyuan3D 3.1 (web)' },
  meshy: { file: `${ASSETS}/models/objects/palm_meshy.glb`, label: 'Meshy 7' },
  hunyuan: { file: `${ASSETS}/models/objects/palm_hunyuan.glb`, label: 'Hunyuan3D 2.1' },
  trellis: { file: `${ASSETS}/models/objects/palm_trellis.glb`, label: 'TRELLIS.2' },
  none: { label: 'None' },
};
const STAIR_HEIGHT = 9.5;
const STAIR_POS = new THREE.Vector3(0, 0, -7.5); // in front of the camera, where the pano's stair stands
const PALM_SPOTS = [[-4.5, -6.5, 5.5, 0.4], [4.2, -8.5, 4.2, 2.1], [-3.0, -11, 6.5, 4.0], [6.5, -4.5, 3.6, 1.2], [-7.0, -3.0, 4.8, 5.5]];

const container = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.05, 400);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 0.5;
orbit.maxDistance = 22;

const VIEWS = {
  photo: () => { camera.position.set(0, 1.6, 0); orbit.target.set(0, 5.0, -7.5); },
  near: () => { camera.position.set(2.2, 2.0, -3.6); orbit.target.set(0, 4.5, -7.5); },
  around: () => { camera.position.set(-6, 3, -12); orbit.target.set(0, 3.5, -7.5); },
};

// Light: a sun that matches the pano's hazy top light, plus image-based light from the pano itself.
scene.add(new THREE.HemisphereLight(0xf0f2ea, 0x6b6450, 1.0));
const sun = new THREE.DirectionalLight(0xfff3dc, 2.2);
sun.position.set(6, 18, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.ShadowMaterial({ opacity: 0.28 }));
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0.01;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

const status = document.getElementById('status');
const ui = (id) => document.getElementById(id);
const gltf = new GLTFLoader();
let skybox = null;

new THREE.TextureLoader().load(`${ASSETS}/images/marble_pano.jpg`, (tex) => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = tex;
  scene.environmentIntensity = 0.8;
  skybox = new GroundedSkybox(tex, 1.6, 60); // camera height 1.6 m, ground radius 60 m
  skybox.position.y = 1.6 - 0.01;
  skybox.rotation.y = Math.PI / 2; // pano centre (the photographed stair) faces -z
  scene.add(skybox);
  ui('pano').onchange = (e) => { skybox.visible = e.target.checked; scene.background = e.target.checked ? null : new THREE.Color(0x1f211c); };
});

// Load a GLB, stand it on the ground, scale it to a target height.
async function loadMesh(file, height) {
  const g = (await gltf.loadAsync(file)).scene;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const s = height / size.y;
  g.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  g.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

async function exists(file) {
  try { return (await fetch(file, { method: 'HEAD' })).ok; } catch { return false; }
}

let stairObj = null, palmObjs = [];
async function setStair(key) {
  if (stairObj) scene.remove(stairObj);
  status.textContent = 'Loading stair…';
  if (key === 'coded') {
    stairObj = buildStaircase();
  } else {
    stairObj = await loadMesh(STAIRS[key].file, STAIR_HEIGHT);
    stairObj.rotation.y = +(new URLSearchParams(location.search).get('stairYaw') || 0);
  }
  stairObj.position.copy(STAIR_POS);
  scene.add(stairObj);
  status.textContent = '';
}
async function setPalm(key) {
  palmObjs.forEach((p) => scene.remove(p));
  palmObjs = [];
  if (key === 'none') return;
  const proto = await loadMesh(PALMS[key].file, 1);
  for (const [x, z, h, yaw] of PALM_SPOTS) {
    const p = proto.clone();
    p.scale.setScalar(h);
    p.position.set(x, 0, z);
    p.rotation.y = yaw;
    scene.add(p);
    palmObjs.push(p);
  }
}

async function fillSelect(id, table, onPick) {
  const sel = ui(id);
  for (const [k, v] of Object.entries(table)) {
    if (v.file && !(await exists(v.file))) continue;
    sel.add(new Option(v.label, k));
  }
  sel.onchange = () => onPick(sel.value);
  return sel.value;
}

addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { VIEWS[b.dataset.view](); orbit.update(); }));

const params = new URLSearchParams(location.search);
(VIEWS[params.get('view')] || VIEWS.photo)();
orbit.update();
renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });

const firstStair = await fillSelect('stair', STAIRS, setStair);
const firstPalm = await fillSelect('palm', PALMS, setPalm);
await Promise.all([setStair(params.get('stair') || firstStair), setPalm(params.get('palm') || firstPalm)]);
if (params.get('stair')) ui('stair').value = params.get('stair');
window.__ready = true;
