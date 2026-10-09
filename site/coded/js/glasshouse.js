// Glasshouse pavilion: an elongated iron-and-glass dome with meridian ribs, ring purlins,
// scalloped glazing, primary structural arches and tie rods.
import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glazing } from './textures.js';

export const HOUSE = { a: 15, b: 11, H: 19, ribs: 40, rings: 9, wall: 3.2 };

// v in [0,1]: 0 = top of the low glazed wall, 1 = crown.
export function domePoint(u, v, target = new THREE.Vector3(), inset = 0) {
  const { a, b, H, wall } = HOUSE;
  const ang = u * Math.PI * 2;
  const r = Math.pow(Math.cos((v * Math.PI) / 2), 0.75);
  const y = wall + (H - wall) * Math.sin((v * Math.PI) / 2);
  return target.set((a - inset) * r * Math.cos(ang), y, -(b - inset) * r * Math.sin(ang));
}

export function buildGlasshouse() {
  const { a, b, ribs, rings, wall } = HOUSE;
  const group = new THREE.Group();
  group.name = 'glasshouse';
  const iron = new THREE.MeshStandardMaterial({ color: 0xece5d2, roughness: 0.5, metalness: 0.3 });

  const glazeTex = glazing();
  glazeTex.repeat.set(ribs * 2, 26);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe8f3ef, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const bars = new THREE.MeshBasicMaterial({ map: glazeTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });

  const roofGeo = new ParametricGeometry((u, v, t) => domePoint(u, v * 0.985, t), 160, 40);
  const roof = new THREE.Mesh(roofGeo, glass);
  roof.renderOrder = 2;
  group.add(roof);
  const roofBars = new THREE.Mesh(roofGeo, bars);
  roofBars.renderOrder = 3;
  group.add(roofBars);

  // Low glazed side wall.
  const wallGeo = new ParametricGeometry((u, v, t) => {
    const ang = u * Math.PI * 2;
    return t.set(a * Math.cos(ang), v * wall, -b * Math.sin(ang));
  }, 160, 2);
  group.add(new THREE.Mesh(wallGeo, glass));
  const wallTex = glazing(); wallTex.repeat.set(ribs * 2, 3);
  group.add(new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ map: wallTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })));

  const tubes = [];
  // Meridian ribs.
  for (let i = 0; i < ribs; i++) {
    const u = i / ribs;
    const pts = [];
    const ang = u * Math.PI * 2;
    pts.push(new THREE.Vector3(a * Math.cos(ang), 0, -b * Math.sin(ang)));
    for (let k = 0; k <= 24; k++) pts.push(domePoint(u, (k / 24) * 0.985, new THREE.Vector3(), 0.05));
    const primary = i % 5 === 0;
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, primary ? 0.11 : 0.045, primary ? 8 : 5));
  }
  // Ring purlins.
  for (let k = 1; k < rings; k++) {
    const v = k / rings;
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(domePoint(i / 96, v, new THREE.Vector3(), 0.06));
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.04, 5, true));
  }
  // Eaves ring.
  {
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(domePoint(i / 96, 0, new THREE.Vector3(), 0.05));
    tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.1, 6, true));
  }
  group.add(new THREE.Mesh(mergeGeometries(tubes.map((g) => g.toNonIndexed())), iron));

  // Big diagonal structural tube and horizontal tie rods (as seen on the right of the photo).
  const extra = [];
  const diag = new THREE.CatmullRomCurve3([
    new THREE.Vector3(9.5, 0, -2.5), new THREE.Vector3(8.0, 6, -1.0),
    new THREE.Vector3(5.5, 11, 1.0), new THREE.Vector3(2.5, 15.5, 2.0),
  ]);
  extra.push(new THREE.TubeGeometry(diag, 60, 0.28, 12));
  for (const [y, len] of [[7.2, 13], [11.5, 9]]) {
    extra.push(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-len, y, -1.5), new THREE.Vector3(len, y, -1.5)), 1, 0.05, 6));
  }
  group.add(new THREE.Mesh(mergeGeometries(extra.map((g) => g.toNonIndexed())), iron));

  // Hanging lamp on a wire (right of the stair in the photo).
  const lamp = new THREE.Group();
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 9, 4), iron);
  wire.position.y = 4.5;
  lamp.add(wire);
  for (let i = 0; i < 5; i++) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.008, 0.13 - i * 0.008, 0.03, 16), iron);
    disc.position.y = -0.06 * i;
    lamp.add(disc);
  }
  lamp.position.set(3.2, 4.6, 1.2);
  group.add(lamp);

  group.traverse((o) => { if (o.isMesh && o.material === iron) o.castShadow = true; });
  return group;
}
