// Menara Kuala Lumpur (KL Tower), 1995. 421 m to the antenna tip, on Bukit Nanas.
// Dimensions: observation deck 276 m, revolving restaurant 282 m, Sky Deck 300 m, roof 335 m,
// head 7 storeys and ~45 m across (OSM building:part rings 546501414/5: Ø 46 m and Ø 36 m),
// shaft Ø ~14 m (OSM 546282150), base building 9 m tall, Ø ~62 m (OSM 589740576).
// Position: OSM node "Menara Kuala Lumpur" (-882.5, 546.4) m from the KLCC origin.
import * as THREE from 'three';
import { curtainWall, noiseTex } from './facade.js';
import { prism, cap, lathe, circle, strut, ledge } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const KLTOWER = { pos: [-883.3, 546.5], obsDeck: 276, restaurant: 282, skyDeck: 300, roof: 335, tip: 421, baseR: 31 };

function physical(tx, opts = {}){
  return new THREE.MeshPhysicalMaterial({
    map: tx.map, roughnessMap: tx.ormMap, metalnessMap: tx.ormMap, normalMap: tx.normalMap,
    roughness: 1, metalness: 1, emissiveMap: tx.emissiveMap || null,
    emissive: tx.emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: 0, envMapIntensity: 1.1, ...opts,
  });
}
const clean = g => {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};
// prism() maps v = y / tileH; shift the texture so a band that starts at y0 starts at a tile edge
function alignTx(tx, y0){
  const off = -((y0 / tx.tileH) % 1);
  for (const k of ['map', 'ormMap', 'normalMap', 'emissiveMap']) if (tx[k]) tx[k].offset.y = off;
  return tx;
}
const merge = list => mergeGeometries(list.map(clean));

