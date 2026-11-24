#!/usr/bin/env python3
"""Convert Overpass OSM JSON for KL city center into a three.js-ready scene file.

Outputs scene.json with flat arrays of triangle vertices (meters, ENU coords
origin at bbox center) grouped by material: buildings, roads, water, green.
Extrudes building footprints to real height from building:levels / height tags.
"""
import json, math, sys

LAT0, LON0 = 3.1490, 101.6950  # bbox center: KLCC / Bukit Bintang area
R = 6378137.0

def meters_per_deg_lat(lat):
    return 111132.92 - 559.82*math.cos(2*math.radians(lat)) + 1.175*math.cos(4*math.radians(lat))

def meters_per_deg_lon(lat):
    return 111412.84*math.cos(math.radians(lat)) - 93.5*math.cos(3*math.radians(lat))

MPD_LAT = meters_per_deg_lat(LAT0)
MPD_LON = meters_per_deg_lon(LAT0)

def to_xy(lat, lon):
    return ((lon - LON0) * MPD_LON, (lat - LAT0) * MPD_LAT)

def shoelace(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1]
    return s / 2.0

def triangulate(ring):
    # ear clipping on a simple polygon (returns triangles as vertex triples)
    pts = ring[:-1] if ring[0] == ring[-1] else list(ring)
    n = len(pts)
    if n < 3:
        return []
    idx = list(range(n))
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k-1], idx[k], idx[(k+1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if cross(a, b, c) <= 0:
                continue
            ok = True
            for j in idx:
                if j in (i0, i1, i2):
                    continue
                p = pts[j]
                d1 = cross(a, b, p); d2 = cross(b, c, p); d3 = cross(c, a, p)
                if d1 >= 0 and d2 >= 0 and d3 >= 0:
                    ok = False
                    break
            if ok:
                tris.append((a, b, c))
                idx.pop(k)
                break
        else:
            break
    if len(idx) == 3:
        tris.append((pts[idx[0]], pts[idx[1]], pts[idx[2]]))
    return tris

def building_height(tags):
    if "height" in tags:
        try: return float(tags["height"].split(";")[0].replace("m", "").strip())
        except ValueError: pass
    levels = tags.get("building:levels")
    if levels:
        try: return float(levels) * 3.2 + 1.5
        except ValueError: pass
    bt = tags.get("building", "yes")
    return {"house": 6, "apartments": 24, "residential": 12, "commercial": 18,
            "retail": 8, "office": 30, "hotel": 28, "industrial": 10}.get(bt, 10)

def push_tri(buf, tri, h):
    for (x, y) in tri:
        buf.extend([x, 0.0, -y])
    # roof at height h (y up in three.js), footprint y -> -z
    for (x, y) in tri:
        buf.extend([x, h, -y])

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "data/kl_center.osm.json"
    data = json.load(open(src, encoding="utf-8"))
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in data["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in data["elements"] if e["type"] == "way"}
    rels = [e for e in data["elements"] if e["type"] == "relation"]

    def ring_of(way):
        pts = [to_xy(nodes[n][1], nodes[n][0]) for n in way["nodes"] if n in nodes]
        return pts if len(pts) >= 3 else None

    out = {"buildings": [], "roads": [], "water": [], "green": []}

    for wid, w in ways.items():
        t = w.get("tags", {})
        ring = ring_of(w)
        if not ring:
            continue
        if "building" in t and "highway" not in t:
            h = building_height(t)
            # walls
            for i in range(len(ring) - 1):
                x1, y1 = ring[i]; x2, y2 = ring[i+1]
                if (x2-x1)**2 + (y2-y1)**2 < 1e-8:
                    continue
                out["buildings"].extend([x1, 0, -y1, x2, 0, -y2, x2, h, -y2,
                                         x1, 0, -y1, x2, h, -y2, x1, h, -y1])
            area = shoelace(ring)
            tris = triangulate(ring if area > 0 else list(reversed(ring)))
            for tri in tris:
                push_tri(out["buildings"], tri, h)
        elif "natural" in t and t["natural"] == "water" or t.get("waterway") in ("river", "stream", "canal") and len(ring) > 3:
            area = shoelace(ring)
            if abs(area) < 5: continue
            for tri in triangulate(ring if area > 0 else list(reversed(ring))):
                push_tri(out["water"], tri, -0.5)
        elif t.get("leisure") in ("park", "garden") or t.get("landuse") in ("grass", "forest", "meadow"):
            area = shoelace(ring)
            if abs(area) < 5: continue
            for tri in triangulate(ring if area > 0 else list(reversed(ring))):
                push_tri(out["green"], tri, 0.05)

    # relations (multipolygon buildings, e.g. KLCC towers with courtyards)
    for r in rels:
        t = r.get("tags", {})
        if "building" not in t or t.get("type") != "multipolygon":
            continue
        outer, inner = [], []
        for m in r.get("members", []):
            if m["type"] == "way" and m["ref"] in ways:
                if m.get("role") == "outer": outer.append(ring_of(ways[m["ref"]]))
                elif m.get("role") == "inner": inner.append(ring_of(ways[m["ref"]]))
        outer = [o for o in outer if o]
        if not outer: continue
        h = building_height(t)
        for ring in outer + [i for i in inner if i]:
            for i in range(len(ring) - 1):
                x1, y1 = ring[i]; x2, y2 = ring[i+1]
                out["buildings"].extend([x1, 0, -y1, x2, 0, -y2, x2, h, -y2,
                                         x1, 0, -y1, x2, h, -y2, x1, h, -y1])
        area = shoelace(outer[0])
        for tri in triangulate(outer[0] if area > 0 else list(reversed(outer[0]))):
            push_tri(out["buildings"], tri, h)

    # roads: flat ribbons along the way
    for wid, w in ways.items():
        t = w.get("tags", {})
        hw = t.get("highway")
        if not hw: continue
        width = {"motorway": 18, "trunk": 16, "primary": 14, "secondary": 10,
                 "tertiary": 8, "residential": 6, "service": 4}.get(hw, 3)
        pts = [to_xy(nodes[n][1], nodes[n][0]) for n in w["nodes"] if n in nodes]
        if len(pts) < 2: continue
        for i in range(len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i+1]
            dx, dy = x2-x1, y2-y1
            L = math.hypot(dx, dy)
            if L < 0.5: continue
            nx, ny = -dy/L*width/2, dx/L*width/2
            out["roads"].extend([x1+nx, 0.1, -(y1+ny), x2+nx, 0.1, -(y2+ny), x2-nx, 0.1, -(y2-ny),
                                 x1+nx, 0.1, -(y1+ny), x2-nx, 0.1, -(y2-ny), x1-nx, 0.1, -(y1-ny)])

    json.dump(out, open("data/kl_scene.json", "w"))
    counts = {k: len(v)//9 for k, v in out.items()}
    print("triangles:", counts, "| extents ~5km x 5km")

if __name__ == "__main__":
    main()
