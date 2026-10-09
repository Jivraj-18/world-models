// Shared scene setup: renderer, sky, lighting and the coded Palm House model.
// Used by the coded page and the hybrid page.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStaircase } from './staircase.js';
import { buildGlasshouse } from './glasshouse.js';
import { buildPlants } from './plants.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0xd3e3ec) }, bottom: { value: new THREE.Color(0xf7f5ee) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.4, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  });
  return new THREE.Mesh(geo, mat);
}

export function addLighting(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  scene.add(new THREE.HemisphereLight(0xe4eef5, 0x4c5a32, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d8, 3.2);
  sun.position.set(12, 26, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.fog = new THREE.Fog(0xe9ede2, 18, 60);
}

export function buildPalmHouse({ stair = true, house = true, plants = true } = {}) {
  const root = new THREE.Group();
  const parts = {};
  if (stair) root.add((parts.stair = buildStaircase()));
  if (house) root.add((parts.house = buildGlasshouse()));
  if (plants) root.add((parts.plants = buildPlants()));
  return { root, parts };
}

export function createScene(renderer, opts) {
  const scene = new THREE.Scene();
  scene.add(skyDome());
  addLighting(scene, renderer);
  const model = buildPalmHouse(opts);
  scene.add(model.root);
  return { scene, model };
}
