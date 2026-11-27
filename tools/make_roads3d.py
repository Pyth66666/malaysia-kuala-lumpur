#!/usr/bin/env python3
"""Roads with real vertical structure: bridges, stacked flyovers, ramps and tunnels.

For every OSM highway in the scene bbox this writes the centre line with a height per point
(metres above local ground), so the page can draw elevated decks on piers at the right level:

  * a bridge (or a way with layer >= 1) that crosses a lower road or railway sits at
    layer x 6.5 m (one deck = ~5 m clearance + ~1.5 m structure); a small bridge that crosses
    nothing (a river or a drain) stays near street level
  * heights spread from every deck along the connected road network with a 5.5 % grade,
    so approach ramps rise and fall like the real ones and a layer-2 link that joins a layer-1
    deck climbs between them
  * tunnels (tunnel=yes / layer < 0) are marked so they are not drawn on the surface

Usage (from kl3d/):  python tools/make_roads3d.py   -> data/kl_roads.json
"""
import json, math, heapq, sys
import osmium as o

LAT0, LON0 = 3.1578, 101.7117
BBOX = (3.1280, 101.6750, 3.1700, 101.7150)
PBF = sys.argv[1] if len(sys.argv) > 1 else 'data/malaysia-singapore-brunei.osm.pbf'
DECK = 6.5        # metres per layer
GRADE = 0.055     # ramp gradient
def mpl(lat): return 111132.92 - 559.82*math.cos(2*math.radians(lat)) + 1.175*math.cos(4*math.radians(lat))
def mplon(lat): return 111412.84*math.cos(math.radians(lat)) - 93.5*math.cos(3*math.radians(lat))
MLAT, MLON = mpl(LAT0), mplon(LAT0)
def xz(lat, lon): return ((lon - LON0) * MLON, -(lat - LAT0) * MLAT)
def inb(lat, lon): return BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]

BASE_W = {"motorway": 18, "trunk": 16, "primary": 14, "secondary": 10, "tertiary": 8, "residential": 6,
          "unclassified": 6, "service": 4, "footway": 2.5, "pedestrian": 4, "living_street": 5}
LANE_W = 3.5
FOOT = {'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway', 'track'}
def width(t):
    hw = t.get('highway', '').replace('_link', '')
    if 'width' in t:
        try: return max(2.0, min(40.0, float(t['width'].split(';')[0].replace('m', '').strip())))
        except ValueError: pass
    lanes = None
    try: lanes = int(t.get('lanes', '').split(';')[0])
    except ValueError: pass
    oneway = t.get('oneway') in ('yes', '1', '-1') or hw == 'motorway' or 'junction' in t
    if t.get('highway', '').endswith('_link'): return LANE_W * (lanes or 1) + 1.5
    if lanes: return lanes * LANE_W + (2.5 if hw in ('motorway', 'trunk') else 1.0)
    if oneway and hw in ('motorway', 'trunk', 'primary', 'secondary'): return {'motorway': 12.5, 'trunk': 9.5, 'primary': 8, 'secondary': 7}[hw]
    return BASE_W.get(hw, 3)

def layer_of(t):
    try: return int(float(t.get('layer', '0').split(';')[0]))
    except ValueError: return 0

ways, rails = [], []
class H(o.SimpleHandler):
    def way(self, w):
        t = w.tags
        hw, rw = t.get('highway'), t.get('railway')
        if not hw and rw not in ('rail', 'light_rail', 'subway', 'monorail'): return
        try: nodes = [(n.ref, n.lat, n.lon) for n in w.nodes]
        except o.InvalidLocationError: return
        if len(nodes) < 2 or not any(inb(la, lo) for _, la, lo in nodes): return
        d = dict(t)
        pts = [xz(la, lo) for _, la, lo in nodes]
        if hw:
            if hw in ('proposed', 'construction', 'raceway', 'bus_guideway', 'platform', 'steps', 'corridor', 'elevator'): return
            if d.get('area') == 'yes' or d.get('indoor') == 'yes': return
            ways.append({'id': w.id, 'hw': hw, 'nodes': [n for n, _, _ in nodes], 'pts': pts, 'w': width(d),
                         'layer': layer_of(d), 'hasLayer': 'layer' in d,
                         'bridge': d.get('bridge', 'no') not in ('no',) or d.get('man_made') == 'bridge',
                         'tunnel': d.get('tunnel', 'no') not in ('no',) or d.get('covered') == 'yes' and layer_of(d) < 0,
                         'oneway': d.get('oneway') in ('yes', '1') or hw == 'motorway' or 'junction' in d,
                         'name': d.get('name', '')})
        else:
            rails.append({'pts': pts, 'layer': layer_of(d), 'bridge': d.get('bridge', 'no') != 'no', 'tunnel': d.get('tunnel', 'no') != 'no'})

print('reading', PBF, flush=True)
H().apply_file(PBF, locations=True, idx='flex_mem')
print(len(ways), 'highways,', len(rails), 'railways', flush=True)

# ---- which elevated ways actually pass over something lower? -------------------------------------
CELL = 60.0
grid = {}
def cells(a, b):
    x0, x1 = sorted((a[0], b[0])); z0, z1 = sorted((a[1], b[1]))
    for i in range(int(math.floor(x0 / CELL)), int(math.floor(x1 / CELL)) + 1):
        for j in range(int(math.floor(z0 / CELL)), int(math.floor(z1 / CELL)) + 1):
            yield (i, j)
