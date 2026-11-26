// Petronas Twin Towers (Menara Berkembar Petronas), 451.9 m, 88 floors, Cesar Pelli 1998.
// Positions, tier heights, star orientation and annex ("bustle") positions are measured from the
// OSM building:part outlines (ways 137396351 etc.), in metres from the KLCC origin (x east, z south).
import * as THREE from 'three';
import { curtainWall, noiseTex } from './facade.js';
import { prism, cap, ledge, circle, strut, box } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;

// From OSM: tower centres, star rotation (tip angle, atan2(z,x)), point radius of the 325 m tier.
export const PETRONAS = {
  t1: [-30.78, 22.08], t2: [50.6, -47.8],
  tipDeg: 10.5, R325: 24.4,
  // [top height, outline width in OSM]  — every tier starts at ground, so each is a setback
  tiers: [[240, 57], [295, 53], [325, 47], [355, 37], [370, 25]],
  pinnacle: [[380, 15], [390, 11], [400, 7], [410, 5]],
  spireTop: 451.9,
  bustles: { t1: [[-55.2, -13.2, 185, 11.3], [-47.7, -2.3, 175, 10.6]], t2: [[18.5, -75.9, 185, 11.3], [28.4, -66.9, 175, 10.6]] },
  bridge: { y0: 170, y1: 180 },
};

// Eight-pointed star (two squares) with circular lobes in the inner corners (16-sided "Rub el Hizb").
// Lobes reach 95 % of the point radius — measured from the OSM outline.
export function petronasPlan(R, tipDeg = PETRONAS.tipDeg, perOctant = 48){
  const h = R / Math.SQRT2, a0 = tipDeg * DEG, d = 0.56 * R, rho = 0.39 * R;
  const N = 8 * perOctant, pts = [];
  for (let j = 0; j < N; j++){
    const phi = a0 + j / N * Math.PI * 2;
    let r = 0;
    for (const sq of [0, 45]){                         // two squares
      let dl = (phi - a0 - (sq + 45) * DEG) % (Math.PI / 2);
      if (dl > Math.PI / 4) dl -= Math.PI / 2; if (dl < -Math.PI / 4) dl += Math.PI / 2;
      r = Math.max(r, h / Math.cos(dl));
    }
    for (let k = 0; k < 8; k++){                       // lobes at the 8 inner corners
      const c = a0 + (22.5 + k * 45) * DEG;
      const D = phi - c, s = d * Math.sin(D);
      if (Math.cos(D) > 0 && Math.abs(s) < rho) r = Math.max(r, d * Math.cos(D) + Math.sqrt(rho * rho - s * s));
    }
    pts.push([Math.cos(phi) * r, Math.sin(phi) * r]);
  }
  return pts;
}

function physical(tx, opts = {}){
  return new THREE.MeshPhysicalMaterial({
    map: tx.map, roughnessMap: tx.ormMap, metalnessMap: tx.ormMap, normalMap: tx.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, metalness: 1,
    emissiveMap: tx.emissiveMap || null, emissive: tx.emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: 0,
    envMapIntensity: 1.1, ...opts,
  });
}

