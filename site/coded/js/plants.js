// Procedural vegetation: fan palms (Chamaerops / Trachycarpus style), feather palms, a tall
// conifer and broadleaf shrubs, all instanced so hundreds of plants stay cheap to draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { leaf, bark, ground, gravelPath } from './textures.js';
import { HOUSE } from './glasshouse.js';

// Deterministic RNG so the scene is identical on every load.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const range = (a, b) => a + (b - a) * rnd();

const GREENS = [0x4d7a3c, 0x5f8a44, 0x3f6a35, 0x6f9650, 0x587f3f, 0x7b9d5c];

function colorize(geo, hex, jitter = 0.08) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rnd() - 0.5) * jitter;
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv'); // vertex-coloured foliage needs no UVs, and merges require matching attributes
  return geo;
}

// One fan leaf: blades radiating from the end of a petiole, tips drooping under gravity.
function fanLeaf(len, blades, spread, droop) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const a = -spread / 2 + (spread * i) / (blades - 1);
    const L = len * range(0.85, 1.05);
    const w = 0.035 * len;
    const segs = 5;
    const pos = [], idx = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = t * L;
      const width = w * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.002;
      const dy = -droop * t * t * L;
      const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
      const px = Math.cos(a) * width, pz = -Math.sin(a) * width;
      pos.push(cx - px, dy, cz - pz, cx + px, dy + width * 0.6, cz + pz);
      if (s < segs) { const b = s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(colorize(g, GREENS[Math.floor(rnd() * GREENS.length)], 0.18));
  }
  return mergeGeometries(parts);
}

// A crown of fan leaves on petioles, origin at the top of the trunk.
function fanCrown(nLeaves, leafLen, petioleLen) {
  const parts = [];
  const petioleMat = new THREE.Matrix4();
  for (let i = 0; i < nLeaves; i++) {
    const yaw = (i / nLeaves) * Math.PI * 2 + range(-0.2, 0.2);
    const pitch = range(-0.35, 1.15); // from drooping to upright
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
    const tip = dir.clone().multiplyScalar(petioleLen);

    const pet = new THREE.CylinderGeometry(0.012, 0.02, petioleLen, 4);
    pet.translate(0, petioleLen / 2, 0);
    pet.applyMatrix4(petioleMat.lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    parts.push(colorize(pet.toNonIndexed(), 0x6b7a45));

    const fan = fanLeaf(leafLen * range(0.8, 1.1), 26 + Math.floor(rnd() * 10), range(3.6, 4.6), range(0.15, 0.45)).toNonIndexed();
    // Orient the fan: blades spread around the petiole direction, facing up-out.
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const roll = new THREE.Quaternion().setFromAxisAngle(dir, range(-0.4, 0.4));
    fan.applyQuaternion(q.premultiply(roll));
    fan.translate(tip.x, tip.y, tip.z);
    parts.push(fan);
  }
  return mergeGeometries(parts);
}

// Feather (pinnate) frond crown, used for a few phoenix-like palms and ground ferns.
function featherCrown(nFronds, len) {
  const parts = [];
  for (let f = 0; f < nFronds; f++) {
    const yaw = (f / nFronds) * Math.PI * 2 + range(-0.2, 0.2);
    const pitch = range(0.2, 1.1);
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      const r = t * len;
      const h = Math.sin(pitch) * r - 0.45 * len * t * t;
      pts.push(new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch) * r, h, Math.sin(yaw) * Math.cos(pitch) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(colorize(new THREE.TubeGeometry(curve, 8, 0.012, 3).toNonIndexed(), 0x6b7a45));
    const nLeaflets = 22;
    for (let k = 1; k < nLeaflets; k++) {
      const t = k / nLeaflets;
      const p = curve.getPoint(t), tan = curve.getTangent(t);
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const L = len * 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.03;
      for (const sgn of [-1, 1]) {
        const end = p.clone().addScaledVector(side, sgn * L).addScaledVector(tan, L * 0.5).add(new THREE.Vector3(0, -L * 0.25, 0));
        const g = new THREE.BufferGeometry();
        const w = tan.clone().multiplyScalar(0.025);
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          p.x - w.x, p.y - w.y, p.z - w.z, p.x + w.x, p.y + w.y, p.z + w.z, end.x, end.y, end.z,
        ], 3));
        g.computeVertexNormals();
        parts.push(colorize(g, GREENS[Math.floor(rnd() * GREENS.length)], 0.15));
      }
    }
  }
  return mergeGeometries(parts);
}

