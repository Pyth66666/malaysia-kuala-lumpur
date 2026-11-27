# Kuala Lumpur 3D — City Explorer

**Live demo:** https://pyth66666.github.io/malaysia-kuala-lumpur/ (works on phones too)

A 1:1-scale 3D map of Kuala Lumpur city center built from OpenStreetMap data and
playable in the browser: fly or walk the real streets, toggle day/night, teleport
to landmarks, and export the whole city to Blender.

## Quick start

```
npm install
npm start
```

Open **http://localhost:8787** in Chrome or Edge.

For phones on the same Wi-Fi: `node server.js --lan` (prints the LAN URL).
Do not use `python -m http.server` — it serves `.js` as `text/plain` and breaks ES modules.

## Controls

| Input | Action |
|-------|--------|
| Drag mouse / right stick | Look 360° |
| W A S D / left stick | Move |
| Space / C / triggers | Rise / sink (fly mode) |
| Shift / gamepad A | Sprint |
| F / gamepad X | Toggle fly / walk (eye height 1.7 m) |
| N / gamepad Y | Day / night |
| G | Export city as GLB |
| T | Show/hide teleport menu |
| 1–0, -, = | Teleport to 12 places |
| H | Hide/show HUD |
| Click minimap | Enlarge / shrink |

## How it works

1. `pbf_to_scene.py` reads the Geofabrik Malaysia/Singapore/Brunei extract with
   pyosmium, clips a bbox around KLCC and converts to meters (Y-up, origin at the
   Petronas Towers). Polygons come from osmium areas, so multipolygon relations
   work. Output is a compact Float32 binary (`data/kl_scene.bin`, ~21 MB) plus
   `data/kl_scene_meta.json` (array offsets + rail/road center polylines).
2. `index.html` streams the binary with a progress bar, builds three.js meshes
   (vertex-colored buildings, textured facades, instanced cars/lamps/buses/birds),
   and runs the game loop. If the binary is missing it falls back to the legacy
   `data/kl_scene.json`.
3. `server.js` is a small static server with correct MIME types, gzip, ETag
   revalidation, range requests and path-traversal protection.

### Regenerate the scene data

```
pip install osmium
python pbf_to_scene.py
```

Edit `BBOX` in `pbf_to_scene.py` to cover a different area.

Two more generated layers sit on top of the scene:

```
python tools/make_roads3d.py   # data/kl_roads.json: bridges, stacked flyovers, ramps, tunnels
pip install tifffile imagecodecs
python tools/make_terrain.py   # data/kl_terrain.*: bare ground from the Copernicus GLO-30 DEM
```

`make_roads3d.py` reads each highway's OSM `bridge`, `layer` and `tunnel` tags. A deck that
crosses a lower road or railway sits at layer x 6.5 m; heights then spread along the connected
network at a 5.5 % grade, so approach ramps and links between stacked decks climb like the real
ones. The page draws the decks with soffits, parapets, embankments and piers, hides tunnels and
runs traffic on the right level.

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | the whole viewer/game (three.js r160, ES modules) |
| `pbf_to_scene.py` | OSM PBF → binary scene converter |
| `osm_to_scene.py` | legacy Overpass-JSON converter (reference only) |
| `server.js` | static server (`npm start`, `--lan` for phone) |
| `landmarks/` | detailed landmark models (Petronas, KL Tower, Merdeka 118, Dataran Merdeka, Masjid Jamek, Exchange 106) |
| `roads/roads3d.js` | elevated roads, ramps and piers from `data/kl_roads.json` |
| `tools/` | `make_roads3d.py`, `make_terrain.py` |
| `data/kl_scene.bin` | generated triangle data (~21 MB, not in git) |
| `data/kl_scene_meta.json` | generated offsets + polylines (not in git) |
| `data/kl_scene.json` | legacy scene (~66 MB, in git, fallback) |
| `data/*.osm.pbf` | raw OSM extract (253 MB, not in git) |

## Performance

~220 draw calls and ~700k triangles per frame: buildings and roads are batched
into single geometries; cars (body/glass/wheels/lights), street lamps, buses and
birds are InstancedMesh. Collision uses a 3 m rasterized building-footprint grid;
the sun shadow camera follows the player on a texel-snapped grid.

## Blender export

Press **G** → downloads `kuala_lumpur_center.glb` at real-world scale
(1 unit = 1 m). In Blender: File → Import → glTF 2.0.

## Data attribution

Map data © OpenStreetMap contributors, available under the ODbL.