export function buildPetronas({ lod = 'high' } = {}){
  const P = PETRONAS;
  const root = new THREE.Group(); root.name = 'PetronasTowers';
  const nightMats = [];

  // --- materials ---------------------------------------------------------------------------
  // Typical floor 4.2 m: brushed stainless spandrel + projecting sunshade fins + ribbon glass.
  const towerTx = curtainWall({
    tileW: 6, floorH: 4.2, floors: 2, px: lod === 'high' ? 72 : 40, mullion: 1.5, mullionW: 0.07,
    bands: [{ h: 1.2, kind: 'steel', rough: 95 }, { h: 0.35, kind: 'fin', rough: 70 },
            { h: 2.05, kind: 'glass', metal: 70 }, { h: 0.6, kind: 'fin', rough: 70 }],
    glass: '#33495a', glassVar: 0.2, steel: '#dfe3e7', litChance: 0.42, seed: 21, steelGlow: 0.85,
  });
  const towerMat = physical(towerTx); nightMats.push(towerMat);
  const steelMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dde1, metalness: 1, roughness: 0.22, envMapIntensity: 1.5,
    roughnessMap: noiseTex({ size: 128, base: '#808080', vary: 0.4, specks: 3000, seed: 4 }), emissive: 0xe6ecff, emissiveIntensity: 0 });
  nightMats.push(steelMat);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 0.6, roughness: 0.55 });
  const lobbyTx = curtainWall({ tileW: 6, floorH: 9, floors: 1, px: 40, mullion: 1.5, mullionW: 0.1,
    bands: [{ h: 0.6, kind: 'steel' }, { h: 7.6, kind: 'glass' }, { h: 0.8, kind: 'steel' }],
    glass: '#55707e', litChance: 1, warm: [255, 226, 180], seed: 5 });
  const lobbyMat = physical(lobbyTx, { emissiveIntensity: 0.25 }); nightMats.push(lobbyMat);
  const bridgeTx = curtainWall({ tileW: 3, floorH: 4.6, floors: 2, px: 48, mullion: 1.0,
    bands: [{ h: 0.9, kind: 'steel' }, { h: 3.0, kind: 'glass' }, { h: 0.7, kind: 'steel' }],
    glass: '#465f6d', litChance: 0.9, seed: 9, steelGlow: 0.6 });
  const bridgeMat = physical(bridgeTx); nightMats.push(bridgeMat);

  const tile = { tileW: towerTx.tileW, tileH: towerTx.tileH };
  const k = P.R325 / 47;                                   // OSM width -> star point radius

  function tower(cx, cz, name, bustles){
    const g = new THREE.Group(); g.name = name; g.position.set(cx, 0, cz);
    const wall = [], ledges = [], steel = [];
    // ground-floor lobby (0-9 m) slightly recessed, then the stepped shaft
    const base = petronasPlan(P.tiers[0][1] * k);
    wall.push(null);
    const lobby = prism(base.map(([x, z]) => [x * 0.93, z * 0.93]), 0, 9, { tileW: 6, tileH: 9 });
    g.add(new THREE.Mesh(lobby, lobbyMat));
    let y = 9, prevPlan = null;
    for (const [top, w] of P.tiers){
      const plan = petronasPlan(w * k);
      wall.push(prism(plan, y, top, tile));
      if (prevPlan) ledges.push(ledge(prevPlan, plan, y));
      // stainless parapet ring at each setback (the bright bands you see from the street)
      steel.push(prism(plan.map(([x, z]) => [x * 1.012, z * 1.012]), top - 1.6, top + 0.6, { tileW: 4, tileH: 4 }));
      prevPlan = plan; y = top;
    }
    // first-floor canopy ring above the lobby
    steel.push(prism(base.map(([x, z]) => [x * 1.02, z * 1.02]), 9, 10.2, { tileW: 4, tileH: 4 }));
    // pinnacle: stacked tapering drums with ring fins, a "ball" and the mast
    let r0 = P.tiers[P.tiers.length - 1][1] * k * 0.5;
    ledges.push(cap(prevPlan, y, true));
    for (const [top, w] of P.pinnacle){
      const r = w * k * 0.62;
      const c = circle(r, 40);
      steel.push(prism(c, y, top, { tileW: 3, tileH: 3, taperTo: 0.88, smoothDeg: 40 }));
      steel.push(prism(circle(r * 1.35, 40), top - 0.6, top, { tileW: 3, tileH: 3, smoothDeg: 40 }));   // ring fin
      steel.push(cap(circle(r * 1.35, 40), top, true));
      steel.push(cap(circle(r * 1.35, 40), top - 0.6, false));
      y = top; r0 = r;
    }
    // pinnacle ball (the sphere-and-ring motif) and mast to 451.9 m
    const ball = new THREE.SphereGeometry(2.6, 28, 18); ball.translate(0, 404, 0); steel.push(ball);
    steel.push(strut([0, y, 0], [0, P.spireTop - 6, 0], 1.25, 0.45, 16));
    const tip = new THREE.ConeGeometry(0.45, 6, 12); tip.translate(0, P.spireTop - 3, 0); steel.push(tip);
    for (let i = 0; i < 6; i++){                              // small rings up the mast
      const yy = 415 + i * 5.5, rr = 1.25 - (yy - 410) / 42 * 0.8;
      const t = new THREE.TorusGeometry(rr + 0.35, 0.18, 8, 24); t.rotateX(Math.PI / 2); t.translate(0, yy, 0); steel.push(t);
    }
    const shaft = new THREE.Mesh(mergeGeometries(wall.filter(Boolean)), towerMat);
    shaft.castShadow = shaft.receiveShadow = true; g.add(shaft);
    g.add(new THREE.Mesh(mergeGeometries(ledges.map(x => x.index ? x.toNonIndexed() : x).map(stripUV)), roofMat));
    const st = new THREE.Mesh(mergeGeometries(steel.map(x => x.index ? x.toNonIndexed() : x).map(stripUV)), steelMat);
    st.castShadow = true; g.add(st);

    // annex towers ("bustles"): round, 44 floors, two steps
    for (const [bx, bz, h, r] of bustles){
      const c = circle(r, 56, bx - cx, bz - cz);
      const m = new THREE.Mesh(prism(c, 0, h, { ...tile, smoothDeg: 40 }), towerMat);
      m.castShadow = m.receiveShadow = true; g.add(m);
      g.add(new THREE.Mesh(cap(c, h, true), roofMat));
      const ring = new THREE.Mesh(prism(circle(r * 1.03, 56, bx - cx, bz - cz), h - 1.5, h + 0.8, { tileW: 4, tileH: 4, smoothDeg: 40 }), steelMat);
      g.add(ring);
    }
    return g;
  }
  root.add(tower(P.t1[0], P.t1[1], 'Tower1', P.bustles.t1), tower(P.t2[0], P.t2[1], 'Tower2', P.bustles.t2));

  // --- skybridge: double-deck at levels 41-42, carried by a two-hinged arch from level 29 -----
  const [ax, az] = P.t1, [bx, bz] = P.t2;
  const dx = bx - ax, dz = bz - az, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
  const rAt = P.tiers[0][1] * k * 0.92;                     // tower face radius at bridge level
  const span = D - 2 * rAt + 4;                             // bridge bears slightly into each tower
  const mx = (ax + bx) / 2, mz = (az + bz) / 2, ang = Math.atan2(-uz, ux);
  const bridge = new THREE.Group(); bridge.name = 'Skybridge';
  bridge.position.set(mx, 0, mz); bridge.rotation.y = ang;
  const deckW = 5.8;
  for (const [y0, y1] of [[170.2, 174.6], [175.4, 179.8]]){
    const deck = new THREE.Mesh(box(span, y1 - y0, deckW, 4.6), bridgeMat);
    // re-map the glass texture to metres along the bridge
    deck.position.y = (y0 + y1) / 2; deck.castShadow = true; bridge.add(deck);
  }
  const chord = new THREE.Mesh(box(span + 1, 0.8, deckW + 0.6), steelMat); chord.position.y = 170; bridge.add(chord);
  const chord2 = chord.clone(); chord2.position.y = 175; bridge.add(chord2);
  const chord3 = chord.clone(); chord3.position.y = 180.2; bridge.add(chord3);
  // arch legs: from level 29 (~ 126 m) on each tower face up to the bridge mid-span
  const legs = [];
  const half = span / 2, legY0 = 126, footIn = 2.5;
  for (const side of [-1, 1]) for (const lat of [-2.2, 2.2]){
    legs.push(strut([side * (half - footIn), legY0, lat * 1.6], [side * 3.5, 169.6, lat], 0.95, 0.75, 12));
  }
  // bearing hinges & the central "ball" joint
  const hinge = new THREE.SphereGeometry(1.4, 16, 12); hinge.translate(0, 169.2, 0); legs.push(hinge);
  for (const side of [-1, 1]){ const b = new THREE.SphereGeometry(1.3, 14, 10); b.translate(side * (half - footIn), legY0, 0); legs.push(b); }
  const legMesh = new THREE.Mesh(mergeGeometries(legs.map(x => x.index ? x.toNonIndexed() : x).map(stripUV)), steelMat);
  legMesh.castShadow = true; bridge.add(legMesh);
  root.add(bridge);

  // --- night: the towers are floodlit silver-white, office windows warm ---------------------
  function setNight(on){
    towerMat.emissiveIntensity = on ? 1.15 : 0;
    bridgeMat.emissiveIntensity = on ? 1.2 : 0;
    lobbyMat.emissiveIntensity = on ? 1.4 : 0.25;
    steelMat.emissiveIntensity = on ? 0.55 : 0;
    towerMat.envMapIntensity = on ? 0.6 : 1.35;
  }
  return { group: root, setNight, materials: nightMats };
}

function stripUV(g){
  // merged helper geometries must share attribute sets: keep position+normal+uv
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')){
    const n = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}
