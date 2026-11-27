// The Exchange 106 (TRX), 2019: 453.6 m roof (OSM), 95 floors. A square glass shaft turned on the
// grid, chamfered corners with recessed steel notches, a gentle taper and a sloping glass crown.
import * as THREE from 'three';
import { curtainWall } from './facade.js';
import { prism, cap, ledge, strut } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { X106_OUTLINE } from './x106_data.js';

export const X106 = { roof: 453.6, shaftTop: 420, outline: X106_OUTLINE };

const clean = g => {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};
const merge = list => mergeGeometries(list.map(clean));

// drop near-collinear / very short edges so the walls are clean planes
function simplify(o, minLen = 3, maxTurnDeg = 8){
  let pts = o.slice();
  for (let changed = true; changed && pts.length > 4;){
    changed = false;
    for (let i = 0; i < pts.length; i++){
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const turn = Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])));
      if (l1 < minLen || l2 < minLen && l2 < l1 || turn < maxTurnDeg * Math.PI / 180){ pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}
const scaleAbout = (o, s, cx, cz) => o.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);

export function buildX106(){
  const root = new THREE.Group(); root.name = 'Exchange106';
  const O = simplify(X106.outline);
  let cx = 0, cz = 0; for (const [x, z] of O){ cx += x; cz += z; } cx /= O.length; cz /= O.length;

  const tx = curtainWall({ tileW: 6, floorH: 4.5, floors: 2, px: 48, mullion: 1.5, mullionW: 0.07,
    bands: [{ h: 0.9, kind: 'dark' }, { h: 3.6, kind: 'glass', metal: 90 }],
    glass: '#3e5566', glassVar: 0.12, dark: '#262b31', litChance: 0.4, seed: 106 });
  const glass = new THREE.MeshPhysicalMaterial({ map: tx.map, roughnessMap: tx.ormMap, metalnessMap: tx.ormMap, normalMap: tx.normalMap,
    roughness: 1, metalness: 1, emissiveMap: tx.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.3 });
  const tile = { tileW: tx.tileW, tileH: tx.tileH, smoothDeg: 10 };
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xcfd5db, metalness: 1, roughness: 0.3, envMapIntensity: 1.3, emissive: 0xbfe0ff, emissiveIntensity: 0 });
  const crownMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c4, metalness: 0.2, roughness: 0.08, transmission: 0, envMapIntensity: 1.6, emissive: 0xffffff, emissiveIntensity: 0 });

  // shaft in three tapering stages (the corners pull in as it rises)
  const stages = [[0, X106.shaftTop, 1, 0.82]];
  const walls = [], trims = [];
  for (const [y0, y1, s0, s1] of stages){
    walls.push(prism(scaleAbout(O, s0, cx, cz), y0, y1, { ...tile, taperTo: s1 / s0 }));
  }
  // corner notches: bright steel strips running the full height at every outline corner
  for (const [x, z] of O){
    trims.push(strut([cx + (x - cx) * 1.002, 0, cz + (z - cz) * 1.002], [cx + (x - cx) * 0.822, X106.shaftTop, cz + (z - cz) * 0.822], 0.6, 0.5, 6));
  }
  // crown: glass skin sloping to a ridge, set on a steel ring
  const top = scaleAbout(O, 0.82, cx, cz);
  trims.push(prism(scaleAbout(O, 0.83, cx, cz), X106.shaftTop - 1.2, X106.shaftTop + 0.8, { tileW: 4, tileH: 4, smoothDeg: 10 }));
  const crown = prism(top, X106.shaftTop + 0.8, X106.roof, { tileW: 3, tileH: 3, smoothDeg: 10, taperTo: 0.35 });
  const crownTop = scaleAbout(top, 0.35, cx, cz);
  root.add(new THREE.Mesh(merge([crown, cap(crownTop, X106.roof, true)]), crownMat));
  // crown lattice: verticals on the sloped faces
  for (let i = 0; i < top.length; i++){
    const a = top[i], b = top[(i + 1) % top.length];
    for (let k = 1; k < 6; k++){
      const t = k / 6, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const q = [cx + (p[0] - cx) * 0.35, cz + (p[1] - cz) * 0.35];
      trims.push(strut([p[0], X106.shaftTop + 0.8, p[1]], [q[0], X106.roof, q[1]], 0.18, 0.18, 4));
    }
  }
  const shaft = new THREE.Mesh(merge(walls), glass); shaft.castShadow = shaft.receiveShadow = true; root.add(shaft);
  root.add(new THREE.Mesh(merge(trims), steel));
  // mast + beacon
  root.add(new THREE.Mesh(strut([cx, X106.roof, cz], [cx, X106.roof + 18, cz], 0.8, 0.25, 8), steel));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8).translate(cx, X106.roof + 18.4, cz), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  root.add(beacon);

  function setNight(on){
    glass.emissiveIntensity = on ? 1.0 : 0;
    steel.emissiveIntensity = on ? 0.9 : 0;        // the corner notches glow white at night
    crownMat.emissiveIntensity = on ? 0.55 : 0;
    crownMat.emissive.set(on ? 0xcfe6ff : 0x000000);
    glass.envMapIntensity = on ? 0.5 : 1.3;
  }
  function update(t){ beacon.visible = (t % 2) < 1.1; }
  setNight(false);
  return { group: root, setNight, update };
}
