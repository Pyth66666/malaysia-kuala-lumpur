// Geometry helpers for landmark models. Units: metres, Y up. Outlines are [x, z] arrays.
import * as THREE from 'three';

// Vertical walls around a closed outline from y0 to y1.
// UVs: u = metres along the outline / tileW, v = metres up / tileH (so windows keep real size).
// Normals are smoothed across shallow corners (< smoothDeg) and split at sharp ones.
export function prism(outline, y0, y1, { tileW = 6, tileH = 8.4, smoothDeg = 28, taperTo = null } = {}){
  const n = outline.length;
  let cx = 0, cz = 0; for (const [x, z] of outline){ cx += x; cz += z; } cx /= n; cz /= n;
  const top = taperTo ? outline.map(([x, z]) => [cx + (x - cx) * taperTo, cz + (z - cz) * taperTo]) : outline;
  const en = [];
  for (let i = 0; i < n; i++){
    const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % n];
    let nx = bz - az, nz = -(bx - ax); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0){ nx = -nx; nz = -nz; }
    en.push([nx, nz]);
  }
  const cosT = Math.cos(smoothDeg * Math.PI / 180);
  const vn = (i, edge) => {                  // normal at vertex i as seen from edge `edge`
    const a = en[(i - 1 + n) % n], b = en[i % n];
    if (a[0] * b[0] + a[1] * b[1] < cosT) return en[edge];
    const x = a[0] + b[0], z = a[1] + b[1], l = Math.hypot(x, z) || 1; return [x / l, z / l];
  };
  const pos = [], nor = [], uv = [];
  let u = 0;
  for (let i = 0; i < n; i++){
    const j = (i + 1) % n;
    const [ax, az] = outline[i], [bx, bz] = outline[j], [tax, taz] = top[i], [tbx, tbz] = top[j];
    const L = Math.hypot(bx - ax, bz - az);
    const na = vn(i, i), nb = vn(j, i);
    const u0 = u / tileW, u1 = (u + L) / tileW, v0 = y0 / tileH, v1 = y1 / tileH;
    // triangle (a0, b0, b1) has geometric normal ∝ (-dz, dx); if that points inward, wind the other way
    const keep = en[i][0] * -(bz - az) + en[i][1] * (bx - ax) >= 0;
    const V = [[ax, y0, az, na, u0, v0], [bx, y0, bz, nb, u1, v0], [tbx, y1, tbz, nb, u1, v1], [tax, y1, taz, na, u0, v1]];
    for (const k of keep ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]){
      const [x, yy, z, nn, uu, vv] = V[k];
      pos.push(x, yy, z); nor.push(nn[0], 0, nn[1]); uv.push(uu, vv);
    }
    u += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Horizontal cap (fan from centroid — fine for star-shaped outlines). up=true faces +Y.
export function cap(outline, y, up = true, uvScale = 10){
  let cx = 0, cz = 0; for (const [x, z] of outline){ cx += x; cz += z; } cx /= outline.length; cz /= outline.length;
  const pos = [], uv = [];
  for (let i = 0; i < outline.length; i++){
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const tri = up ? [[cx, cz], b, a] : [[cx, cz], a, b];
    for (const [x, z] of tri){ pos.push(x, y, z); uv.push(x / uvScale, z / uvScale); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return face(g, up);
}

// Horizontal polygon for ANY simple outline (concave OK, earcut). uvFn(x,z) -> [u,v] optional.
export function polyCap(outline, y, up = true, uvFn = (x, z) => [x / 10, z / 10]){
  const pts = outline.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos = [], uv = [];
  for (const t of tris) for (const i of t){ const [x, z] = outline[i]; pos.push(x, y, z); uv.push(...uvFn(x, z)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return face(g, up);
}

// Lathe from a [radius, y] profile (domes, drums, finials) with UVs and normals.
export function lathe(profile, seg = 32){
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), seg);
  return g.toNonIndexed();
}

// Ensure every triangle of a flat horizontal geometry faces up (or down).
export function face(g, up = true){
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i += 3){
    const ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cz = p.getZ(i + 2);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);   // y of (b-a)x(c-a)
    if ((ny > 0) !== up){
      for (const attr of [p, uv]){ if (!attr) continue;
        const s = attr.itemSize, t = []; for (let k = 0; k < s; k++) t.push(attr.getComponent(i + 1, k));
        for (let k = 0; k < s; k++){ attr.setComponent(i + 1, k, attr.getComponent(i + 2, k)); attr.setComponent(i + 2, k, t[k]); }
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

// Ring between an outer and an inner outline of equal length (setback ledges).
export function ledge(outer, inner, y){
  const pos = [];
  for (let i = 0; i < outer.length; i++){
    const j = (i + 1) % outer.length;
    pos.push(...[outer[i][0], y, outer[i][1]], ...[outer[j][0], y, outer[j][1]], ...[inner[j][0], y, inner[j][1]]);
    pos.push(...[outer[i][0], y, outer[i][1]], ...[inner[j][0], y, inner[j][1]], ...[inner[i][0], y, inner[i][1]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return face(g, true);
}

export const scaleOutline = (o, s, cx = 0, cz = 0) => o.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);
export const circle = (r, n = 48, cx = 0, cz = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * r, cz + Math.sin(i / n * Math.PI * 2) * r]);

// Box from (x0,y0,z0) to (x1,y1,z1) with metre UVs on every face.
export function box(w, h, d, tile = 4){
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++){
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

// Tube between two points (for struts, legs, poles).
export function strut(a, b, r0, r1 = r0, seg = 10){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, L, seg);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
