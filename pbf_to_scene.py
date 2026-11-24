#!/usr/bin/env python3
"""Read Malaysia PBF, clip KL city center bbox, build three.js scene JSON (meters, y-up, origin at KLCC)."""
import json, math, osmium
import osmium as o

LAT0, LON0 = 3.1578, 101.7117  # KLCC (Petronas Towers) origin
BBOX = (3.1280, 101.6750, 3.1700, 101.7150)

def mpl(lat): return 111132.92 - 559.82*math.cos(2*math.radians(lat)) + 1.175*math.cos(4*math.radians(lat))
def mplon(lat): return 111412.84*math.cos(math.radians(lat)) - 93.5*math.cos(3*math.radians(lat))
MLAT, MLON = mpl(LAT0), mplon(LAT0)

def xy(lat, lon): return ((lon - LON0) * MLON, (lat - LAT0) * MLAT)
def in_bbox(lat, lon):
    return BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]

class WayStore(o.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes = {}
        self.ways = {}
    def node(self, n):
        if in_bbox(n.location.lat, n.location.lon):
            self.nodes[n.id] = (n.location.lon, n.location.lat)
    def way(self, w):
        t = w.tags
        if not ("building" in t or "highway" in t or t.get("natural") == "water"
                or t.get("leisure") in ("park", "garden", "pitch", "playground")
                or t.get("landuse") in ("grass", "forest", "meadow", "sand", "brownfield", "construction", "industrial")
                or t.get("natural") in ("sand", "bare_rock", "scrub")
                or t.get("amenity") in ("parking", "school", "hospital")
                or t.get("surface") in ("dirt", "sand", "gravel", "unpaved")
                or "railway" in t):
            return
        locs = [(nd.lon, nd.lat) for nd in w.nodes]
        if not any(in_bbox(la, lo) for lo, la in locs):
            return
        self.ways[w.id] = (dict(t), locs)

print("Pass 1: collecting ways…")
h = WayStore()
h.apply_file("data/malaysia-singapore-brunei.osm.pbf", locations=True)
print(f"ways: {len(h.ways)}, nodes sampled: {len(h.nodes)}")

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
    """Pick a vivid facade color by building type/height (RGB 0-1)."""
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
    j = 0.85 + (hash(str(sorted(t.items()))) % 100) / 100 * 0.3  # strong per-building variation
    return tuple(min(1.0, c * j) for c in base)

def add_colored_tris(tris, buf, cbuf, h, color):
    for tri in tris:
        for (x, y) in tri:
            buf.extend([x, h, -y]); cbuf.extend(color)

def add_walls(ring, h, buf, cbuf, color, wall_shade=0.82):
    wc = tuple(c * wall_shade for c in color)
    for i in range(len(ring)-1):
        x1, y1 = ring[i]; x2, y2 = ring[i+1]
        buf.extend([x1,0,-y1, x2,0,-y2, x2,h,-y2, x1,0,-y1, x2,h,-y2, x1,h,-y1])
        for _ in range(6): cbuf.extend(wc)

def add_flat(tris, buf, h):
    for tri in tris:
        for (x, y) in tri: buf.extend([x, h, -y])

for wid, (t, locs) in h.ways.items():
    pts = [xy(lat, lon) for lon, lat in locs]
    if len(pts) < 3: 
        if "highway" in t and len(pts) >= 2:
            pass
        else:
            continue
    hw = t.get("highway")
    rw = t.get("railway")
    if hw and "area" not in t:
        width = {"motorway":18,"trunk":16,"primary":14,"secondary":10,"tertiary":8,
                 "residential":6,"unclassified":6,"service":4,"footway":2.5,"pedestrian":4}.get(hw, 3)
        if len(pts) < 2: continue
        # sidewalk strips on both sides of streets
        if hw in ("residential","tertiary","secondary","primary") and width >= 8:
            # sidewalk = light concrete ribbon offset to each side
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
                    out["paved"].extend([ix1,0.14,-iy1, ix2,0.14,-iy2, ix2b,0.14,-iy2b,
                                         ix1,0.14,-iy1, ix2b,0.14,-iy2b, ix1b,0.14,-iy1b])
    if rw and not hw:
        # railway line: store centerline for track rendering + train paths
        if rw in ("rail", "light_rail", "subway", "tram", "monorail") and len(pts) >= 2:
            out["rails"].append([float(x) for p in pts for x in (p[0], p[1])])
        continue
    if hw:
        width = {"motorway":18,"trunk":16,"primary":14,"secondary":10,"tertiary":8,
                 "residential":6,"unclassified":6,"service":4,"footway":2.5,"pedestrian":4}.get(hw, 3)
        if len(pts) < 2: continue
        if hw in ("motorway","trunk","primary","secondary"):
            out["centers"].append([float(x) for pt in pts for x in (pt[0], pt[1])])
        for i in range(len(pts)-1):
            (x1,y1),(x2,y2) = pts[i], pts[i+1]
            dx,dy = x2-x1, y2-y1
            L = math.hypot(dx,dy)
            if L < 0.3: continue
            nx,ny = -dy/L*width/2, dx/L*width/2
            out["roads"].extend([x1+nx,0.1,-(y1+ny), x2+nx,0.1,-(y2+ny), x2-nx,0.1,-(y2-ny),
                                 x1+nx,0.1,-(y1+ny), x2-nx,0.1,-(y2-ny), x1-nx,0.1,-(y1-ny)])
            road_col = (0.44, 0.44, 0.47) if width >= 10 else (0.62, 0.62, 0.64)
            for _ in range(6): out["roads_c"].extend(road_col)
        continue
    area = shoelace(pts)
    if abs(area) < 3: continue
    ring = pts if area > 0 else list(reversed(pts))
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
        add_flat(earclip(ring), out["bare"], 0.04)   # sand / dirt / bare ground
    elif t.get("amenity") in ("parking","school","hospital"):
        add_flat(earclip(ring), out["paved"], 0.12)  # concrete lots

# stations: nodes with railway=station/halt (need node tags — rescan is expensive, so use
# way-tagged station buildings instead) + record station areas for viewer markers
for wid, (t, locs) in h.ways.items():
    if t.get("railway") == "station" or t.get("building") == "train_station":
        pts = [xy(lat, lon) for lon, lat in locs]
        if pts:
            out["stations"].append([float(x) for p in pts for x in (p[0], p[1])])

# ground color: neutral light concrete so roads/green contrast
GROUND = (0.72, 0.72, 0.70)

json.dump(out, open("data/kl_scene.json","w"))
print({k: len(v)//9 for k, v in out.items()}, "triangles")
