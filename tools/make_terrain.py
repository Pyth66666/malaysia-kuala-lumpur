#!/usr/bin/env python3
"""Build a bare-ground height grid for the KL scene from the Copernicus GLO-30 DEM.

Copernicus GLO-30 is a *surface* model (rooftops and tree canopy included), so:
  1. sample the DEM onto a 15 m grid in scene coordinates (metres from KLCC, x east, z south)
  2. mask every OSM building footprint (from data/kl_scene.bin roofs), dilated by one cell
  3. erode remaining canopy/clutter with a local-minimum filter, then fill masked cells by
     diffusion from surrounding street-level ground, then smooth
  4. write data/kl_terrain.bin (float32, row-major [z][x], metres relative to ground at KLCC)
     + data/kl_terrain.json (grid description + absolute datum)

Usage:  python tools/make_terrain.py   (run from kl3d/)
"""
import json, math, sys
import numpy as np
import tifffile

DEM = 'data/Copernicus_DSM_COG_10_N03_00_E101_00_DEM.tif'
LAT0, LON0 = 3.1578, 101.7117
STEP = 15.0            # grid spacing, metres
MARGIN = 600.0         # beyond the data bounds
def mpl(lat): return 111132.92 - 559.82*math.cos(2*math.radians(lat)) + 1.175*math.cos(4*math.radians(lat))
def mplon(lat): return 111412.84*math.cos(math.radians(lat)) - 93.5*math.cos(3*math.radians(lat))
MLAT, MLON = mpl(LAT0), mplon(LAT0)

# ---- DEM ------------------------------------------------------------------------------------
with tifffile.TiffFile(DEM) as tf:
    page = tf.pages[0]
    dem = page.asarray().astype(np.float64)
    tie = page.tags['ModelTiepointTag'].value          # (i, j, k, X, Y, Z)
    scale = page.tags['ModelPixelScaleTag'].value      # (sx, sy, sz)
    geokeys = page.tags.get('GeoKeyDirectoryTag')
    keys = list(geokeys.value) if geokeys else []
    pixel_is_point = False
    for i in range(4, len(keys), 4):
        if keys[i] == 1025: pixel_is_point = keys[i + 3] == 2   # GTRasterTypeGeoKey
H, W = dem.shape
lon_origin, lat_origin, sx, sy = tie[3], tie[4], scale[0], scale[1]
off = 0.0 if pixel_is_point else 0.5                  # value sits at the pixel centre
print(f'DEM {W}x{H}, origin lon {lon_origin} lat {lat_origin}, px {sx:.8f}°, pixel_is_point={pixel_is_point}')

def sample(lat, lon):
    """bilinear sample of the DEM at arrays of lat/lon"""
    c = (lon - lon_origin) / sx - off
    r = (lat_origin - lat) / sy - off
    c0 = np.clip(np.floor(c).astype(int), 0, W - 2); r0 = np.clip(np.floor(r).astype(int), 0, H - 2)
    fc = np.clip(c - c0, 0, 1); fr = np.clip(r - r0, 0, 1)
    a = dem[r0, c0]; b = dem[r0, c0 + 1]; cc = dem[r0 + 1, c0]; d = dem[r0 + 1, c0 + 1]
    return (a * (1 - fc) + b * fc) * (1 - fr) + (cc * (1 - fc) + d * fc) * fr

# ---- scene bounds + building footprints -----------------------------------------------------
meta = json.load(open('data/kl_scene_meta.json'))
raw = open('data/' + meta.get('binary', 'kl_scene.bin'), 'rb').read()
def arr(key):
    info = meta['arrays'][key]
    return np.frombuffer(raw, dtype=np.float32, count=info['byteLength'] // 4, offset=info['byteOffset'])
B = arr('buildings').reshape(-1, 3, 3)                 # [tri][vertex][xyz]
allx = np.concatenate([B[:, :, 0].ravel(), arr('roads')[0::3]]); allz = np.concatenate([B[:, :, 2].ravel(), arr('roads')[2::3]])
minX, maxX = float(allx.min()) - MARGIN, float(allx.max()) + MARGIN
minZ, maxZ = float(allz.min()) - MARGIN, float(allz.max()) + MARGIN
nx = int(math.ceil((maxX - minX) / STEP)) + 1; nz = int(math.ceil((maxZ - minZ) / STEP)) + 1
print(f'grid {nx}x{nz} @ {STEP} m, x {minX:.0f}..{maxX:.0f}, z {minZ:.0f}..{maxZ:.0f}')

gx = minX + np.arange(nx) * STEP; gz = minZ + np.arange(nz) * STEP
X, Z = np.meshgrid(gx, gz)
lat = LAT0 - Z / MLAT; lon = LON0 + X / MLON
dsm = sample(lat, lon)

# roofs: triangles whose 3 vertices share one height > 2 m
ys = B[:, :, 1]
roof = (np.abs(ys[:, 0] - ys[:, 1]) < 1e-3) & (np.abs(ys[:, 1] - ys[:, 2]) < 1e-3) & (ys[:, 0] > 2)
R = B[roof]
mask = np.zeros((nz, nx), bool)
# mark cells at vertices and at triangle centroids, then scan-fill each triangle's bbox
ci = lambda x: np.clip(np.round((x - minX) / STEP).astype(int), 0, nx - 1)
cj = lambda z: np.clip(np.round((z - minZ) / STEP).astype(int), 0, nz - 1)
for v in range(3): mask[cj(R[:, v, 2]), ci(R[:, v, 0])] = True
mask[cj(R[:, :, 2].mean(1)), ci(R[:, :, 0].mean(1))] = True
for tri in R:
    xs, zs = tri[:, 0], tri[:, 2]
    i0, i1 = ci(xs.min()), ci(xs.max()); j0, j1 = cj(zs.min()), cj(zs.max())
    if i1 - i0 < 1 and j1 - j0 < 1: continue
    px, pz = np.meshgrid(gx[i0:i1 + 1], gz[j0:j1 + 1])
    (ax, az), (bx, bz), (cx, cz) = (xs[0], zs[0]), (xs[1], zs[1]), (xs[2], zs[2])
    d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz)
    d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz)
    d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az)
    inside = ~(((d1 < 0) | (d2 < 0) | (d3 < 0)) & ((d1 > 0) | (d2 > 0) | (d3 > 0)))
    mask[j0:j1 + 1, i0:i1 + 1] |= inside
