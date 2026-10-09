// Cast-iron spiral staircase, modelled on the Schönbrunn Palm House stair:
// anticlockwise ascent, perforated risers, scrollwork stringer, beaded balusters,
// helical handrail, fluted lower column, gothic-arched entrance gate and a top gallery ring.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { filigreeRiser, filigreeStringer } from './textures.js';

export const STAIR = {
  newelR: 0.09,
  outerR: 1.15,
  rise: 0.2,
  stepsPerTurn: 16,
  steps: 44,
  railH: 0.92,
  startAngle: 0,
};
STAIR.dTheta = (Math.PI * 2) / STAIR.stepsPerTurn;
STAIR.height = STAIR.steps * STAIR.rise;

const ivory = () => new THREE.MeshStandardMaterial({ color: 0xeee6d0, roughness: 0.55, metalness: 0.25 });

// Anticlockwise when viewed from above: angle increases with height.
export function stairPoint(r, theta, y) {
  return new THREE.Vector3(r * Math.cos(theta), y, -r * Math.sin(theta));
}

function sectorShape(r0, r1, a0, a1) {
  const s = new THREE.Shape();
  const n = 8;
  s.moveTo(r0 * Math.cos(a0), r0 * Math.sin(a0));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    s.lineTo(r1 * Math.cos(a), r1 * Math.sin(a));
  }
  s.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1));
  s.closePath();
  return s;
}

// Turned baluster profile with beads and a vase.
function balusterGeometry(h) {
  const p = [];
  const prof = [
    [0.0, 0.022], [0.04, 0.022], [0.05, 0.014], [0.12, 0.009], [0.14, 0.02], [0.16, 0.009],
    [0.45, 0.008], [0.48, 0.018], [0.5, 0.008], [0.78, 0.008], [0.8, 0.016], [0.82, 0.008], [1.0, 0.01],
  ];
  for (const [t, r] of prof) p.push(new THREE.Vector2(r, t * h));
  return new THREE.LatheGeometry(p, 10);
}

