#!/usr/bin/env python3
"""Read Malaysia PBF, clip KL city center bbox, build three.js scene (meters, y-up, origin at KLCC).

Writes:
  data/kl_scene.bin   - Float32 triangle arrays (contiguous)
  data/kl_scene_meta.json - key -> {byteOffset, byteLength, count} + polylines (centers/rails/stations) stay in JSON
"""
import json, math, zlib, osmium as o
from array import array

LAT0, LON0 = 3.1578, 101.7117  # KLCC (Petronas Towers) origin
BBOX = (3.1280, 101.6750, 3.1700, 101.7150)

def mpl(lat): return 111132.92 - 559.82*math.cos(2*math.radians(lat)) + 1.175*math.cos(4*math.radians(lat))
def mplon(lat): return 111412.84*math.cos(math.radians(lat)) - 93.5*math.cos(3*math.radians(lat))
MLAT, MLON = mpl(LAT0), mplon(LAT0)

def xy(lat, lon): return ((lon - LON0) * MLON, (lat - LAT0) * MLAT)
def in_bbox(lat, lon):
    return BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]

ROAD_WIDTH = {"motorway":18,"trunk":16,"primary":14,"secondary":10,"tertiary":8,
              "residential":6,"unclassified":6,"service":4,"footway":2.5,"pedestrian":4}

def r2(x): return round(float(x), 2)
def r3(c): return round(float(c), 3)

POLYGON_TAGS = ("building", "water", "leisure", "landuse", "natural", "amenity", "surface")
def is_polygon_feature(t):
    if "building" in t: return True
    if t.get("natural") == "water": return True
    if t.get("leisure") in ("park","garden","pitch","playground"): return True
    if t.get("landuse") in ("grass","forest","meadow","sand","brownfield","construction","industrial"): return True
    if t.get("natural") in ("sand","bare_rock","scrub"): return True
    if t.get("amenity") in ("parking","school","hospital"): return True
    if t.get("surface") in ("dirt","sand","gravel","unpaved"): return True
    return False

def shoelace(r):
    s = 0.0
    for i in range(len(r)-1): s += r[i][0]*r[i+1][1] - r[i+1][0]*r[i][1]
    return s/2

