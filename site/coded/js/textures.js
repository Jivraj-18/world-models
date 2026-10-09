// Procedural canvas textures: cast-iron filigree, scalloped glazing, leaves, bark, ground.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = [1, 1], color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Riser panel: a row of pierced quatrefoils and lozenges, white = metal, black = hole.
export function filigreeRiser() {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#000';
  const cell = 64;
  for (let x = cell / 2; x < 1024; x += cell) {
    // quatrefoil: four small circles around a centre
    for (const [dx, dy] of [[0, -14], [0, 14], [-14, 0], [14, 0]]) {
      g.beginPath(); g.arc(x + dx, 64 + dy, 9, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.arc(x, 64, 7, 0, Math.PI * 2); g.fill();
    // lozenges between quatrefoils
    g.beginPath();
    g.moveTo(x + cell / 2, 40); g.lineTo(x + cell / 2 + 6, 64);
    g.lineTo(x + cell / 2, 88); g.lineTo(x + cell / 2 - 6, 64); g.fill();
  }
  // solid border frame
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 1024, 16); g.fillRect(0, 112, 1024, 16);
  return tex(c, { color: false });
}

// Outer stringer: pierced scrollwork (C-scrolls and rosettes).
export function filigreeStringer() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#000'; g.lineWidth = 7; g.fillStyle = '#000';
  for (let x = 32; x < 512; x += 64) {
    g.beginPath(); g.arc(x, 64, 18, 0.3, Math.PI * 1.7); g.stroke();
    g.beginPath(); g.arc(x + 32, 64, 18, Math.PI + 0.3, Math.PI * 2.7); g.stroke();
    g.beginPath(); g.arc(x, 64, 5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 512, 22); g.fillRect(0, 106, 512, 22);
  return tex(c, { color: false });
}

// Glazing: overlapping panes with scalloped (fish-scale) lower edges and glazing bars.
export function glazing() {
  const [c, g] = canvas(256, 512);
  g.clearRect(0, 0, 256, 512);
  g.strokeStyle = 'rgba(240,236,220,0.9)';
  // vertical glazing bars
  g.lineWidth = 6;
  for (const x of [3, 253]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  // scalloped pane overlaps
  g.lineWidth = 3; g.strokeStyle = 'rgba(235,240,235,0.55)';
  for (let y = 40; y < 512; y += 64) {
    g.beginPath(); g.moveTo(0, y);
    g.quadraticCurveTo(128, y + 26, 256, y); g.stroke();
  }
  return tex(c);
}

// Fan-palm / broadleaf leaf alpha shapes drawn as a single elongated leaf.
export function leaf(colorA = '#4f7a3a', colorB = '#7da35a') {
  const [c, g] = canvas(128, 256);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, colorA); grad.addColorStop(0.5, colorB); grad.addColorStop(1, colorA);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(64, 4);
  g.bezierCurveTo(124, 70, 120, 190, 64, 252);
  g.bezierCurveTo(8, 190, 4, 70, 64, 4);
  g.fill();
  g.strokeStyle = 'rgba(220,235,190,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(64, 10); g.lineTo(64, 248); g.stroke();
  return tex(c);
}

export function bark() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#5b4a36'; g.fillRect(0, 0, 256, 512);
  // fibrous palm trunk: horizontal leaf-base scars and vertical fibres
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 256, y = Math.random() * 512;
    g.strokeStyle = `rgba(${40 + Math.random() * 60},${30 + Math.random() * 40},${20 + Math.random() * 25},0.6)`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + 10 + Math.random() * 20); g.stroke();
  }
  for (let y = 0; y < 512; y += 22) {
    g.strokeStyle = 'rgba(30,22,14,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 8, 170, y - 8, 256, y); g.stroke();
  }
  return tex(c, { repeat: [2, 6] });
}

export function ground() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#4b3e2e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    const v = 50 + Math.random() * 60;
    g.fillStyle = `rgba(${v + 15},${v},${v - 15},${0.3 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  return tex(c, { repeat: [24, 24] });
}

export function gravelPath() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#b9ad95'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 150 + Math.random() * 70;
    g.fillStyle = `rgb(${v},${v - 8},${v - 25})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { repeat: [3, 30] });
}