function flutedColumn(r, h, flutes = 16) {
  const g = new THREE.CylinderGeometry(r, r, h, flutes * 4, 1, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 - 0.08 * Math.max(0, Math.cos(a * flutes));
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildStaircase() {
  const S = STAIR;
  const group = new THREE.Group();
  group.name = 'staircase';
  const metal = ivory();

  const riserMat = new THREE.MeshStandardMaterial({
    color: 0xece3cb, roughness: 0.6, metalness: 0.2,
    alphaMap: filigreeRiser(), alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const stringerTex = filigreeStringer();
  stringerTex.repeat.set(1, 1);
  const stringerMat = new THREE.MeshStandardMaterial({
    color: 0xe9dfc6, roughness: 0.6, metalness: 0.2,
    alphaMap: stringerTex, alphaTest: 0.5, side: THREE.DoubleSide,
  });

  const treads = [], risers = [], stringers = [], collars = [], brackets = [];

  for (let i = 0; i < S.steps; i++) {
    const a0 = S.startAngle + i * S.dTheta;
    const a1 = a0 + S.dTheta * 1.08;
    const y = (i + 1) * S.rise;

    // Tread: thin cast-iron wedge (shape in XY, rotated to lie flat; Y of shape = -Z of world).
    const tg = new THREE.ExtrudeGeometry(sectorShape(S.newelR, S.outerR, a0, a1), { depth: 0.025, bevelEnabled: false, curveSegments: 4 });
    tg.rotateX(-Math.PI / 2);
    tg.translate(0, y - 0.025, 0);
    treads.push(tg);

    // Riser: perforated vertical panel along the leading edge of the tread.
    const len = S.outerR - S.newelR;
    const rg = new THREE.PlaneGeometry(len, S.rise);
    rg.translate(S.newelR + len / 2, y - S.rise / 2, 0);
    rg.rotateY(a0);
    risers.push(rg);

    // Outer stringer fascia: curved band below the tread edge.
    const sg = new THREE.CylinderGeometry(S.outerR + 0.005, S.outerR + 0.005, 0.13, 6, 1, true, a0 + Math.PI / 2, S.dTheta * 1.05);
    sg.translate(0, y - 0.09, 0);
    stringers.push(sg);

    // Newel collar at each tread.
    const cg = new THREE.TorusGeometry(S.newelR + 0.012, 0.012, 6, 16);
    cg.rotateX(Math.PI / 2);
    cg.translate(0, y - 0.01, 0);
    collars.push(cg);

    // Curved support bracket under every other tread (visible arcs in the photo).
    if (i % 2 === 0) {
      const am = a0 + S.dTheta * 0.5;
      const curve = new THREE.QuadraticBezierCurve3(
        stairPoint(S.newelR, am, y - 0.45),
        stairPoint(S.outerR * 0.55, am, y - 0.05),
        stairPoint(S.outerR * 0.97, am, y - 0.04),
      );
      brackets.push(new THREE.TubeGeometry(curve, 10, 0.012, 5, false));
    }
  }

  group.add(new THREE.Mesh(mergeGeometries(treads), metal));
  group.add(new THREE.Mesh(mergeGeometries(risers), riserMat));
  group.add(new THREE.Mesh(mergeGeometries(stringers), stringerMat));
  group.add(new THREE.Mesh(mergeGeometries(collars), metal));
  group.add(new THREE.Mesh(mergeGeometries(brackets), metal));

  // Newel post running the full height, fluted and thicker for the lower section.
  const newel = new THREE.Mesh(new THREE.CylinderGeometry(S.newelR, S.newelR, S.height + 1.2, 16), metal);
  newel.position.y = (S.height + 1.2) / 2;
  group.add(newel);
  const lower = new THREE.Mesh(flutedColumn(0.2, 3.2), metal);
  lower.position.y = 1.6;
  group.add(lower);

  // Balusters: two per tread near the outer edge.
  const balG = balusterGeometry(S.railH);
  const nBal = S.steps * 2;
  const bal = new THREE.InstancedMesh(balG, metal, nBal);
  const m = new THREE.Matrix4();
  for (let i = 0; i < S.steps; i++) {
    for (let k = 0; k < 2; k++) {
      const a = S.startAngle + (i + 0.25 + k * 0.5) * S.dTheta;
      const p = stairPoint(S.outerR - 0.045, a, (i + 1) * S.rise);
      m.makeTranslation(p.x, p.y, p.z);
      bal.setMatrixAt(i * 2 + k, m);
    }
  }
  group.add(bal);

  // Helical handrail plus a lower parallel rail.
  class Helix extends THREE.Curve {
    constructor(r, dy) { super(); this.r = r; this.dy = dy; }
    getPoint(t) {
      const a = S.startAngle + t * S.steps * S.dTheta;
      return stairPoint(this.r, a, S.rise + t * (S.height - S.rise) + this.dy);
    }
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(S.outerR - 0.045, S.railH + 0.12), 600, 0.024, 8), metal));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(S.outerR - 0.045, 0.35), 600, 0.01, 6), metal));

  // Entrance gate: a curved cage section with a fan of gothic arches (bottom quarter turn).
  const gate = new THREE.Group();
  const gateR = S.outerR + 0.03;
  const gateBars = [];
  const nBars = 9;
  const gA0 = S.startAngle - Math.PI * 0.55, gA1 = S.startAngle - 0.05;
  for (let i = 0; i < nBars; i++) {
    const a = gA0 + ((gA1 - gA0) * i) / (nBars - 1);
    gateBars.push(new THREE.TubeGeometry(new THREE.LineCurve3(stairPoint(gateR, a, 0), stairPoint(gateR, a, 2.0)), 1, 0.012, 6));
    if (i < nBars - 1) {
      const b = gA0 + ((gA1 - gA0) * (i + 1)) / (nBars - 1);
      const mid = (a + b) / 2;
      const arc = new THREE.QuadraticBezierCurve3(stairPoint(gateR, a, 2.0), stairPoint(gateR, mid, 2.45), stairPoint(gateR, b, 2.0));
      gateBars.push(new THREE.TubeGeometry(arc, 10, 0.012, 6));
      // larger interlaced arch spanning two bays
      if (i < nBars - 2) {
        const c = gA0 + ((gA1 - gA0) * (i + 2)) / (nBars - 1);
        const arc2 = new THREE.QuadraticBezierCurve3(stairPoint(gateR, a, 2.0), stairPoint(gateR, b, 2.75), stairPoint(gateR, c, 2.0));
        gateBars.push(new THREE.TubeGeometry(arc2, 12, 0.01, 6));
      }
    }
  }
  const topRing = new THREE.TorusGeometry(gateR, 0.014, 6, 64, gA1 - gA0);
  topRing.rotateX(Math.PI / 2);
  topRing.rotateY(gA0);
  topRing.translate(0, 2.0, 0);
  gateBars.push(topRing);
  gate.add(new THREE.Mesh(mergeGeometries(gateBars.map((g) => g.toNonIndexed())), metal));
  group.add(gate);

  // Top gallery: a ring platform with balustrade, joined to the glasshouse by a walkway.
  const top = S.height + 0.02;
  const deck = new THREE.Mesh(new THREE.RingGeometry(S.newelR, 1.45, 48), riserMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = top;
  group.add(deck);
  const deckEdge = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.14, 48, 1, true), stringerMat);
  deckEdge.position.y = top - 0.07;
  group.add(deckEdge);
  const ringRail = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.022, 8, 64), metal);
  ringRail.rotation.x = Math.PI / 2;
  ringRail.position.y = top + S.railH;
  group.add(ringRail);
  const galBal = new THREE.InstancedMesh(balG, metal, 40);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    m.makeTranslation(1.42 * Math.cos(a), top, -1.42 * Math.sin(a));
    galBal.setMatrixAt(i, m);
  }
  group.add(galBal);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// Camera path for the "climb" tour: eye height above the walking line of the treads.
export function climbPose(t) {
  const S = STAIR;
  const a = S.startAngle + t * S.steps * S.dTheta;
  const y = S.rise + t * (S.height - S.rise) + 1.6;
  const pos = stairPoint(0.58, a, y);
  const look = stairPoint(0.58, a + 0.6, y + 0.25).add(stairPoint(0.9, a + 0.6, 0).multiplyScalar(0.6).setY(0));
  return { pos, look };
}
