// Merdeka 118 (Fender Katsalidis, 2023): 678.9 m, 118 storeys, the world's second-tallest building.
// The faceted glass skin is read off the songket pattern: big triangular folds that flip in and out
// between levels, a body that holds its width and then draws in, a faceted crown and a 160 m spire.
// Footprint = OSM outline of the tower (see m118_data.js), simplified to its main corners.
import * as THREE from 'three';
import { curtainWall, noiseTex } from './facade.js';
import { prism, cap, strut, circle } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M118_OUTLINE, M118_TIERS } from './m118_data.js';

export const M118 = { roof: 550, crownTop: 600, tip: 678.9, outline: M118_OUTLINE };

function physical(tx, opts = {}){
  return new THREE.MeshPhysicalMaterial({
    map: tx.map, roughnessMap: tx.ormMap, metalnessMap: tx.ormMap, normalMap: tx.normalMap,
    roughness: 1, metalness: 1, emissiveMap: tx.emissiveMap || null,
    emissive: tx.emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: 0, envMapIntensity: 1.25, ...opts,
  });
}
const clean = g => {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};
const merge = list => mergeGeometries(list.map(clean));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// plan scale [x, z] at height y, from the OSM tier widths, then the crown drawing to a point
function scaleAt(y){
  const T = M118_TIERS, [, w0, d0] = T[0];
  if (y >= M118.roof){
    const [, w, d] = T[T.length - 1], k = 1 - 0.88 * smooth(M118.roof, M118.crownTop, y);
    return [w / w0 * k, d / d0 * k];
  }
  for (let i = 0; i < T.length - 1; i++){
    const [ya, wa, da] = T[i], [yb, wb, db] = T[i + 1];
    if (y <= yb){ const t = (y - ya) / (yb - ya); return [(wa + (wb - wa) * t) / w0, (da + (db - da) * t) / d0]; }
  }
  return [1, 1];
}

// Lofted faceted skin. Each ring has the outline corners plus one crease point per edge; creases
// push out on even rings and in on odd rings (alternating per edge), so every edge reads as a
// column of diamonds made from triangles with their own flat normals.
function faceted(outline, levels, foldOf){
  const n = outline.length;
  let cx = 0, cz = 0; for (const [x, z] of outline){ cx += x; cz += z; } cx /= n; cz /= n;
  const ring = (y, k) => {
    const [sx, sz] = scaleAt(y), pts = [];
    for (let i = 0; i < n; i++){
      const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % n];
      const A = [cx + (ax - cx) * sx, cz + (az - cz) * sz], B = [cx + (bx - cx) * sx, cz + (bz - cz) * sz];
      let nx = B[1] - A[1], nz = -(B[0] - A[0]); const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      if (nx * (mx - cx) + nz * (mz - cz) < 0){ nx = -nx; nz = -nz; }
      const sign = ((k + i) % 2 === 0) ? 1 : -1, f = foldOf(y) * L * sign;
      pts.push(A, [mx + nx * f, mz + nz * f]);
    }
    return pts;
  };
  const pos = [], uv = [];
  for (let k = 0; k < levels.length - 1; k++){
    const y0 = levels[k], y1 = levels[k + 1], R0 = ring(y0, k), R1 = ring(y1, k + 1), m = R0.length;
    let u = 0;
    for (let i = 0; i < m; i++){
      const j = (i + 1) % m;
      const a = R0[i], b = R0[j], c = R1[j], d = R1[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // split each quad along the diagonal that makes the fold read (alternating)
      const P = [[a[0], y0, a[1], u, y0], [b[0], y0, b[1], u + L, y0], [c[0], y1, c[1], u + L, y1], [d[0], y1, d[1], u, y1]];
      const tris = ((i + k) % 2) ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]];
      for (const t of tris) for (const q of t){ pos.push(P[q][0], P[q][1], P[q][2]); uv.push(P[q][3], P[q][4]); }
      u += L;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // orient every triangle outward (normal pointing away from the axis)
  const p = g.getAttribute('position'), t = g.getAttribute('uv');
  const v = [0, 1, 2].map(() => new THREE.Vector3());
  for (let i = 0; i < p.count; i += 3){
    for (let q = 0; q < 3; q++) v[q].fromBufferAttribute(p, i + q);
    const nrm = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const mid = v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1 / 3);
    if (nrm.x * (mid.x - cx) + nrm.z * (mid.z - cz) < 0){
      for (const attr of [p, t]) for (let c = 0; c < attr.itemSize; c++){
        const tmp = attr.getComponent(i + 1, c); attr.setComponent(i + 1, c, attr.getComponent(i + 2, c)); attr.setComponent(i + 2, c, tmp);
      }
    }
  }
  g.computeVertexNormals();     // non-indexed -> flat facets
  return { geom: g, ring, center: [cx, cz] };
}