def earclip(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else list(ring)
    n = len(pts)
    if n < 3: return []
    def cross(o_, a, b): return (a[0]-o_[0])*(b[1]-o_[1]) - (a[1]-o_[1])*(b[0]-o_[0])
    idx = list(range(n)); tris = []
    guard = 0
    while len(idx) > 3 and guard < 20000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k-1], idx[k], idx[(k+1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if cross(a, b, c) <= 0: continue
            ok = True
            for j in idx:
                if j in (i0, i1, i2): continue
                p = pts[j]
                if cross(a,b,p) >= 0 and cross(b,c,p) >= 0 and cross(c,a,p) >= 0:
                    ok = False; break
            if ok:
                tris.append((a, b, c)); idx.pop(k); break
        else:
            tris.append(tuple(pts[i] for i in idx[:3])); break
    if len(idx) == 3: tris.append((pts[idx[0]], pts[idx[1]], pts[idx[2]]))
    return tris

def bheight(t):
    if "height" in t:
        try: return float(t["height"].split(";")[0].replace("m","").strip())
        except ValueError: pass
    lv = t.get("building:levels")
    if lv:
        try: return float(lv)*3.2 + 1.5
        except ValueError: pass
    return {"house":6,"apartments":24,"residential":12,"commercial":18,"retail":8,
            "office":30,"hotel":28,"industrial":10}.get(t.get("building","yes"), 10)

out = {"buildings": [], "buildings_c": [], "roads": [], "roads_c": [], "water": [], "green": [], "centers": [], "bare": [], "paved": [], "rails": [], "stations": []}

def palette_for(t, h):
    """Pick a vivid facade color by building type/height (RGB 0-1). Stable across runs via crc32."""
    b = t.get("building", "")
    if h > 100 or (b in ("office", "commercial") and h > 40):
        base = (0.55, 0.72, 0.88)   # blue glass tower
    elif b in ("retail", "commercial"):
        base = (0.92, 0.68, 0.45)   # shoplot orange-tan
    elif b in ("house", "residential", "terrace", "semidetached_house"):
        base = (0.93, 0.78, 0.58)   # warm housing
    elif b == "apartments":
        base = (0.80, 0.80, 0.82)
    elif b == "hotel":
        base = (0.88, 0.72, 0.66)
    elif b == "school":
        base = (0.85, 0.85, 0.60)
    elif b == "hospital":
        base = (0.92, 0.94, 0.96)
    else:
        base = (0.78, 0.76, 0.72)
    j = 0.85 + (zlib.crc32(json.dumps(sorted(t.items())).encode()) % 100) / 100 * 0.3
    return tuple(min(1.0, c * j) for c in base)

def add_colored_tris(tris, buf, cbuf, h, color):
    h = r2(h)
    cc = (r3(color[0]), r3(color[1]), r3(color[2]))
    for tri in tris:
        for (x, y) in tri:
            buf.extend([r2(x), h, r2(-y)]); cbuf.extend(cc)

def add_walls(ring, h, buf, cbuf, color, wall_shade=0.82):
    h = r2(h)
    wc = (r3(color[0]*wall_shade), r3(color[1]*wall_shade), r3(color[2]*wall_shade))
    for i in range(len(ring)-1):
        x1, y1 = ring[i]; x2, y2 = ring[i+1]
        buf.extend([r2(x1), r2(0.0), r2(-y1), r2(x2), r2(0.0), r2(-y2), r2(x2), h, r2(-y2),
                    r2(x1), r2(0.0), r2(-y1), r2(x2), h, r2(-y2), r2(x1), h, r2(-y1)])
        cbuf.extend([wc[0],wc[1],wc[2], wc[0],wc[1],wc[2], wc[0],wc[1],wc[2], wc[0],wc[1],wc[2], wc[0],wc[1],wc[2], wc[0],wc[1],wc[2]])

def add_flat(tris, buf, h):
    h = r2(h)
    for tri in tris:
        for (x, y) in tri: buf.extend([r2(x), h, r2(-y)])

def orient_ring(pts):
    """Force CCW outer ring."""
    if shoelace(pts) < 0: pts = list(reversed(pts))
    return pts

def simplify_ring(pts, max_pts):
    """Cap vertex count (stride sampling) so ear clipping stays O(n^3)-safe; keep closure."""
    closed = len(pts) > 1 and pts[0] == pts[-1]
    core = pts[:-1] if closed else pts
    n = len(core)
    if n <= max_pts: return pts
    step = int(math.ceil(n / max_pts))
    simp = core[::step]
    if closed: simp = simp + [simp[0]]
    return simp

def process_polygon(t, ring):
    """Classify + emit one polygonal feature (outer ring, CCW, holes skipped)."""
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    ring = simplify_ring(ring, 64 if "building" in t else 128)
    bh = None
    if "building" in t:
        bh = bheight(t)
        col = palette_for(t, bh)
        add_walls(ring, bh, out["buildings"], out["buildings_c"], col)
        add_colored_tris(earclip(ring), out["buildings"], out["buildings_c"], bh, col)
    elif t.get("natural") == "water":
        add_flat(earclip(ring), out["water"], -0.6)
    elif t.get("leisure") in ("park","garden") or t.get("landuse") in ("grass","forest","meadow") or t.get("leisure") in ("pitch","playground"):
        add_flat(earclip(ring), out["green"], 0.05)
    elif (t.get("landuse") in ("sand","brownfield","construction","industrial")
          or t.get("natural") in ("sand","bare_rock","scrub")
          or t.get("surface") in ("dirt","sand","gravel","unpaved")):
        add_flat(earclip(ring), out["bare"], 0.04)
    elif t.get("amenity") in ("parking","school","hospital"):
        add_flat(earclip(ring), out["paved"], 0.12)

class KLHandler(o.SimpleHandler):
    def __init__(self):
        super().__init__()
    def way(self, w):
        t = dict(w.tags)
        hw = t.get("highway")
        rw = t.get("railway")
        if not hw and not rw and not is_polygon_feature(t):
            return
        locs = [(nd.lon, nd.lat) for nd in w.nodes]
        if not any(in_bbox(la, lo) for lo, la in locs):
            return
        pts = [xy(lat, lon) for lon, lat in locs]

        # stations: way-tagged station buildings (polyline, stay in JSON)
        if t.get("railway") == "station" or t.get("building") == "train_station":
            if pts:
                out["stations"].append([r2(x) for p in pts for x in (p[0], p[1])])
            return

        # linear highways -> road ribbons + centerlines
        if hw:
            width = ROAD_WIDTH.get(hw, 3)
            if len(pts) < 2: return
            if hw in ("motorway","trunk","primary","secondary"):
                out["centers"].append([r2(x) for p in pts for x in (p[0], p[1])])
            # sidewalk strips on both sides of streets
            if hw in ("residential","tertiary","secondary","primary") and width >= 8:
                off1 = width/2 + 1.6
                for i in range(len(pts)-1):
                    (x1,y1),(x2,y2) = pts[i], pts[i+1]
                    dx,dy = x2-x1, y2-y1
                    L = math.hypot(dx,dy)
                    if L < 0.3: continue
                    nx,ny = -dy/L, dx/L
                    for s_ in (1, -1):
                        ix1,iy1 = x1+nx*off1*s_, y1+ny*off1*s_
                        ix2,iy2 = x2+nx*off1*s_, y2+ny*off1*s_
                        w2 = 1.6
                        ix1b,iy1b = x1+nx*(off1-w2)*s_, y1+ny*(off1-w2)*s_
                        ix2b,iy2b = x2+nx*(off1-w2)*s_, y2+ny*(off1-w2)*s_
                        out["paved"].extend([r2(ix1),r2(0.14),r2(-iy1), r2(ix2),r2(0.14),r2(-iy2), r2(ix2b),r2(0.14),r2(-iy2b),
                                             r2(ix1),r2(0.14),r2(-iy1), r2(ix2b),r2(0.14),r2(-iy2b), r2(ix1b),r2(0.14),r2(-iy1b)])
            for i in range(len(pts)-1):
                (x1,y1),(x2,y2) = pts[i], pts[i+1]
                dx,dy = x2-x1, y2-y1
                L = math.hypot(dx,dy)
                if L < 0.3: continue
                nx,ny = -dy/L*width/2, dx/L*width/2
                out["roads"].extend([r2(x1+nx),r2(0.1),r2(-(y1+ny)), r2(x2+nx),r2(0.1),r2(-(y2+ny)), r2(x2-nx),r2(0.1),r2(-(y2-ny)),
                                     r2(x1+nx),r2(0.1),r2(-(y1+ny)), r2(x2-nx),r2(0.1),r2(-(y2-ny)), r2(x1-nx),r2(0.1),r2(-(y1-ny))])
                road_col = (0.44, 0.44, 0.47) if width >= 10 else (0.62, 0.62, 0.64)
                out["roads_c"].extend([r3(road_col[0]),r3(road_col[1]),r3(road_col[2])]*6)
            return

        # railway centerlines
        if rw and not hw:
            if rw in ("rail", "light_rail", "subway", "tram", "monorail") and len(pts) >= 2:
                out["rails"].append([r2(x) for p in pts for x in (p[0], p[1])])
            return

        # polygonal closed ways handled by the area handler instead (avoid double emit)
        return

    def area(self, a):
        t = dict(a.tags)
        if not is_polygon_feature(t):
            return
        # iterate outer rings (each is a footprint; skip inner holes)
        try:
            outer_rings = list(a.outer_rings())
        except TypeError:
            return
        if not outer_rings:
            return
        for ring in outer_rings:
            pts = [xy(n.lat, n.lon) for n in ring]
            if len(pts) < 3: continue
            if not any(in_bbox(n.lat, n.lon) for n in ring):
                continue
            ring = orient_ring(pts)
            process_polygon(t, ring)

print("Pass 1: collecting ways & assembling areas…")
h = KLHandler()
h.apply_file("data/malaysia-singapore-brunei.osm.pbf", locations=True)
print("pass 1 done")

# ---- write binary + meta ----
BIN_KEYS = ["buildings","buildings_c","roads","roads_c","water","green","bare","paved"]
meta = {"binary": "kl_scene.bin", "arrays": {}, "polylines": {}}
for k in ("centers","rails","stations"):
    meta["polylines"][k] = out[k]

offset = 0
with open("data/kl_scene.bin", "wb") as f:
    for key in BIN_KEYS:
        vals = out[key]
        arr = array('f', vals)
        arr.tofile(f)
        meta["arrays"][key] = {"byteOffset": offset, "byteLength": arr.itemsize*len(arr), "count": len(arr)}
        offset += arr.itemsize*len(arr)

with open("data/kl_scene_meta.json", "w") as f:
    json.dump(meta, f)

print({k: len(v)//9 for k, v in out.items() if k in ("buildings","roads","water","green","bare","paved")}, "triangles |",
      {k: len(v) for k, v in out.items() if k in ("centers","rails","stations")}, "polylines")
