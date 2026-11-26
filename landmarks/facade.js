// Procedural PBR facade textures (albedo, roughness/metalness, normal, night emissive).
// All maps tile in real metres: the caller sets UVs as (metres along wall, metres up).
import * as THREE from 'three';

function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Seeded RNG so every reload looks the same.
export function rng(seed){
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Height map (grey canvas) -> tangent-space normal map canvas.
function heightToNormal(hc, strength){
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h); const g = out.getContext('2d');
  const img = g.createImageData(w, h); const d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

function tex(c, srgb, aniso = 8){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}

/**
 * Generic curtain-wall builder. A "band" list describes one floor from bottom to top:
 *   {h: metres, kind: 'glass'|'steel'|'fin'|'dark', ...}
 * mullion: spacing in metres of vertical mullions (0 = none).
 */
export function curtainWall({
  tileW = 6, floorH = 4.2, floors = 2, px = 64, bands, mullion = 1.5, mullionW = 0.08,
  glass = '#2e4a5c', glassVar = 0.10, steel = '#c9ced3', dark = '#30343a',
  litChance = 0.35, warm = [255, 214, 150], seed = 7, finDepth = 1.0, steelGlow = 0,
}){
  const W = Math.round(tileW * px), Hh = Math.round(floorH * floors * px);
  const R = rng(seed);
  const alb = canvas(W, Hh), rm = canvas(W, Hh), hgt = canvas(W, Hh), em = canvas(W, Hh);
  const a = alb.getContext('2d'), r = rm.getContext('2d'), hg = hgt.getContext('2d'), e = em.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, Hh);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, Hh);
  // canvas y=0 is the TOP of the tile; floors are drawn top-down, bands bottom-up inside each floor
  for (let f = 0; f < floors; f++){
    const floorTop = Hh - (f + 1) * floorH * px;
    let y = floorTop + floorH * px; // bottom of this floor in canvas coords
    for (const b of bands){
      const bh = b.h * px; y -= bh;
      if (b.kind === 'glass'){
        // per-pane variation in tint so reflections break up like real glazing
        const panes = mullion ? Math.round(tileW / mullion) : 1;
        for (let p = 0; p < panes; p++){
          const x0 = p * W / panes, x1 = (p + 1) * W / panes;
          const v = 1 + (R() - 0.5) * 2 * glassVar;
          const c = new THREE.Color(glass).multiplyScalar(v);
          const grd = a.createLinearGradient(0, y, 0, y + bh);
          grd.addColorStop(0, '#' + c.clone().multiplyScalar(1.18).getHexString());
          grd.addColorStop(1, '#' + c.getHexString());
          a.fillStyle = grd; a.fillRect(x0, y, x1 - x0, bh);
          // roughness (G) low, metalness (B) high -> mirror-like glass
          // dielectric glass: low metalness so Fresnel makes it dark face-on and mirror-like at grazing angles
          r.fillStyle = `rgb(0,${10 + R() * 14 | 0},${b.metal ?? 45})`; r.fillRect(x0, y, x1 - x0, bh);
          hg.fillStyle = '#6a6a6a'; hg.fillRect(x0, y, x1 - x0, bh);          // glass is recessed
          if (R() < litChance){                                                  // lit office at night
            const k = 0.55 + R() * 0.45;
            e.fillStyle = `rgb(${warm[0] * k | 0},${warm[1] * k | 0},${warm[2] * k | 0})`;
            e.fillRect(x0 + 2, y + 2, x1 - x0 - 4, bh - 4);
          }
        }
      } else if (b.kind === 'steel' || b.kind === 'fin'){
        const grd = a.createLinearGradient(0, y, 0, y + bh);
        const s = new THREE.Color(steel);
        grd.addColorStop(0, '#' + s.clone().multiplyScalar(1.08).getHexString());
        grd.addColorStop(1, '#' + s.clone().multiplyScalar(b.kind === 'fin' ? 0.72 : 0.9).getHexString());
        a.fillStyle = grd; a.fillRect(0, y, W, bh);
        r.fillStyle = `rgb(0,${b.rough ?? 80},${b.metal ?? 255})`; r.fillRect(0, y, W, bh);
        if (b.kind === 'fin'){                                                   // projecting sunshade lip
          const hgrd = hg.createLinearGradient(0, y, 0, y + bh);
          hgrd.addColorStop(0, '#ffffff'); hgrd.addColorStop(1, '#9a9a9a');
          hg.fillStyle = hgrd; hg.fillRect(0, y, W, bh);
          a.fillStyle = 'rgba(0,0,0,0.35)'; a.fillRect(0, y + bh, W, Math.max(2, bh * 0.5)); // its shadow on the glass
        } else { hg.fillStyle = '#9a9a9a'; hg.fillRect(0, y, W, bh); }
        if (steelGlow){                                                          // floodlit steel at night
          const k = steelGlow * (b.kind === 'fin' ? 1 : 0.7);
          e.fillStyle = `rgb(${235 * k | 0},${240 * k | 0},${255 * k | 0})`; e.fillRect(0, y, W, bh);
        }
        // brushed-steel streaks
        a.globalAlpha = 0.06;
        for (let i = 0; i < 40; i++){ a.fillStyle = R() < 0.5 ? '#fff' : '#000'; a.fillRect(R() * W, y, 1 + R() * 3, bh); }
        a.globalAlpha = 1;
      } else if (b.kind === 'dark'){
        a.fillStyle = dark; a.fillRect(0, y, W, bh);
        r.fillStyle = 'rgb(0,160,40)'; r.fillRect(0, y, W, bh);
        hg.fillStyle = '#707070'; hg.fillRect(0, y, W, bh);
      }
    }
  }
  if (mullion){
    const n = Math.round(tileW / mullion), mw = Math.max(2, mullionW * px);
    for (let i = 0; i < n; i++){
      const x = i * W / n - mw / 2;
      for (const xx of [x, x + W]){                // draw wrapped copy so the seam tiles
        a.fillStyle = steel; a.fillRect(xx, 0, mw, Hh);
        a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(xx + mw, 0, mw * 0.6, Hh);
        r.fillStyle = 'rgb(0,70,255)'; r.fillRect(xx, 0, mw, Hh);
        hg.fillStyle = '#d8d8d8'; hg.fillRect(xx, 0, mw, Hh);
        e.fillStyle = '#000'; e.fillRect(xx, 0, mw, Hh);
      }
    }
  }
  return {
    map: tex(alb, true), ormMap: tex(rm, false), normalMap: tex(heightToNormal(hgt, 3.0 * finDepth), false),
    emissiveMap: tex(em, true), tileW, tileH: floorH * floors,
  };
}