export function buildMerdeka118(){
  const root = new THREE.Group(); root.name = 'Merdeka118';
  const O = M118.outline;

  // glass: pale silver-blue, 4.2 m floors, slim mullions, a thin spandrel line every floor
  const tx = curtainWall({ tileW: 6, floorH: 4.2, floors: 2, px: 56, mullion: 1.5, mullionW: 0.06,
    bands: [{ h: 0.55, kind: 'steel', rough: 60, metal: 200 }, { h: 3.65, kind: 'glass', metal: 80 }],
    glass: '#6d8596', glassVar: 0.14, steel: '#cfd6dc', litChance: 0.38, seed: 118, steelGlow: 0.5 });
  for (const k of ['map', 'ormMap', 'normalMap', 'emissiveMap']) tx[k].repeat.set(1 / tx.tileW, 1 / tx.tileH);
  const glass = physical(tx, { normalScale: new THREE.Vector2(0.8, 0.8) });
  const crownTx = curtainWall({ tileW: 3, floorH: 3, floors: 1, px: 48, mullion: 1, mullionW: 0.1,
    bands: [{ h: 0.4, kind: 'steel' }, { h: 2.6, kind: 'glass', metal: 90 }], glass: '#8aa2b6', litChance: 0, seed: 119, steelGlow: 0.9 });
  for (const k of ['map', 'ormMap', 'normalMap', 'emissiveMap']) crownTx[k].repeat.set(1 / crownTx.tileW, 1 / crownTx.tileH);
  const crownMat = physical(crownTx, { emissive: 0xfff1d6 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xdfe3e7, metalness: 1, roughness: 0.25, envMapIntensity: 1.4, emissive: 0xffffff, emissiveIntensity: 0,
    roughnessMap: noiseTex({ size: 128, base: '#808080', vary: 0.4, specks: 3000, seed: 7 }) });
  const podiumTx = curtainWall({ tileW: 6, floorH: 6, floors: 1, px: 32, mullion: 2, mullionW: 0.1,
    bands: [{ h: 1.2, kind: 'steel' }, { h: 4.8, kind: 'glass' }], glass: '#3f5d70', litChance: 0.9, warm: [255, 228, 190], seed: 120 });
  for (const k of ['map', 'ormMap', 'normalMap', 'emissiveMap']) podiumTx[k].repeat.set(1 / podiumTx.tileW, 1 / podiumTx.tileH);
  const podiumMat = physical(podiumTx);

  // body: folds every ~43 m, deepest in the middle of the shaft
  const bodyLevels = []; for (let y = 0; y <= M118.roof + 0.1; y += M118.roof / 13) bodyLevels.push(+y.toFixed(2));
  const fold = y => 0.055 + 0.03 * Math.sin(Math.PI * Math.min(1, y / M118.roof));
  const body = faceted(O, bodyLevels, fold);
  // texture coords are in metres; prism-style UV scaling is done by texture.repeat above
  const shaft = new THREE.Mesh(body.geom, glass); shaft.castShadow = shaft.receiveShadow = true; root.add(shaft);

  // crown: same loft continued to a point, faceted tighter, glass that glows at night
  const crownLevels = []; for (let i = 0; i <= 6; i++) crownLevels.push(M118.roof + (M118.crownTop - M118.roof) * i / 6);
  const crown = faceted(O, crownLevels, () => 0.12);
  root.add(new THREE.Mesh(crown.geom, crownMat));
  const [cx, cz] = body.center;
  // a steel cap closes the crown
  const top = crown.ring(M118.crownTop, 6);
  root.add(new THREE.Mesh(cap(top, M118.crownTop, true), steel));

  // spire: 8-sided tapering steel needle with ring collars, aviation lights
  const sp = [];
  sp.push(strut([cx, M118.crownTop - 6, cz], [cx, 640, cz], 3.4, 1.0, 8));
  sp.push(strut([cx, 640, cz], [cx, M118.tip, cz], 1.0, 0.18, 8));
  for (const y of [605, 615, 625, 635]){
    const r = 3.4 - (y - (M118.crownTop - 6)) / (640 - M118.crownTop + 6) * 2.4;
    const t = new THREE.TorusGeometry(r + 0.25, 0.22, 6, 16); t.rotateX(Math.PI / 2); t.translate(cx, y, cz); sp.push(t);
  }
  const spire = new THREE.Mesh(merge(sp), steel); spire.castShadow = true; root.add(spire);
  const beaconGeo = [];
  for (const y of [M118.tip, 640, 610]){ const s = new THREE.SphereGeometry(y === M118.tip ? 0.8 : 0.55, 10, 8); s.translate(cx, y, cz); beaconGeo.push(s); }
  const beacons = new THREE.Mesh(merge(beaconGeo), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); root.add(beacons);

  // ground floor: a recessed glazed lobby band with a steel canopy
  const lobby = O.map(([x, z]) => [cx + (x - cx) * 0.96, cz + (z - cz) * 0.96]);
  root.add(new THREE.Mesh(prism(lobby, 0, 6, { tileW: 6, tileH: 6 }), podiumMat));
  root.add(new THREE.Mesh(prism(O.map(([x, z]) => [cx + (x - cx) * 1.03, cz + (z - cz) * 1.03]), 6, 7, { tileW: 4, tileH: 4 }), steel));

  // vertical steel "seams" on each outline corner (the bright lines that run up the tower)
  const seams = [];
  for (let i = 0; i < O.length; i++){
    for (let k = 0; k < bodyLevels.length - 1; k++){
      const a = body.ring(bodyLevels[k], k)[i * 2], b = body.ring(bodyLevels[k + 1], k + 1)[i * 2];
      seams.push(strut([a[0], bodyLevels[k], a[1]], [b[0], bodyLevels[k + 1], b[1]], 0.35, 0.35, 5));
    }
  }
  root.add(new THREE.Mesh(merge(seams), steel));

  let night = false;
  function setNight(on){
    night = on;
    glass.emissiveIntensity = on ? 1.0 : 0;
    crownMat.emissiveIntensity = on ? 1.3 : 0;
    podiumMat.emissiveIntensity = on ? 1.1 : 0;
    steel.emissiveIntensity = on ? 0.35 : 0;
    glass.envMapIntensity = on ? 0.5 : 1.25;
  }
  function update(t){ beacons.visible = (t % 1.8) < 1.0; }
  setNight(false);
  return { group: root, setNight, update };
}