function insideHouse(x, z, margin = 1.2) {
  return (x * x) / ((HOUSE.a - margin) ** 2) + (z * z) / ((HOUSE.b - margin) ** 2) < 1;
}

// Keep the sightline from the photo viewpoint (in front of the stair, +z) clear.
function inViewCorridor(x, z) {
  return z > 0.8 && z < 9 && Math.abs(x) < 1.6 + z * 0.35;
}

export function buildPlants() {
  const group = new THREE.Group();
  group.name = 'plants';
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
  const barkMat = new THREE.MeshStandardMaterial({ map: bark(), roughness: 0.95 });

  // Floor: planted soil with a gravel path ring around the stair and an axis path.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshStandardMaterial({ map: ground(), roughness: 1 }));
  floor.scale.set(HOUSE.a, HOUSE.b, 1);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const pathMat = new THREE.MeshStandardMaterial({ map: gravelPath(), roughness: 1 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.0, 2.1, 64), pathMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; ring.receiveShadow = true;
  group.add(ring);
  const axis = new THREE.Mesh(new THREE.PlaneGeometry(2.0, HOUSE.a * 2), pathMat);
  axis.rotation.x = -Math.PI / 2; axis.rotation.z = Math.PI / 2; axis.position.y = 0.012; axis.receiveShadow = true;
  group.add(axis);

  // --- Fan palms (3 crown variants, instanced) ---
  const variants = [fanCrown(22, 1.0, 0.8), fanCrown(16, 0.8, 0.6), fanCrown(28, 1.25, 1.0)];
  // Hand-placed hero palms echoing the photo, then a random fill.
  const placements = [
    { x: -4.6, z: -0.8, h: 6.5, s: 1.6, v: 2 },  // big fan palm left of the stair
    { x: 2.4, z: -2.2, h: 2.4, s: 1.3, v: 0 },   // palm behind the stair, right
    { x: 4.8, z: 0.4, h: 1.6, s: 1.3, v: 2 },    // right palm at the stair's foot
    { x: -0.8, z: -3.4, h: 4.2, s: 1.4, v: 2 },  // crown visible through the stair
    { x: 5.6, z: -2.8, h: 3.2, s: 1.2, v: 0 },
    { x: -3.0, z: -4.2, h: 1.2, s: 1.1, v: 1 },
  ];
  for (let i = 0; i < 34; i++) {
    const x = range(-HOUSE.a, HOUSE.a), z = range(-HOUSE.b, HOUSE.b);
    if (!insideHouse(x, z) || Math.hypot(x, z) < 2.6 || Math.abs(z) < 1.3 || inViewCorridor(x, z)) continue;
    placements.push({ x, z, h: range(0.3, 7.5), s: range(0.8, 1.5), v: Math.floor(rnd() * 3) });
  }
  const byVariant = [[], [], []];
  placements.forEach((p) => byVariant[p.v].push(p));
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 10, 4);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let ti = 0;
  byVariant.forEach((list, vi) => {
    const crowns = new THREE.InstancedMesh(variants[vi], foliage, list.length);
    list.forEach((pl, i) => {
      const lean = new THREE.Euler(range(-0.08, 0.08), 0, range(-0.08, 0.08));
      q.setFromEuler(lean);
      trunks.setMatrixAt(ti++, m.compose(p.set(pl.x, 0, pl.z), q, s.set(pl.s * 0.9, pl.h, pl.s * 0.9)));
      const top = new THREE.Vector3(0, pl.h, 0).applyQuaternion(q).add(new THREE.Vector3(pl.x, 0, pl.z));
      q.setFromEuler(new THREE.Euler(lean.x, range(0, Math.PI * 2), lean.z));
      crowns.setMatrixAt(i, m.compose(top, q, s.setScalar(pl.s * 1.25)));
    });
    crowns.castShadow = true; crowns.receiveShadow = true;
    group.add(crowns);
  });
  trunks.castShadow = true;
  group.add(trunks);

  // --- Feather palms and ground ferns ---
  const feather = featherCrown(14, 2.2);
  const fern = featherCrown(10, 0.9);
  const featherSpots = [{ x: -6.5, z: -3.5, h: 4.5 }, { x: 6.5, z: 3.8, h: 3.5 }, { x: 1.8, z: -5.5, h: 2.8 }];
  const fm = new THREE.InstancedMesh(feather, foliage, featherSpots.length);
  const ft = new THREE.InstancedMesh(trunkGeo, barkMat, featherSpots.length);
  featherSpots.forEach((f, i) => {
    ft.setMatrixAt(i, m.compose(p.set(f.x, 0, f.z), q.identity(), s.set(1.1, f.h, 1.1)));
    fm.setMatrixAt(i, m.compose(p.set(f.x, f.h, f.z), q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), s.setScalar(1.4)));
  });
  fm.castShadow = true;
  group.add(fm, ft);
  const fernSpots = [];
  for (let i = 0; i < 120; i++) {
    const x = range(-HOUSE.a, HOUSE.a), z = range(-HOUSE.b, HOUSE.b);
    if (insideHouse(x, z, 0.6) && Math.hypot(x, z) > 2.3 && Math.abs(z) > 1.1 && !inViewCorridor(x, z)) fernSpots.push([x, z]);
  }
  const fernMesh = new THREE.InstancedMesh(fern, foliage, fernSpots.length);
  fernSpots.forEach(([x, z], i) => fernMesh.setMatrixAt(i, m.compose(p.set(x, 0.05, z), q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), s.setScalar(range(0.6, 1.4)))));
  group.add(fernMesh);

  // --- Tall conifer (left of the photo): tiers of drooping needle sprays ---
  const sprayGeo = new THREE.PlaneGeometry(0.5, 0.9);
  sprayGeo.translate(0, 0.45, 0);
  const conMat = new THREE.MeshStandardMaterial({ map: leaf('#2f4f2a', '#46683a'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  const sprays = new THREE.InstancedMesh(sprayGeo, conMat, 1800);
  const cx = -6.8, cz = -1.0, cH = 15;
  for (let i = 0; i < 1800; i++) {
    const t = rnd();
    const y = 1.5 + t * cH;
    const r = (1 - t) * 2.3 * range(0.4, 1.05) + 0.2;
    const a = rnd() * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(range(0.8, 1.6), a, 0, 'YXZ'));
    sprays.setMatrixAt(i, m.compose(p.set(cx + r * Math.cos(a), y, cz + r * Math.sin(a)), q, s.setScalar(range(0.7, 1.3))));
  }
  sprays.castShadow = true;
  group.add(sprays);
  const conTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, cH, 8), barkMat);
  conTrunk.position.set(cx, cH / 2, cz);
  group.add(conTrunk);

  // --- Broadleaf shrubs and climbers: clumps of instanced leaf cards ---
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.3);
  const leafMat = new THREE.MeshStandardMaterial({ map: leaf(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
  const clumps = [];
  for (let i = 0; i < 90; i++) {
    const x = range(-HOUSE.a, HOUSE.a), z = range(-HOUSE.b, HOUSE.b);
    if (insideHouse(x, z, 0.4) && Math.hypot(x, z) > 2.4 && Math.abs(z) > 1.2 && !inViewCorridor(x, z)) clumps.push([x, z, range(0.6, 1.6), range(0.4, 2.6)]);
  }
  // climbers framing the top-right of the photo
  clumps.push([7.5, -1.5, 1.4, 9.5], [8.5, 0.5, 1.6, 7.5], [-3.5, 5.5, 1.5, 3.2]);
  const perClump = 140;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, clumps.length * perClump);
  const col = new THREE.Color();
  let li = 0;
  for (const [x, z, r, h] of clumps) {
    for (let k = 0; k < perClump; k++) {
      const u = rnd(), v = rnd();
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      const rr = r * Math.cbrt(rnd());
      p.set(x + rr * Math.sin(ph) * Math.cos(th), Math.max(0.1, h + rr * Math.cos(ph) * 0.8), z + rr * Math.sin(ph) * Math.sin(th));
      q.setFromEuler(new THREE.Euler(range(-1.2, 1.2), range(0, 6.28), range(-0.6, 0.6)));
      leaves.setMatrixAt(li, m.compose(p, q, s.setScalar(range(0.7, 1.5))));
      leaves.setColorAt(li++, col.setHSL(range(0.22, 0.3), range(0.35, 0.55), range(0.28, 0.45)));
    }
  }
  leaves.castShadow = true; leaves.receiveShadow = true;
  group.add(leaves);

  return group;
}
