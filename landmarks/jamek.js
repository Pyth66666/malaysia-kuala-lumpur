// Masjid Jamek Sultan Abdul Samad (A. B. Hubback, 1909) at the Klang-Gombak confluence, where
// Kuala Lumpur began. Red brick with cream plaster bands, cusped arcades, three onion domes over the
// prayer hall (main dome ~21 m high), two striped minarets (~27 m) with chhatri kiosks on top and a
// ring of small chhatris on the parapet corners. Outline and part positions from OSM (jamek_data.js).
import * as THREE from 'three';
import { rng, noiseTex } from './facade.js';
import { prism, polyCap, lathe, circle, strut } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { JAMEK } from './jamek_data.js';

export { JAMEK };

function cnv(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true){ const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
const clean = g => {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};
const merge = list => mergeGeometries(list.map(clean));

// one 3.6 m bay of the verandah: brick piers, a cusped (multifoil) arch in cream, bands, parapet
function arcade(wallH){
  const px = 64, bay = 3.6, W = Math.round(bay * px), H = Math.round(wallH * px), R = rng(1909);
  const a = cnv(W, H), hm = cnv(W, H), em = cnv(W, H);
  const g = a.getContext('2d'), h = hm.getContext('2d'), e = em.getContext('2d');
  const Y = m => H - m * px;
  g.fillStyle = '#b8a58b'; g.fillRect(0, 0, W, H); h.fillStyle = '#606060'; h.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const bw = 0.23 * px, bh = 0.075 * px;
  for (let row = 0, y = 0; y < H; row++, y += bh) for (let x = -bw; x < W + bw; x += bw){
    g.fillStyle = '#' + new THREE.Color('#a9482e').multiplyScalar(0.82 + R() * 0.3).getHexString();
    g.fillRect(x + (row % 2) * bw / 2 + 0.5, y + 0.5, bw - 1, bh - 1);
  }
  const band = (y0, y1) => { g.fillStyle = '#f0e8d5'; g.fillRect(0, Y(y1), W, (y1 - y0) * px); h.fillStyle = '#b4b4b4'; h.fillRect(0, Y(y1), W, (y1 - y0) * px); };
  // cream bands every ~1.2 m (the "blood and bandage" striping)
  for (let y = 1.4; y < wallH - 1.5; y += 1.25) band(y, y + 0.2);
  band(0, 0.7);
  // cusped arch: semicircle with 5 lobes, cream surround, dark verandah behind
  const cx = W / 2 / px, r = 1.15, y0 = 0.7, spring = 4.3;
  const path = (ctx, rr) => {
    ctx.beginPath(); ctx.moveTo((cx - rr) * px, Y(y0)); ctx.lineTo((cx - rr) * px, Y(spring));
    ctx.arc(cx * px, Y(spring), rr * px, Math.PI, 0); ctx.lineTo((cx + rr) * px, Y(y0)); ctx.closePath();
  };
  g.fillStyle = '#f2ebd9'; path(g, r + 0.32); g.fill();
  const grd = g.createLinearGradient(0, Y(spring + r), 0, Y(y0)); grd.addColorStop(0, '#15110e'); grd.addColorStop(1, '#3b3129');
  g.fillStyle = grd; path(g, r); g.fill();
  h.fillStyle = '#d0d0d0'; path(h, r + 0.32); h.fill(); h.fillStyle = '#1e1e1e'; path(h, r); h.fill();
  e.fillStyle = '#ffd08a'; path(e, r); e.fill();
  // cusps: 4 cream points between the 5 lobes of the multifoil arch
  for (let k = 1; k < 5; k++){
    const an = Math.PI - k * Math.PI / 5, ux = Math.cos(an), uy = Math.sin(an);
    for (const [ctx, col] of [[g, '#f2ebd9'], [h, '#d0d0d0'], [e, '#000']]){
      ctx.fillStyle = col; ctx.beginPath();
      ctx.arc((cx + ux * r) * px, Y(spring + uy * r), 0.2 * px, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo((cx + ux * (r + 0.05) - uy * 0.2) * px, Y(spring + uy * (r + 0.05) + ux * 0.2));
      ctx.lineTo((cx + ux * (r - 0.32)) * px, Y(spring + uy * (r - 0.32)));
      ctx.lineTo((cx + ux * (r + 0.05) + uy * 0.2) * px, Y(spring + uy * (r + 0.05) - ux * 0.2)); ctx.closePath(); ctx.fill();
    }
  }
  // pier pilasters
  for (const x of [0, bay]){ g.fillStyle = '#efe6d2'; g.fillRect((x - 0.16) * px, Y(wallH - 1.2), 0.32 * px, (wallH - 1.9) * px); }
  // cornice + pierced parapet
  band(wallH - 1.6, wallH - 1.15);
  for (let x = 0.15; x < bay; x += 0.6){ g.fillStyle = '#f2ebd9'; g.fillRect(x * px, Y(wallH), 0.4 * px, 0.9 * px); g.fillStyle = '#2a221c'; g.fillRect((x + 0.12) * px, Y(wallH - 0.25), 0.16 * px, 0.45 * px); }
  const src = h.getImageData(0, 0, W, H).data, nm = cnv(W, H), n = nm.getContext('2d'), img = n.createImageData(W, H);
  const HH = (x, y) => src[(Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const dx = (HH(x + 1, y) - HH(x - 1, y)) * 2.5, dy = (HH(x, y + 1) - HH(x, y - 1)) * 2.5, l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  n.putImageData(img, 0, 0);
  return { map: tex(a), normalMap: tex(nm, false), emissiveMap: tex(em), bay };
}

// minaret shaft stripes: red brick with cream bands, 1 m period
function stripes(){
  const c = cnv(64, 256), g = c.getContext('2d');
  for (let i = 0; i < 8; i++){ g.fillStyle = i % 2 ? '#efe6d2' : '#a9482e'; g.fillRect(0, i * 32, 64, i % 2 ? 10 : 32); }
  return tex(c);
}

const onion = (r, h) => [[0.01, 0], [r * 0.9, 0], [r * 1.08, h * 0.16], [r * 1.16, h * 0.3], [r * 1.06, h * 0.48], [r * 0.8, h * 0.63], [r * 0.45, h * 0.78], [r * 0.18, h * 0.9], [r * 0.06, h * 0.97], [0.01, h]];

// chhatri: four columns, a cornice and a small dome
function chhatri(x, y, z, r, list){
  for (let i = 0; i < 4; i++){ const a = i * Math.PI / 2 + Math.PI / 4; list.cream.push(strut([x + Math.cos(a) * r * 0.8, y, z + Math.sin(a) * r * 0.8], [x + Math.cos(a) * r * 0.8, y + r * 1.6, z + Math.sin(a) * r * 0.8], r * 0.1, r * 0.1, 6)); }
  list.cream.push(lathe([[r * 1.15, 0], [r * 1.15, r * 0.18], [r * 0.95, r * 0.3]], 16).translate(x, y + r * 1.6, z));
  list.dome.push(lathe(onion(r * 0.9, r * 1.5), 16).translate(x, y + r * 1.9, z));
  list.cream.push(strut([x, y + r * 3.35, z], [x, y + r * 3.9, z], r * 0.05, r * 0.02, 5));
}

export function buildJamek(){
  const J = JAMEK, root = new THREE.Group(); root.name = 'MasjidJamek';
  const T = arcade(J.wallH);
  const wallMat = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normalMap, emissiveMap: T.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
  for (const k of ['map', 'normalMap', 'emissiveMap']) T[k].repeat.set(1, 1);
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.8, emissive: 0xffe6b8, emissiveIntensity: 0 });
  const domeMat = new THREE.MeshPhysicalMaterial({ color: 0xf3eedf, roughness: 0.55, clearcoat: 0.3, emissive: 0xfff0d0, emissiveIntensity: 0,
    map: noiseTex({ size: 128, base: '#f3eedf', vary: 0.05, specks: 2000, seed: 5 }) });
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.85, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb9aa92, roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b45a, metalness: 1, roughness: 0.3 });
  const list = { cream: [], dome: [], stripe: [], gold: [] };

  // walls: every OSM building outline, arcade texture in real metres (prism UV u = metres / tileW)
  for (const b of J.buildings){
    const w = new THREE.Mesh(prism(b.ring, 0, b.h, { tileW: T.bay, tileH: J.wallH, smoothDeg: 10 }), wallMat);
    w.castShadow = w.receiveShadow = true; root.add(w);
    root.add(new THREE.Mesh(polyCap(b.ring, b.h - 0.6, true), roofMat));
    // corner chhatris on the parapet
    for (const [x, z] of b.corners || []) chhatri(x, b.h - 0.6, z, 0.9, list);
  }
  // domes: drum + onion, gold finial
  for (const d of J.domes){
    list.cream.push(prism(circle(d.r * 1.02, 32, d.x, d.z), d.y0, d.y0 + d.drum, { tileW: 3, tileH: 3, smoothDeg: 30 }));
    list.cream.push(lathe([[d.r * 1.12, 0], [d.r * 1.12, 0.35], [d.r * 1.04, 0.55]], 32).translate(d.x, d.y0 + d.drum, d.z));
    list.dome.push(lathe(onion(d.r, d.h), 40).translate(d.x, d.y0 + d.drum + 0.5, d.z));
    const top = d.y0 + d.drum + 0.5 + d.h;
    list.gold.push(lathe([[0.01, 0], [0.22, 0.1], [0.3, 0.45], [0.12, 0.8], [0.05, 1.8], [0.01, 2.0]], 12).translate(d.x, top - 0.1, d.z));
  }
  // minarets: striped octagonal shaft, two balconies, chhatri crown
  for (const m of J.minarets){
    list.stripe.push(prism(circle(m.r, 8, m.x, m.z), 0, m.h - 6, { tileW: 2.4, tileH: 5, smoothDeg: 10 }));
    for (const y of [m.h * 0.45, m.h - 6]){
      list.cream.push(prism(circle(m.r * 1.45, 16, m.x, m.z), y, y + 0.5, { tileW: 2, tileH: 2, smoothDeg: 30 }));
      list.cream.push(polyCap(circle(m.r * 1.45, 16, m.x, m.z), y + 0.5, true));
      list.cream.push(polyCap(circle(m.r * 1.45, 16, m.x, m.z), y, false));
    }
    chhatri(m.x, m.h - 5.5, m.z, m.r * 1.05, list);
  }
  root.add(new THREE.Mesh(merge(list.cream), cream));
  const domes = new THREE.Mesh(merge(list.dome), domeMat); domes.castShadow = true; root.add(domes);
  if (list.stripe.length){ const s = new THREE.Mesh(merge(list.stripe), stripeMat); s.castShadow = true; root.add(s); }
  if (list.gold.length) root.add(new THREE.Mesh(merge(list.gold), gold));

  function setNight(on){
    wallMat.emissiveIntensity = on ? 0.9 : 0;
    cream.emissiveIntensity = on ? 0.22 : 0;
    domeMat.emissiveIntensity = on ? 0.32 : 0;
    stripeMat.emissiveIntensity = on ? 0.25 : 0;
  }
  return { group: root, setNight };
}