export function buildKLTower(){
  const K = KLTOWER;
  const root = new THREE.Group(); root.name = 'MenaraKL';
  root.position.set(K.pos[0], 0, K.pos[1]);

  // --- materials -----------------------------------------------------------------------------
  const concreteRough = noiseTex({ size: 256, base: '#9a9a9a', vary: 0.35, specks: 9000, seed: 31 });
  concreteRough.colorSpace = THREE.NoColorSpace;
  const concrete = new THREE.MeshPhysicalMaterial({ color: 0xe9ebe8, roughness: 0.62, metalness: 0.0, roughnessMap: concreteRough,
    map: noiseTex({ size: 256, base: '#e4e5e1', vary: 0.05, specks: 6000, seed: 32 }), emissive: 0xd8e4ff, emissiveIntensity: 0 });
  const ribMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, roughness: 0.45, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc9cdd2, roughness: 0.35, metalness: 1, envMapIntensity: 1.3, emissive: 0xffffff, emissiveIntensity: 0 });
  const redWhite = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3 });
  const obsTx = curtainWall({ tileW: 2.4, floorH: 8, floors: 1, px: 48, mullion: 1.2, mullionW: 0.09,
    bands: [{ h: 0.8, kind: 'steel' }, { h: 6.6, kind: 'glass', metal: 60 }, { h: 0.6, kind: 'steel' }],
    glass: '#294a63', glassVar: 0.12, steel: '#e6e8ea', litChance: 1, warm: [255, 222, 170], seed: 41 });
  alignTx(obsTx, 273);
  const obsMat = physical(obsTx, { envMapIntensity: 1.4 });
  const restTx = curtainWall({ tileW: 3, floorH: 7, floors: 1, px: 48, mullion: 1.5, mullionW: 0.08,
    bands: [{ h: 0.9, kind: 'steel' }, { h: 5.4, kind: 'glass', metal: 70 }, { h: 0.7, kind: 'steel' }],
    glass: '#1f3d57', glassVar: 0.15, steel: '#e9ebed', litChance: 1, warm: [255, 200, 140], seed: 42 });
  alignTx(restTx, 283);
  const restMat = physical(restTx, { envMapIntensity: 1.4 });
  const baseTx = curtainWall({ tileW: 6, floorH: 9, floors: 1, px: 32, mullion: 2, mullionW: 0.12,
    bands: [{ h: 0.6, kind: 'dark' }, { h: 5.2, kind: 'glass' }, { h: 3.2, kind: 'steel', rough: 170, metal: 0 }],
    glass: '#3b6d86', steel: '#ece7dc', litChance: 1, warm: [255, 230, 190], seed: 43 });
  const baseMat = physical(baseTx);
  const beacon = new THREE.MeshBasicMaterial({ color: 0xff2a1a });

  // --- base building: round 9 m podium with a cream parapet and glazed ground floor -------------
  const base = circle(K.baseR, 64);
  root.add(new THREE.Mesh(prism(base, 0, 9, { tileW: 6, tileH: 9, smoothDeg: 40 }), baseMat));
  const roof = new THREE.Mesh(merge([ledge(base, circle(9.5, 64), 9)]), new THREE.MeshStandardMaterial({ color: 0x8f9a8e, roughness: 0.9 }));
  root.add(roof);
  // entrance: Islamic pointed arch portal with a small blue glass dome (faces the drive-up, south)
  const portal = [];
  portal.push(new THREE.BoxGeometry(14, 13, 4).translate(0, 6.5, K.baseR + 1.2));
  const dome = lathe([[4.2, 0], [4.3, 1.5], [3.8, 3.4], [2.4, 5], [0.5, 6], [0.01, 6.3]], 28); dome.translate(0, 13, K.baseR + 1.2);
  root.add(new THREE.Mesh(merge(portal), concrete));
  root.add(new THREE.Mesh(dome, new THREE.MeshPhysicalMaterial({ color: 0x2f6fa8, roughness: 0.15, metalness: 0.4, envMapIntensity: 1.4 })));
  const archTx = new THREE.Mesh(new THREE.PlaneGeometry(8, 10), new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.2, metalness: 0.5, emissive: 0xffd8a0, emissiveIntensity: 0 }));
  archTx.position.set(0, 5, K.baseR + 3.25); root.add(archTx);

  // --- shaft: tapering concrete, Ø 16 m at the base -> Ø 12 m under the head, with the lift spine --
  const shaft = [];
  shaft.push(prism(circle(8.2, 48), 9, 30, { tileW: 4, tileH: 4, smoothDeg: 40, taperTo: 0.92 }));
  shaft.push(prism(circle(7.55, 48), 30, 252, { tileW: 4, tileH: 4, smoothDeg: 40, taperTo: 0.8 }));
  // flared foot where the shaft meets the podium roof
  shaft.push(lathe([[11, 9], [9.4, 11], [8.6, 14], [8.2, 18]], 48));
  const shaftMesh = new THREE.Mesh(merge(shaft), concrete); shaftMesh.castShadow = true; root.add(shaftMesh);
  // four vertical ribs (the structural pilasters seen as light lines up the shaft)
  const ribs = [];
  for (let i = 0; i < 4; i++){
    const a = i * Math.PI / 2 + Math.PI / 4;
    ribs.push(strut([Math.cos(a) * 8.15, 12, Math.sin(a) * 8.15], [Math.cos(a) * 6.1, 252, Math.sin(a) * 6.1], 0.55, 0.45, 8));
  }
  root.add(new THREE.Mesh(merge(ribs), ribMat));

  // --- the head ------------------------------------------------------------------------------
  // under-bowl: concrete bell from the shaft out to the observation floor, with 24 radial ribs
  const bowlProfile = [[6.05, 252], [6.4, 256], [8.5, 260], [11.6, 264], [14.8, 267.5], [17.6, 270.5], [19.6, 273]];
  const bowl = lathe(bowlProfile, 64);
  const bowlMesh = new THREE.Mesh(bowl, concrete); bowlMesh.castShadow = true; root.add(bowlMesh);
  const hrib = [];
  for (let i = 0; i < 24; i++){
    const a = i / 24 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < bowlProfile.length - 1; k++){
      const [r0, y0] = bowlProfile[k], [r1, y1] = bowlProfile[k + 1];
      hrib.push(strut([c * (r0 + 0.25), y0, s * (r0 + 0.25)], [c * (r1 + 0.25), y1, s * (r1 + 0.25)], 0.32, 0.32, 6));
    }
  }
  const head = [];
  // observation deck glass (273-281), slab, restaurant glass (283-290, the widest ring), top slab
  root.add(new THREE.Mesh(prism(circle(20.2, 72), 273, 281, { tileW: 2.4, tileH: 8, smoothDeg: 40, taperTo: 1.03 }), obsMat));
  head.push(prism(circle(22.6, 72), 281, 283, { tileW: 4, tileH: 4, smoothDeg: 40 }));
  head.push(cap(circle(22.6, 72), 281, false)); head.push(ledge(circle(22.6, 72), circle(20.8, 72), 283));
  head.push(ledge(circle(20.2, 72), circle(19.6, 72), 273));
  root.add(new THREE.Mesh(prism(circle(21.4, 72), 283, 290, { tileW: 3, tileH: 7, smoothDeg: 40, taperTo: 1.04 }), restMat));
  head.push(prism(circle(23.2, 72), 290, 292, { tileW: 4, tileH: 4, smoothDeg: 40 }));
  head.push(cap(circle(23.2, 72), 290, false));
  // upper roof: a shallow dome stepping in to the Sky Deck (open-air ring at 300 m)
  head.push(lathe([[23.2, 292], [22, 294.2], [19.4, 296.4], [16, 298.3], [12.6, 299.6], [12.6, 300]], 72));
  head.push(ledge(circle(12.6, 64), circle(9.2, 64), 300));
  // Sky Deck glass balustrade posts
  for (let i = 0; i < 48; i++){ const a = i / 48 * Math.PI * 2; head.push(strut([Math.cos(a) * 12.4, 300, Math.sin(a) * 12.4], [Math.cos(a) * 12.4, 301.3, Math.sin(a) * 12.4], 0.06, 0.06, 4)); }
  head.push(prism(circle(12.45, 64), 301.2, 301.4, { tileW: 4, tileH: 4, smoothDeg: 40 }));
  const balustrade = new THREE.Mesh(prism(circle(12.4, 64), 300, 301.2, { tileW: 4, tileH: 4, smoothDeg: 40 }),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe6f0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  root.add(balustrade);
  // crown: three stacked drums tapering to the roof at 335 m (plant rooms + the mast foot)
  head.push(prism(circle(9.2, 48), 300, 309, { tileW: 4, tileH: 4, smoothDeg: 40, taperTo: 0.86 }));
  head.push(ledge(circle(9.2 * 0.86, 48), circle(6.4, 48), 309));
  head.push(prism(circle(6.4, 40), 309, 322, { tileW: 4, tileH: 4, smoothDeg: 40, taperTo: 0.8 }));
  head.push(ledge(circle(6.4 * 0.8, 40), circle(4, 40), 322));
  head.push(prism(circle(4, 32), 322, K.roof, { tileW: 4, tileH: 4, smoothDeg: 40, taperTo: 0.85 }));
  const headMesh = new THREE.Mesh(merge(head), ribMat); headMesh.castShadow = true; root.add(headMesh);
  root.add(new THREE.Mesh(merge(hrib), ribMat));
  // the coloured light ring under the bowl (KL Tower's night show)
  const glow = new THREE.Mesh(prism(circle(19.9, 72), 271.8, 272.9, { tileW: 4, tileH: 4, smoothDeg: 40 }),
    new THREE.MeshBasicMaterial({ color: 0x000000 }));
  root.add(glow);

  // --- antenna mast 335 -> 421 m: stepped steel tube with platform rings, red-white top -------------
  const mast = [];
  mast.push(strut([0, K.roof, 0], [0, 362, 0], 3.1, 2.4, 20));
  mast.push(strut([0, 362, 0], [0, 392, 0], 1.6, 1.15, 16));
  mast.push(strut([0, 392, 0], [0, 410, 0], 0.75, 0.5, 12));
  for (const [y, r] of [[342, 4.2], [352, 3.8], [362, 3.3], [376, 2.2], [392, 1.9]]){
    const t = new THREE.TorusGeometry(r, 0.22, 6, 28); t.rotateX(Math.PI / 2); t.translate(0, y, 0); mast.push(t);
    mast.push(cap(circle(r, 28), y - 0.05, true));
  }
  const mastMesh = new THREE.Mesh(merge(mast), steel); mastMesh.castShadow = true; root.add(mastMesh);
  // top 11 m painted in aviation red/white bands
  const bands = [];
  for (let i = 0; i < 4; i++){
    const y0 = 410 + i * 2.75;
    bands.push({ g: strut([0, y0, 0], [0, y0 + 2.75, 0], 0.5 - i * 0.08, 0.42 - i * 0.08, 10), red: i % 2 === 0 });
  }
  root.add(new THREE.Mesh(merge(bands.filter(b => b.red).map(b => b.g)), new THREE.MeshPhysicalMaterial({ color: 0xd8261c, roughness: 0.5 })));
  root.add(new THREE.Mesh(merge(bands.filter(b => !b.red).map(b => b.g)), redWhite));
  const lights = [];
  for (const y of [K.tip, 392.4, 362.4, K.roof + 0.5]){
    const n = y === K.tip ? 1 : 4;
    for (let i = 0; i < n; i++){
      const a = i / n * Math.PI * 2, r = y === K.tip ? 0 : (y > 390 ? 1.9 : y > 360 ? 3.3 : 4.1);
      const s = new THREE.SphereGeometry(y === K.tip ? 0.7 : 0.45, 10, 8); s.translate(Math.cos(a) * r, y, Math.sin(a) * r); lights.push(s);
    }
  }
  const beacons = new THREE.Mesh(merge(lights), beacon); root.add(beacons);

  // --- night + animation -----------------------------------------------------------------------
  let night = false;
  function setNight(on){
    night = on;
    obsMat.emissiveIntensity = on ? 1.1 : 0;
    restMat.emissiveIntensity = on ? 1.25 : 0;
    baseMat.emissiveIntensity = on ? 0.9 : 0;
    archTx.material.emissiveIntensity = on ? 0.8 : 0;
    concrete.emissiveIntensity = on ? 0.16 : 0;    // floodlit shaft
    ribMat.emissiveIntensity = on ? 0.1 : 0;
    steel.emissiveIntensity = on ? 0.12 : 0;
    obsMat.envMapIntensity = restMat.envMapIntensity = on ? 0.5 : 1.4;
    if (!on) glow.material.color.set(0x8a8f96);
  }
  const col = new THREE.Color();
  function update(t){
    beacons.visible = (t % 1.6) < 0.9;               // aviation lights pulse
    if (night){ col.setHSL((t * 0.03) % 1, 0.85, 0.55); glow.material.color.copy(col); ribMat.emissive.copy(col).lerp(new THREE.Color(1, 1, 1), 0.55); }
  }
  setNight(false);
  return { group: root, setNight, update };
}