// Stone / plaster wall with brick-red & cream bands (colonial Moorish buildings).
export function masonry({ tileW = 4, tileH = 4, px = 96, base = '#a8452f', band = '#efe6d2', bandEvery = 1.2, bandH = 0.28, mortar = '#c9b9a3', brick = [0.23, 0.075], seed = 3 }){
  const W = Math.round(tileW * px), H = Math.round(tileH * px), R = rng(seed);
  const alb = canvas(W, H), rm = canvas(W, H), hgt = canvas(W, H);
  const a = alb.getContext('2d'), r = rm.getContext('2d'), hg = hgt.getContext('2d');
  a.fillStyle = mortar; a.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(0,235,0)'; r.fillRect(0, 0, W, H);
  hg.fillStyle = '#5a5a5a'; hg.fillRect(0, 0, W, H);
  const bw = brick[0] * px, bh = brick[1] * px;
  for (let row = 0, y = 0; y < H; row++, y += bh){
    const off = (row % 2) * bw / 2;
    for (let x = -bw; x < W + bw; x += bw){
      const c = new THREE.Color(base).multiplyScalar(0.85 + R() * 0.3);
      a.fillStyle = '#' + c.getHexString(); a.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      hg.fillStyle = '#9a9a9a'; hg.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
  if (band){
    for (let y = 0; y < H; y += bandEvery * px){
      a.fillStyle = band; a.fillRect(0, y, W, bandH * px);
      a.globalAlpha = 0.12;
      for (let i = 0; i < 60; i++){ a.fillStyle = R() < 0.5 ? '#fff' : '#6b5d48'; a.fillRect(R() * W, y + R() * bandH * px, 2 + R() * 6, 1 + R() * 2); }
      a.globalAlpha = 1;
      hg.fillStyle = '#a8a8a8'; hg.fillRect(0, y, W, bandH * px);
      r.fillStyle = 'rgb(0,200,0)'; r.fillRect(0, y, W, bandH * px);
    }
  }
  // weathering streaks
  a.globalAlpha = 0.08;
  for (let i = 0; i < 30; i++){ a.fillStyle = '#2b241c'; a.fillRect(R() * W, R() * H * 0.3, 1 + R() * 3, H * (0.3 + R() * 0.7)); }
  a.globalAlpha = 1;
  return { map: tex(alb, true), ormMap: tex(rm, false), normalMap: tex(heightToNormal(hgt, 2.2), false), tileW, tileH };
}

// Simple tiling noise texture (grass, paving, copper patina...).
export function noiseTex({ size = 256, base = '#4d8c3f', vary = 0.18, specks = 4000, speckSize = 2, seed = 11, stripes = 0, stripeColor = null }){
  const c = canvas(size, size), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  if (stripes){
    for (let i = 0; i < stripes; i++){
      if (i % 2) continue;
      g.fillStyle = stripeColor; g.fillRect(0, i * size / stripes, size, size / stripes);
    }
  }
  const b = new THREE.Color(base);
  for (let i = 0; i < specks; i++){
    const k = 1 + (R() - 0.5) * 2 * vary;
    g.fillStyle = '#' + b.clone().multiplyScalar(k).getHexString();
    g.fillRect(R() * size, R() * size, speckSize, speckSize);
  }
  return tex(c, true);
}
