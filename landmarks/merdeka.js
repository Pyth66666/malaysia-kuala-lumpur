// Dataran Merdeka (Independence Square) + Bangunan Sultan Abdul Samad (1897, A. C. Norman).
// Outlines, flagpole, fountain and tree positions come from OSM (see merdeka_data.js), metres from KLCC.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SAS_OUTLINE, PADANG, SQUARE, TREES, FOUNTAIN } from './merdeka_data.js';
import { rng, noiseTex } from './facade.js';
import { prism, polyCap, circle, strut, lathe, box } from './geom.js';

export const MERDEKA = {
  clockTower: [-1926.0, 1011.0],                 // beside the 1894 foundation-stone plaque in OSM
  turrets: [[-1916.4, 979.2, 3.3, 23, 1], [-1930.6, 1045.8, 3.3, 23, 1], [-1876.9, 981.0, 2.6, 20, 0.8], [-1868.5, 1033.6, 2.6, 20, 0.8]],
  flagpole: [-2031.47, 1112.95], flagpoleH: 95,
  wallH: 17.5,                                   // two tall storeys + parapet
};
// facade axis (north→south along Jalan Raja), from the two front turrets
const AX = (() => { const [a, b] = [MERDEKA.turrets[0], MERDEKA.turrets[1]]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
const AXIS_ROT = Math.atan2(AX[0], AX[1]);       // rotation.y that aligns local +z with the facade axis

function cnv(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, srgb = true, rep = true){
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// Red-brick + cream-plaster arcade (two storeys of striped horseshoe arches) — the SAS signature.
function arcadeTextures(){
  const px = 56, W = Math.round(4.4 * px), H = Math.round(MERDEKA.wallH * px), R = rng(19);
  const a = cnv(W, H), hm = cnv(W, H), em = cnv(W, H);
  const g = a.getContext('2d'), h = hm.getContext('2d'), e = em.getContext('2d');
  const Y = m => H - m * px;                     // metres from ground -> canvas y
  // bricks
  g.fillStyle = '#b9a68c'; g.fillRect(0, 0, W, H); h.fillStyle = '#606060'; h.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const bw = 0.23 * px, bh = 0.075 * px;
  for (let row = 0, y = 0; y < H; row++, y += bh) for (let x = -bw; x < W + bw; x += bw){
    const c = new THREE.Color('#a4472f').multiplyScalar(0.82 + R() * 0.32);
    g.fillStyle = '#' + c.getHexString(); g.fillRect(x + (row % 2) * bw / 2 + 0.5, y + 0.5, bw - 1, bh - 1);
  }
  const band = (y0, y1, col = '#efe7d4') => { g.fillStyle = col; g.fillRect(0, Y(y1), W, (y1 - y0) * px); h.fillStyle = '#b0b0b0'; h.fillRect(0, Y(y1), W, (y1 - y0) * px); };
  // striped horseshoe arch: alternating cream/brick voussoirs around a dark recess
  function arch(cx, y0, wOpen, hOpen, lit){
    const r = wOpen / 2, spring = y0 + hOpen - r;
    const ring = 0.32;
    for (let k = 0; k < 13; k++){                // voussoirs
      const a0 = Math.PI * 1.08 - k * (Math.PI * 1.16 / 13), a1 = a0 - Math.PI * 1.16 / 13;
      g.beginPath(); g.moveTo(cx * px + Math.cos(a0) * (r + ring) * px, Y(spring) - Math.sin(a0) * (r + ring) * px);
      g.arc(cx * px, Y(spring), (r + ring) * px, -a0, -a1); g.arc(cx * px, Y(spring), r * px, -a1, -a0, true); g.closePath();
      g.fillStyle = k % 2 ? '#a4472f' : '#f1e9d6'; g.fill();
    }
    g.beginPath(); g.moveTo((cx - r) * px, Y(y0)); g.lineTo((cx - r) * px, Y(spring));
    g.arc(cx * px, Y(spring), r * px, Math.PI * 1.0, 0, false); g.lineTo((cx + r) * px, Y(y0)); g.closePath();
    const grd = g.createLinearGradient(0, Y(y0 + hOpen), 0, Y(y0)); grd.addColorStop(0, '#120f0d'); grd.addColorStop(1, '#3a3029');
    g.fillStyle = grd; g.fill();
    h.beginPath(); h.moveTo((cx - r) * px, Y(y0)); h.lineTo((cx - r) * px, Y(spring)); h.arc(cx * px, Y(spring), r * px, Math.PI, 0); h.lineTo((cx + r) * px, Y(y0)); h.closePath();
    h.fillStyle = '#202020'; h.fill();
    if (lit){ e.beginPath(); e.moveTo((cx - r) * px, Y(y0)); e.lineTo((cx - r) * px, Y(spring)); e.arc(cx * px, Y(spring), r * px, Math.PI, 0); e.lineTo((cx + r) * px, Y(y0)); e.closePath(); e.fillStyle = '#ffcf8a'; e.fill(); }
  }
  band(0, 0.9);                                  // plinth
  arch(2.2, 0.9, 2.5, 5.4, true);                // ground-floor verandah
  band(7.3, 7.9); band(8.1, 8.3);                // first-floor band
  arch(2.2, 8.5, 2.3, 5.2, R() < 0.6);           // upper verandah
  band(14.6, 15.4);                              // cornice
  // crenellated parapet with cream copings
  for (let x = 0; x < 4.4; x += 1.1){ g.fillStyle = '#f1e9d6'; g.fillRect(x * px, Y(MERDEKA.wallH), 0.55 * px, 0.35 * px); }
  // pilasters between bays
  for (const x of [0, 4.4]){ g.fillStyle = '#efe7d4'; g.fillRect((x - 0.18) * px, 0, 0.36 * px, H); h.fillStyle = '#c0c0c0'; h.fillRect((x - 0.18) * px, 0, 0.36 * px, H); }
  // weathering
  g.globalAlpha = 0.07; for (let i = 0; i < 40; i++){ g.fillStyle = '#2b231b'; g.fillRect(R() * W, Y(15.4), 1 + R() * 2, (3 + R() * 8) * px); } g.globalAlpha = 1;
  // normal map from height
  const src = h.getImageData(0, 0, W, H).data, nm = cnv(W, H), n = nm.getContext('2d'), img = n.createImageData(W, H);
  const HH = (x, y) => src[((Math.min(H - 1, Math.max(0, y))) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const dx = (HH(x + 1, y) - HH(x - 1, y)) * 2.5, dy = (HH(x, y + 1) - HH(x, y - 1)) * 2.5, l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  n.putImageData(img, 0, 0);
  return { map: canvasTex(a), normalMap: canvasTex(nm, false), emissiveMap: canvasTex(em) };
}

function clockFace(){
  const c = cnv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#f7f2e3'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 8; g.stroke();
  for (let i = 0; i < 60; i++){
    const a = i / 60 * Math.PI * 2, r0 = i % 5 ? 108 : 96;
    g.lineWidth = i % 5 ? 2 : 6; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); g.stroke();
  }
  const hand = (a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
  hand(Math.PI * 2 * (10 + 10 / 60) / 12, 62, 9); hand(Math.PI * 2 * 10 / 60, 92, 6);
  return canvasTex(c, true, false);
}

// Jalur Gemilang: 14 red/white stripes, blue canton with yellow crescent and 14-point star.
function malaysiaFlag(){
  const W = 1024, H = 512, c = cnv(W, H), g = c.getContext('2d');
  for (let i = 0; i < 14; i++){ g.fillStyle = i % 2 ? '#ffffff' : '#cc0001'; g.fillRect(0, i * H / 14, W, H / 14 + 1); }
  const cw = W / 2, ch = H * 8 / 14;
  g.fillStyle = '#010066'; g.fillRect(0, 0, cw, ch);
  const cy = ch / 2, R = ch * 0.38;
  g.fillStyle = '#ffcc00'; g.beginPath(); g.arc(cw * 0.36, cy, R, 0, 7); g.fill();
  g.fillStyle = '#010066'; g.beginPath(); g.arc(cw * 0.36 + R * 0.28, cy, R * 0.86, 0, 7); g.fill();
  g.fillStyle = '#ffcc00'; g.beginPath();
  const sx = cw * 0.68, ro = R * 0.62, ri = ro * 0.45;
  for (let i = 0; i < 28; i++){ const a = i / 28 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? ri : ro; g.lineTo(sx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return canvasTex(c, true, false);
}

const onionProfile = (r, h) => [[0, 0], [r * 0.92, 0], [r * 1.12, h * 0.18], [r * 1.2, h * 0.32], [r * 1.08, h * 0.5], [r * 0.78, h * 0.66], [r * 0.42, h * 0.8], [r * 0.16, h * 0.91], [r * 0.05, h]];

function nonIdx(list){ return list.map(g => { g = g.index ? g.toNonIndexed() : g; if (!g.getAttribute('normal')) g.computeVertexNormals(); if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }); }
const merge = list => mergeGeometries(nonIdx(list));

export function buildMerdeka(){
  const M = MERDEKA;
  const root = new THREE.Group(); root.name = 'DataranMerdeka';
  const tx = arcadeTextures();
  const brick = new THREE.MeshStandardMaterial({ map: tx.map, normalMap: tx.normalMap, roughness: 0.88, metalness: 0, emissiveMap: tx.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.8, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const copper = new THREE.MeshPhysicalMaterial({ color: 0x5e4330, metalness: 0.85, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.4,
    roughnessMap: noiseTex({ size: 128, base: '#9a9a9a', vary: 0.35, specks: 2500, seed: 8 }) });
  const roof = new THREE.MeshStandardMaterial({ color: 0x6f5b4b, roughness: 0.9 });
  const lampMats = [brick, plaster];

  // ---- Sultan Abdul Samad: real OSM footprint, arcaded brick walls --------------------------
  const sas = new THREE.Group(); sas.name = 'SultanAbdulSamad';
  const walls = new THREE.Mesh(prism(SAS_OUTLINE, 0, M.wallH, { tileW: 4.4, tileH: M.wallH, smoothDeg: 20 }), brick);
  walls.castShadow = walls.receiveShadow = true; sas.add(walls);
  sas.add(new THREE.Mesh(polyCap(SAS_OUTLINE, M.wallH - 0.4, true), roof));
  // parapet finials every ~5.5 m along the outline (the little cream pinnacles on the roofline)
  const fin = [];
  for (let i = 0, acc = 0; i < SAS_OUTLINE.length; i++){
    const [ax, az] = SAS_OUTLINE[i], [bx, bz] = SAS_OUTLINE[(i + 1) % SAS_OUTLINE.length], L = Math.hypot(bx - ax, bz - az);
    for (let d = (5.5 - acc % 5.5); d < L; d += 5.5){
      const x = ax + (bx - ax) * d / L, z = az + (bz - az) * d / L;
      const p = new THREE.CylinderGeometry(0.22, 0.3, 1.4, 8); p.translate(x, M.wallH + 0.7, z); fin.push(p);
      const c = new THREE.ConeGeometry(0.3, 0.8, 8); c.translate(x, M.wallH + 1.8, z); fin.push(c);
    }
    acc += L;
  }
  sas.add(new THREE.Mesh(merge(fin), plaster));

  // ---- clock tower: 41.2 m, square shaft, clock faces, belfry, copper onion dome ------------
  const ct = new THREE.Group(); ct.position.set(M.clockTower[0], 0, M.clockTower[1]); ct.rotation.y = AXIS_ROT;
  const shaftW = 9.6;
  const sq = (w) => [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]];
  const shaft = new THREE.Mesh(prism(sq(shaftW), 0, 31, { tileW: 4.8, tileH: M.wallH }), brick); shaft.castShadow = true; ct.add(shaft);
  const pl = [];
  for (const [y, w, hh] of [[17.0, shaftW + 0.8, 0.9], [24.0, shaftW + 0.5, 0.5], [31, shaftW + 1.2, 1.0]]){ const b = box(w, hh, w); b.translate(0, y + hh / 2, 0); pl.push(b); }
  // belfry: four corner piers with arched openings + entablature
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const b = box(1.6, 3.6, 1.6); b.translate(sx * 3.4, 33.8, sz * 3.4); pl.push(b); }
  { const b = box(8.6, 0.8, 8.6); b.translate(0, 36, 0); pl.push(b); }
  // corner chhatris (small domed kiosks) on the 31 m cornice
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]){ const p = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6); p.translate(sx * 4.9 + dx, 33.1, sz * 4.9 + dz); pl.push(p); }
  }
  ct.add(new THREE.Mesh(merge(pl), plaster));
  const cupolas = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const d = lathe(onionProfile(0.75, 1.9), 16); d.translate(sx * 4.9, 34.2, sz * 4.9); cupolas.push(d); }
  const drum = lathe([[0, 0], [4.0, 0], [4.0, 1.2], [3.7, 1.4], [0, 1.4]], 32); drum.translate(0, 36.8, 0);
  const dome = lathe(onionProfile(3.6, 6.2), 40); dome.translate(0, 38.0, 0);
  const finial = lathe([[0.18, 0], [0.35, 0.4], [0.12, 0.9], [0.25, 1.3], [0.05, 2.6], [0.01, 2.7]], 12); finial.translate(0, 44.1, 0);
  const domes = new THREE.Mesh(merge([dome, finial, ...cupolas]), copper); domes.castShadow = true; ct.add(domes);
  ct.add(new THREE.Mesh(merge([drum]), plaster));
  const belfryCore = new THREE.Mesh(box(5.6, 3.6, 5.6), new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 })); belfryCore.position.y = 33.8; ct.add(belfryCore);
  const clockMat = new THREE.MeshStandardMaterial({ map: clockFace(), roughness: 0.6, emissive: 0xfff2d0, emissiveIntensity: 0, emissiveMap: null });
  for (let k = 0; k < 4; k++){
    const f = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), clockMat);
    const a = k * Math.PI / 2; f.position.set(Math.sin(a) * (shaftW / 2 + 0.06), 27.6, Math.cos(a) * (shaftW / 2 + 0.06)); f.rotation.y = a; ct.add(f);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.14, 8, 40), plaster); rim.position.copy(f.position); rim.rotation.y = a; ct.add(rim);
  }
  sas.add(ct);

  // ---- round turrets with copper onion domes ----------------------------------------------
  const tw = [], td = [], tp = [];
  for (const [x, z, r, h, s] of M.turrets){
    const c = circle(r, 28, x, z);
    tw.push(prism(c, 0, h, { tileW: 4.4, tileH: M.wallH, smoothDeg: 40 }));
    const ring = lathe([[0, 0], [r + 0.5, 0], [r + 0.5, 0.8], [r + 0.2, 1.1], [0, 1.1]], 28); ring.translate(x, h, z); tp.push(ring);
    const d = lathe(onionProfile(r * 0.98, 5.6 * s), 32); d.translate(x, h + 1.1, z); td.push(d);
    const f = lathe([[0.12, 0], [0.25, 0.3], [0.06, 1.6], [0.01, 1.7]], 10); f.translate(x, h + 1.1 + 5.6 * s, z); td.push(f);
  }
  const twm = new THREE.Mesh(merge(tw), brick); twm.castShadow = true; sas.add(twm);
  sas.add(new THREE.Mesh(merge(tp), plaster));
  const tdm = new THREE.Mesh(merge(td), copper); tdm.castShadow = true; sas.add(tdm);
  root.add(sas);

  // ---- the padang: mown cricket field with stripes along its long axis ---------------------
  const stripeC = cnv(64, 64), sg = stripeC.getContext('2d'), R = rng(5);
  sg.fillStyle = '#4f8a3a'; sg.fillRect(0, 0, 64, 64); sg.fillStyle = '#5f9a45'; sg.fillRect(0, 0, 32, 64);
  for (let i = 0; i < 700; i++){ sg.fillStyle = R() < 0.5 ? 'rgba(30,60,20,0.25)' : 'rgba(150,190,90,0.18)'; sg.fillRect(R() * 64, R() * 64, 1, 2); }
  const grassTex = canvasTex(stripeC);
  const along = (x, z) => [(x * AX[1] - z * AX[0]) / 16, (x * AX[0] + z * AX[1]) / 16];  // stripes parallel to the facade
  const padang = new THREE.Mesh(polyCap(PADANG, 0.22, true, along), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  padang.receiveShadow = true; root.add(padang);
  // paved square around it
  const paveC = cnv(128, 128), pg = paveC.getContext('2d');
  pg.fillStyle = '#b9b0a3'; pg.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 32){ pg.fillStyle = `rgb(${170 + R() * 30 | 0},${162 + R() * 28 | 0},${150 + R() * 26 | 0})`; pg.fillRect(x + (y / 16 % 2) * 16 + 1, y + 1, 30, 14); }
  const pave = new THREE.Mesh(polyCap(SQUARE, 0.16, true, (x, z) => [x / 4, z / 4]), new THREE.MeshStandardMaterial({ map: canvasTex(paveC), roughness: 0.9 }));
  pave.receiveShadow = true; root.add(pave);

  // ---- 95 m flagpole with the Jalur Gemilang ------------------------------------------------
  const [fx, fz] = M.flagpole, FH = M.flagpoleH;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.7, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
  const pole = new THREE.Mesh(merge([strut([fx, 0, fz], [fx, FH, fz], 0.75, 0.18, 16),
    (() => { const s = new THREE.SphereGeometry(0.45, 16, 10); s.translate(fx, FH + 0.3, fz); return s; })(),
    (() => { const b = lathe([[0, 0], [5.5, 0], [5.5, 0.5], [3.5, 0.9], [3.5, 1.6], [0, 1.6]], 8); b.translate(fx, 0, fz); return b; })()]), poleMat);
  pole.castShadow = true; root.add(pole);
  const FW = 18, FHt = 9;
  const flagGeo = new THREE.PlaneGeometry(FW, FHt, 36, 12); flagGeo.translate(FW / 2, -FHt / 2, 0);
  const flagBase = flagGeo.getAttribute('position').array.slice();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: malaysiaFlag(), side: THREE.DoubleSide, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0, emissiveMap: null }));
  flag.position.set(fx + 0.2, FH - 0.4, fz); flag.rotation.y = -0.6; flag.castShadow = true; root.add(flag);

  // ---- Queen Victoria Fountain (1897), cast iron tiers -------------------------------------
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3f6f78, metalness: 0.5, roughness: 0.5 });
  const fnt = lathe([[0, 0], [3.4, 0], [3.4, 0.7], [3.0, 0.75], [0.6, 0.9], [0.5, 2.6], [1.9, 2.9], [2.0, 3.2], [0.4, 3.3], [0.3, 4.6], [1.0, 4.8], [1.05, 5.0], [0.25, 5.1], [0.2, 6.2], [0.45, 6.5], [0.05, 7.2]], 8);
  fnt.translate(FOUNTAIN[0], 0.16, FOUNTAIN[1]);
  root.add(new THREE.Mesh(merge([fnt]), ironMat));
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.95, 8), new THREE.MeshStandardMaterial({ color: 0x4f7f95, metalness: 0.2, roughness: 0.05 }));
  water.rotation.x = -Math.PI / 2; water.rotation.z = Math.PI / 8; water.position.set(FOUNTAIN[0], 0.86, FOUNTAIN[1]); root.add(water);

  // ---- surveyed trees (OSM natural=tree): rain trees with broad umbrella crowns --------------
  const trunkG = [], crownG = [];
  for (const [x, z] of TREES){
    const s = 0.8 + rng(Math.round(x * z))() * 0.5;
    trunkG.push(strut([x, 0, z], [x, 5 * s, z], 0.45 * s, 0.3 * s, 8));
    for (let k = 0; k < 4; k++){
      const r2 = rng(Math.round(x * 31 + z * 7 + k)), c = new THREE.IcosahedronGeometry(3.4 * s, 1);
      c.scale(1.25, 0.55, 1.25); c.translate(x + (r2() - 0.5) * 4 * s, 6.6 * s + r2() * 1.2, z + (r2() - 0.5) * 4 * s); crownG.push(c);
    }
  }
  if (TREES.length){
    root.add(new THREE.Mesh(merge(trunkG), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 })));
    const cr = new THREE.Mesh(merge(crownG), new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.95, flatShading: true })); cr.castShadow = true; root.add(cr);
  }

  function setNight(on){
    brick.emissiveIntensity = on ? 0.9 : 0;              // warm lamps in the verandahs
    plaster.emissiveIntensity = on ? 0.35 : 0;           // floodlit trim
    clockMat.emissiveIntensity = on ? 0.8 : 0;
    poleMat.emissiveIntensity = on ? 0.25 : 0;
  }
  function update(t){                                    // flag waving in the breeze
    const p = flagGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++){
      const x = flagBase[i * 3], y = flagBase[i * 3 + 1], k = x / FW;
      p.setZ(i, Math.sin(x * 0.45 - t * 4.2 + y * 0.12) * 1.1 * k + Math.sin(x * 0.9 - t * 6.5) * 0.3 * k);
      p.setY(i, y - k * k * 0.6);
    }
    p.needsUpdate = true; flagGeo.computeVertexNormals();
  }
  return { group: root, setNight, update, excludeOsmIds: [801337963] };
}
