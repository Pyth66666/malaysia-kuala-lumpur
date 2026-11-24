# Kuala Lumpur 3D — City Explorer

A 1:1-scale, real-data 3D map of KL city center built from OpenStreetMap,
playable in the browser like a game.

## Run it

```
cd kl3d
node server.js
```

Then open **http://localhost:8787** in Chrome/Edge.
(Do NOT use `python -m http.server` — it serves .js as text/plain and breaks module loading.)

## Controls

| Key | Action |
|-----|--------|
| Mouse click | Lock mouse look (ESC to release) |
| W A S D | Move |
| Space / C | Rise / sink (fly mode) |
| Shift | Sprint (3x speed) |
| F | Toggle fly / walk (walk = eye height 1.7 m) |
| G | Export the city as GLB for Blender |

## What's inside

- `data/malaysia-singapore-brunei.osm.pbf` — raw OpenStreetMap extract (253 MB, Geofabrik)
- `data/kl_scene.json` — KL city center clipped to ~4.4 km × 4.7 km, 288k triangles:
  166k building tris (real heights from `height`/`building:levels` tags), 117k road tris,
  water + parks. Origin at Petronas Towers, units in meters, Y-up.
- `pbf_to_scene.py` — pyosmium converter (PBF → scene JSON). Edit `BBOX` to change area.
- `index.html` — three.js game viewer (fly/walk, fog, GLB export via GLTFExporter).
- `osm_to_scene.py` — alternative Overpass-JSON converter (kept for reference).

## Blender export

Press **G** in the viewer → downloads `kuala_lumpur_center.glb`.
In Blender: File → Import → glTF 2.0. The city arrives at real-world scale
(1 unit = 1 meter), grouped into `buildings / roads / water / green` materials.

## Expanding the map

Change `BBOX` in `pbf_to_scene.py` (lat/lon bounds), then:
```
python pbf_to_scene.py
```
Reload the browser. Greater KL (~15 km) works; expect a much larger JSON
and slower load.
