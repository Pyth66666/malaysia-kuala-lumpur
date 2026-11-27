// Roads with real vertical structure, from data/kl_roads.json (tools/make_roads3d.py).
// Heights are metres above local ground: the page drapes every vertex onto the terrain afterwards,
// so a pier foot at y = 0 lands on the ground under it and a deck at y = h floats h metres above.
//
//  * road surface ribbons (asphalt, coloured by class) at h + 0.1, mitred at bends
//  * elevated decks: concrete slab with a soffit, side fascia and parapets on both edges
//  * ramps below 3 m sit on an embankment with retaining walls instead of piers
//  * piers every ~32 m: one column (two under wide decks) with a crosshead under the deck
//  * tunnels are not drawn
import * as THREE from 'three';

const ROAD_COL = { big: [0.40, 0.40, 0.43], small: [0.60, 0.60, 0.62] };
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const C_DECK = [0.60, 0.59, 0.56], C_SOFFIT = [0.36, 0.36, 0.35], C_PARAPET = [0.78, 0.77, 0.73], C_PIER = [0.55, 0.54, 0.51], C_WALL = [0.62, 0.58, 0.52];

export function buildRoads3D(R){
  const roads = [], roadsC = [], centers = [], centersH = [], centersInfo = [];
  const sPos = [], sCol = [];
  const tri = (a, b, c, col) => { sPos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) sCol.push(...col); };
  const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };

  let elevatedLen = 0, piers = 0;
  for (const w of R.ways){
    if (w.t) continue;                                   // tunnel
    const P = w.p, n = P.length / 2, Y = w.y || null, hw = w.h, half = w.w / 2;
    if (n < 2) continue;
    const H = i => Y ? Y[i] : 0;
    // mitred unit normals at each point
    const nx = new Float32Array(n), nz = new Float32Array(n);
    const segN = [];
    for (let i = 0; i < n - 1; i++){
      const dx = P[2 * i + 2] - P[2 * i], dz = P[2 * i + 3] - P[2 * i + 1], L = Math.hypot(dx, dz) || 1;
      segN.push([-dz / L, dx / L]);
    }
    for (let i = 0; i < n; i++){
      const a = segN[Math.max(0, i - 1)], b = segN[Math.min(n - 2, i)];
      let x = a[0] + b[0], z = a[1] + b[1]; const l = Math.hypot(x, z) || 1; x /= l; z /= l;
      const cos = Math.max(0.5, x * b[0] + z * b[1]);   // miter length, capped at 2x
      nx[i] = x / cos; nz[i] = z / cos;
    }
    const col = (MAJOR.has(hw) || w.w >= 10) ? ROAD_COL.big : ROAD_COL.small;
    const Lp = i => [P[2 * i] + nx[i] * half, P[2 * i + 1] + nz[i] * half];
    const Rp = i => [P[2 * i] - nx[i] * half, P[2 * i + 1] - nz[i] * half];
    for (let i = 0; i < n - 1; i++){
      const y0 = H(i) + 0.1, y1 = H(i + 1) + 0.1;
      const [l0x, l0z] = Lp(i), [l1x, l1z] = Lp(i + 1), [r0x, r0z] = Rp(i), [r1x, r1z] = Rp(i + 1);
      roads.push(l0x, y0, l0z, l1x, y1, l1z, r1x, y1, r1z, l0x, y0, l0z, r1x, y1, r1z, r0x, y0, r0z);
      for (let k = 0; k < 6; k++) roadsC.push(...col);

      // ---- structure under / beside raised road -------------------------------------------------
      const h0 = H(i), h1 = H(i + 1);
      if (Math.max(h0, h1) < 0.6) continue;
      const segL = Math.hypot(P[2 * i + 2] - P[2 * i], P[2 * i + 3] - P[2 * i + 1]);
      if (Math.min(h0, h1) > 1.5) elevatedLen += segL;
      const T0 = Math.min(1.5, h0 + 0.1), T1 = Math.min(1.5, h1 + 0.1);         // slab depth
      const embank = Math.max(h0, h1) <= 3.2;
      const b0 = embank ? -0.5 : h0 + 0.1 - T0, b1 = embank ? -0.5 : h1 + 0.1 - T1;   // bottom of the side faces
      const pt = 0.35, ph = 1.0;                                                  // parapet thickness / height
      for (const side of [1, -1]){
        const e0 = [P[2 * i] + nx[i] * half * side, P[2 * i + 1] + nz[i] * half * side];
        const e1 = [P[2 * i + 2] + nx[i + 1] * half * side, P[2 * i + 3] + nz[i + 1] * half * side];
        const o0 = [e0[0] + nx[i] * pt * side, e0[1] + nz[i] * pt * side], o1 = [e1[0] + nx[i + 1] * pt * side, e1[1] + nz[i + 1] * pt * side];
        const top0 = h0 + 0.1 + ph, top1 = h1 + 0.1 + ph;
        // outer fascia + parapet face (one face from the soffit / embankment foot to the parapet top)
        quad([o0[0], b0, o0[1]], [o1[0], b1, o1[1]], [o1[0], top1, o1[1]], [o0[0], top0, o0[1]], embank ? C_WALL : C_DECK);
        // inner parapet face, parapet cap
        quad([e0[0], h0 + 0.1, e0[1]], [e1[0], h1 + 0.1, e1[1]], [e1[0], top1, e1[1]], [e0[0], top0, e0[1]], C_PARAPET);
        quad([e0[0], top0, e0[1]], [e1[0], top1, e1[1]], [o1[0], top1, o1[1]], [o0[0], top0, o0[1]], C_PARAPET);
      }
      if (!embank){
        // soffit (underside of the slab)
        const L0 = [P[2 * i] + nx[i] * (half + pt), P[2 * i + 1] + nz[i] * (half + pt)], L1 = [P[2 * i + 2] + nx[i + 1] * (half + pt), P[2 * i + 3] + nz[i + 1] * (half + pt)];
        const R0 = [P[2 * i] - nx[i] * (half + pt), P[2 * i + 1] - nz[i] * (half + pt)], R1 = [P[2 * i + 2] - nx[i + 1] * (half + pt), P[2 * i + 3] - nz[i + 1] * (half + pt)];
        quad([L0[0], b0, L0[1]], [R0[0], b0, R0[1]], [R1[0], b1, R1[1]], [L1[0], b1, L1[1]], C_SOFFIT);
      }
    }

    // ---- piers along the elevated stretches -----------------------------------------------------
    if (!Y) continue;
    let acc = 16;
    for (let i = 0; i < n - 1; i++){
      const x0 = P[2 * i], z0 = P[2 * i + 1], x1 = P[2 * i + 2], z1 = P[2 * i + 3];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.01) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      let d = 32 - acc;
      while (d <= L){
        const f = d / L, h = H(i) + (H(i + 1) - H(i)) * f;
        if (h > 3.2){
          const cx = x0 + ux * d, cz = z0 + uz * d, top = h + 0.1 - Math.min(1.5, h + 0.1);
          const cols = w.w > 15 ? [-w.w / 4, w.w / 4] : [0];
          for (const off of cols) column(cx - uz * off, cz + ux * off, top - 1.1, 0.85);
          // crosshead: a beam across the deck direction just under the slab
          const hw2 = Math.max(2.2, half * 0.8), dd = 1.0;
          const nxv = -uz, nzv = ux;
          box(cx, cz, nxv, nzv, ux, uz, hw2, dd, top - 1.1, top);
          piers++;
        }
        d += 32;
      }
      acc = (acc + L) % 32;
    }

    if (MAJOR.has(hw) && w.w >= 5){
      const flat = []; for (let i = 0; i < n; i++) flat.push(P[2 * i], -P[2 * i + 1]);   // legacy format: (x, north)
      centers.push(flat); centersH.push(Y ? Array.from(Y) : null); centersInfo.push({ w: w.w, oneway: !!w.o, hw });
    }
  }

  function column(x, z, top, r){
    const N = 10, col = C_PIER;
    for (let k = 0; k < N; k++){
      const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
      quad([p0[0], -1.5, p0[1]], [p1[0], -1.5, p1[1]], [p1[0], top, p1[1]], [p0[0], top, p0[1]], col);
    }
  }
  function box(cx, cz, ax, az, bx, bz, ha, hb, y0, y1){
    const c = (sa, sb, y) => [cx + ax * ha * sa + bx * hb * sb, y, cz + az * ha * sa + bz * hb * sb];
    const col = C_PIER;
    quad(c(-1, -1, y0), c(1, -1, y0), c(1, -1, y1), c(-1, -1, y1), col);
    quad(c(1, 1, y0), c(-1, 1, y0), c(-1, 1, y1), c(1, 1, y1), col);
    quad(c(1, -1, y0), c(1, 1, y0), c(1, 1, y1), c(1, -1, y1), col);
    quad(c(-1, 1, y0), c(-1, -1, y0), c(-1, -1, y1), c(-1, 1, y1), col);
    quad(c(-1, -1, y0), c(-1, 1, y0), c(1, 1, y0), c(1, -1, y0), col);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3));
  g.computeVertexNormals();
  const structure = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }));
  structure.name = 'RoadStructures';
  structure.castShadow = structure.receiveShadow = true;
  return { roads: new Float32Array(roads), roads_c: new Float32Array(roadsC), centers, centersH, centersInfo, structure,
           stats: { elevatedKm: +(elevatedLen / 1000).toFixed(1), piers } };
}