# dilate by one cell (walls, podiums, the DEM's 30 m footprint blur)
m = mask.copy()
m[1:, :] |= mask[:-1, :]; m[:-1, :] |= mask[1:, :]; m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
mask = m
print(f'building mask covers {mask.mean() * 100:.1f}% of the grid')

def window(a, r, fn):
    p = np.pad(a, r, mode='edge')
    v = np.lib.stride_tricks.sliding_window_view(p, (2 * r + 1, 2 * r + 1))
    return fn(v, axis=(2, 3))

# ---- bare ground ----------------------------------------------------------------------------
g = dsm.copy()
g[mask] = np.nan
# local minimum over ±15 m (1 cell) trims tree crowns (wider windows shave hilltops) and street furniture between buildings
filled = np.where(np.isnan(g), np.inf, g)
gmin = window(filled, int(sys.argv[1]) if len(sys.argv) > 1 else 1, np.min)
g = np.where(np.isnan(g), np.nan, np.minimum(g, gmin + 0.0))
g[np.isinf(g)] = np.nan
# fill masked cells by diffusion from known ground
known = ~np.isnan(g)
if not known.any(): sys.exit('no open ground found')
fillv = np.where(known, g, np.nanmean(g))
for it in range(600):
    p = np.pad(fillv, 1, mode='edge')
    avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
    fillv = np.where(known, g, avg)
# gentle smoothing (~30 m) so streets don't show DEM pixel steps
k = np.array([1, 4, 6, 4, 1], float); k /= k.sum()
sm = fillv
for axis in (0, 1):
    p = np.pad(sm, [(2, 2) if a == axis else (0, 0) for a in (0, 1)], mode='edge')
    sm = sum(k[i] * np.take(p, range(i, i + sm.shape[axis]), axis=axis) for i in range(5))
ground = sm

def at(x, z):
    i = (x - minX) / STEP; j = (z - minZ) / STEP
    i0, j0 = int(i), int(j); fi, fj = i - i0, j - j0
    return float((ground[j0, i0] * (1 - fi) + ground[j0, i0 + 1] * fi) * (1 - fj) + (ground[j0 + 1, i0] * (1 - fi) + ground[j0 + 1, i0 + 1] * fi) * fj)
def raw_at(x, z):
    return float(sample(np.array([LAT0 - z / MLAT]), np.array([LON0 + x / MLON]))[0])

datum = at(0, 0)   # ground at the KLCC origin = scene y 0
checks = {
    'KLCC (origin)': (0, 0), 'KL Tower base (Bukit Nanas)': (-883, 546), 'Dataran Merdeka padang': (-2000, 1000),
    'Masjid Jamek (river confluence)': (-1780, 989), 'Merdeka 118': (-1219, 1780), 'Bukit Bintang': (-80, 1249),
    'KL Sentral': (-2812, 2592), 'Jalan Ampang (Bukit Nanas foot)': (-700, 420),
}
print(f'datum (ground at KLCC) = {datum:.1f} m above sea level')
for name, (x, z) in checks.items():
    print(f'  {name:36s} ground {at(x, z):6.1f} m ASL   (raw surface {raw_at(x, z):6.1f})   scene y {at(x, z) - datum:+6.1f}')

out = (ground - datum).astype(np.float32)
out.tofile('data/kl_terrain.bin')
json.dump({'binary': 'kl_terrain.bin', 'minX': minX, 'minZ': minZ, 'step': STEP, 'nx': nx, 'nz': nz,
           'datumASL': round(datum, 2), 'source': 'Copernicus GLO-30 DEM (ESA), buildings masked, canopy suppressed'},
          open('data/kl_terrain.json', 'w'), indent=1)
print('wrote data/kl_terrain.bin', out.nbytes // 1024, 'KB; min', round(float(out.min()), 1), 'max', round(float(out.max()), 1))