def lvl(w): return -1 if w['tunnel'] else (max(w['layer'], 1) if w['bridge'] else w['layer'])
for k, w in enumerate(ways):
    for s in range(len(w['pts']) - 1):
        for c in cells(w['pts'][s], w['pts'][s + 1]): grid.setdefault(c, []).append((lvl(w), w['pts'][s], w['pts'][s + 1], k, w['hw'] in FOOT))
for r in rails:
    L = -1 if r['tunnel'] else (max(r['layer'], 1) if r['bridge'] else r['layer'])
    for s in range(len(r['pts']) - 1):
        for c in cells(r['pts'][s], r['pts'][s + 1]): grid.setdefault(c, []).append((L, r['pts'][s], r['pts'][s + 1], -1, False))
def cross(p, q, r, s):
    def o_(a, b, c): return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2, d3, d4 = o_(p, q, r), o_(p, q, s), o_(r, s, p), o_(r, s, q)
    return (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0)

target = {}           # node id -> wanted height
for k, w in enumerate(ways):
    if w['tunnel']: continue
    L = lvl(w)
    if L < 1: continue
    below = -99
    for s in range(len(w['pts']) - 1):
        a, b = w['pts'][s], w['pts'][s + 1]
        for c in cells(a, b):
            for (L2, p, q, k2, foot) in grid.get(c, ()):
                if k2 == k or L2 >= L or L2 < 0 or foot: continue   # tunnels and footpaths need no clearance
                if cross(a, b, p, q): below = max(below, L2)
    if w['hw'] in FOOT:                                          # footbridges: one clear span over the road, never
        h = DECK if below > -99 else 0.0                         # mall-level corridors tagged layer=2..4
    elif below > -99 or L >= 2: h = DECK * L                    # flyover: absolute level (stacks above lower decks)
    else: h = 0.8                                              # small bridge over a river / drain
    w['H'] = h
    for n in w['nodes'][1:-1] if len(w['nodes']) > 2 else []: target[n] = max(target.get(n, 0), h)
    if w['hw'] not in FOOT:                                      # footbridge ends land on stairs at street level
        for n in (w['nodes'][0], w['nodes'][-1]): target[n] = max(target.get(n, 0), h)

# ---- spread heights along the network with a ramp gradient (max-cone, Dijkstra) -------------------
adj = {}
pos = {}
for w in ways:
    if w['tunnel']: continue
    for i, n in enumerate(w['nodes']): pos[n] = w['pts'][i]
    if w['hw'] in FOOT: continue
    for i, n in enumerate(w['nodes']):
        if i: adj.setdefault(n, []).append(w['nodes'][i - 1]); adj.setdefault(w['nodes'][i - 1], []).append(n)
height = dict(target)
pq = [(-h, n) for n, h in target.items()]
heapq.heapify(pq)
while pq:
    nh, n = heapq.heappop(pq); h = -nh
    if h < height.get(n, 0) - 1e-6: continue
    for m in adj.get(n, ()):
        d = math.dist(pos[n], pos[m])
        c = h - GRADE * d
        if c > height.get(m, 0) + 0.05 and c > 0.3:
            height[m] = c; heapq.heappush(pq, (-c, m))

# ---- densify long elevated segments so ramps curve smoothly; write ----------------------------
out = []
n_el = 0
for w in ways:
    if w['tunnel']: out.append({'h': w['hw'], 'w': round(w['w'], 1), 't': 1, 'p': [round(v, 1) for p in w['pts'] for v in p]}); continue
    P, Y = [], []
    for i in range(len(w['nodes'])):
        x, z = w['pts'][i]; y = height.get(w['nodes'][i], 0.0)
        if i:
            px, pz = w['pts'][i - 1]; py = height.get(w['nodes'][i - 1], 0.0)
            L = math.hypot(x - px, z - pz)
            if (py > 0.3 or y > 0.3) and L > 25:
                k = int(L // 20)
                for j in range(1, k + 1):
                    f = j / (k + 1); P += [px + (x - px) * f, pz + (z - pz) * f]; Y.append(py + (y - py) * f)
        P += [x, z]; Y.append(y)
    e = max(Y) > 1.5
    n_el += e
    rec = {'h': w['hw'], 'w': round(w['w'], 1), 'p': [round(v, 1) for v in P]}
    if max(Y) > 0.05: rec['y'] = [round(v, 2) for v in Y]
    if w['oneway']: rec['o'] = 1
    if e and w['name']: rec['n'] = w['name']
    out.append(rec)
json.dump({'deck': DECK, 'grade': GRADE, 'source': 'OpenStreetMap highway bridge/layer/tunnel tags', 'ways': out},
          open('data/kl_roads.json', 'w', encoding='utf8'), separators=(',', ':'), ensure_ascii=False)
names = sorted({w['name'] for w in ways if w.get('H', 0) > 5 and w['name']})
print('wrote data/kl_roads.json:', len(out), 'ways,', n_el, 'elevated,', sum(1 for w in ways if w['tunnel']), 'tunnels')
print('elevated roads:', ', '.join(names[:60]))
