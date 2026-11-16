# Parc de la Forêt-Boucher (Gatineau)

Fixes for the trail network in the Boucher forest (Aylmer sector), plus a polygon for the park itself. Both files are JOSM `.osm` files, ready to review and upload, built against OSM data as of 2026-11-15.

| File | Contents |
|---|---|
| `foret-boucher-trails.osm` | Trail geometry and tags: 62 existing ways modified and 3 new; 216 nodes moved, 410 added and 8 deleted |
| `parc-foret-boucher.osm` | New `leisure=park` polygon for Parc de la Forêt-Boucher (123.9 ha) |

## Trails (`foret-boucher-trails.osm`)

### Sources

- **Strava global heatmap**: the main evidence for where trails really run. Max zoom 14 at 2x (about 1.7 m/px), using the all, ride, run, MTB, hike and walk layers.
- **Ville de Gatineau "Pistes cyclables"** (Données Québec, CC-BY): the forest trails are its "Autre" segments. Used as a cross-check; it matches the heat in the east but is up to about 20 m off elsewhere.
- **Official trail map** (Fondation Forêt Boucher, Repère 2022): copyrighted, so nothing was traced from it. Used only to tell which trail is which and to check names, refs and lengths.
- **Fondation website** (fondationforetboucher.ca): bike access, surfaces and accessibility.
- **Tried but not useful**:
  - Esri and Bing imagery: the canopy hides the trails.
  - NRCan HRDEM lidar: too noisy under the trees.
  - OSM GPS traces: only one, private.

### Changes

**Geometry**
- 34 ways were retraced onto the line of strongest Strava heat, with junctions snapped to it.
- A cluster of sketch ways in the east was a shifted copy of the real trails. I moved them onto the real trails and kept their ids.
- Two sketch ways were moved onto faint trails, and 3 new informal paths were added (`highway=path`, `informal=yes`).
- Boardwalks, bridges and closed loops were left as they were.

**Tags**
- `bicycle=yes` on 50 trails. The Fondation allows mountain bikes and fat bikes in the park.
- `wheelchair=yes`:
  - Jaseur, the park's "sentier universel"
  - Oriole
  - Coulicou 411524164, the 320 m from Jaseur to the shelter
- `surface=fine_gravel` on Jaseur, which is stone dust.
- 1579954109 named `Moucherolle`, `ref=8`.
- Piranga renamed from "Piranga - Sentier d'hiver". It already has `seasonal=winter`.

**Not changed**
- Park polygon node 1455059339 stays where it is. The trail that used to end on it now has its own node.

### Notes for the reviewer (`fixme` tags, 13 ways)

Remove each `fixme` once you've decided, or it gets uploaded.

- **No Strava heat (7 ways), may not exist:**
  - 411523464, 718910892, 868484746 and 1118438996 are also missing from the city's data. 1118438996 follows a berm.
  - 411524739 and 723841906 are in the city's data.
  - 1118438994 has a southern part with no heat; its northern part was moved onto a faint trail.
- **Moved onto faint heat (1 way):** 1334380454 was a rough sketch about 30 m away.
- **New paths on faint heat (2 ways):** check they exist.
- **Vireo (3 ways):** the map legend spells it "Vireo" and the website "Viréo". Go with the signs.

### Side effects to check

These connectors aren't in the file, but their end nodes sit on moved junctions, so their ends shift by 2–4 m:
- 572501916 (Faucon)
- 1118439004
- 1334380452 (Passerin)
- 1579954106 (Coulicou)

You'll see them once you download the area.

## Park polygon (`parc-foret-boucher.osm`)

According to the Fondation:
- The Boucher forest is about 700 acres.
- About 55% of it belongs to the Ville de Gatineau; the rest belongs to the Quebec government and private owners.
- The park is the city's 360 acres (about 146 ha).

The existing 406 ha `natural=wood` polygon (way 123608258) is the forest, not the park.

**Geometry:** taken from Gatineau's zoning zone **Pu-13-065** ([Zonage normé](https://www.donneesquebec.ca/recherche/dataset/vgat-zonage-norme-v1), Données Québec, CC-BY), with these edits:
- The zone's bulge around Parc des Jardins-Lavigne is cut off along the zone's straight western edge.
- The road corridors of Boulevard des Allumettières and Rue Samuel-Edey are removed.
- The dog park (way 1118438991) is excluded, with a 0.5 m gap so the outlines don't touch.

Every named trail on the official map falls inside the polygon. The official map has no park boundary drawn on it.

**Tags:**
```
leisure=park
name=Parc de la Forêt-Boucher
operator=Fondation Forêt Boucher
owner=Ville de Gatineau
website=https://fondationforetboucher.ca/parc/
```

The polygon is 123.9 ha, against the 146 ha the Fondation states. The rest is probably public zone Pu-13-066 (24 ha), in the eastern part of the forest. It isn't included because nothing confirms it's part of the park.

## Still to do by hand

- **Retag the forest, way 123608258:**
  - Set `name=Forêt Boucher`.
  - Keep `name:en=Boucher Forest`.
  - Remove `website`, which is now on the park.
- **Bike tags outside the park:** `bicycle=yes` went on every trail inside the forest polygon. The Fondation's permission only covers the park, so check the trails that fall outside the new park polygon.
- **Dog bylaw, not tagged yet:** since 2023, dogs are banned in 95% of the forest. The exceptions are near the dog park and the Samuel-Edey entrance.

## Checking and uploading in JOSM

1. Open the file, then download the area into the **same** layer (untick "Download as new layer"). Your edits are kept, and anything changed on OSM since 2026-11-15 shows up in the Conflict list.
2. To see the old geometry, download the area again as a **new** layer and keep the file layer active. JOSM draws inactive layers in grey.
3. Use `Ctrl+F` `fixme=*` to step through the notes, and `Shift+V` to run the validator.
4. Upload. For a heatmap background, use the "JOSM Strava Heatmap" browser extension.

The analysis scripts were one-off work and aren't in the repo. Strava heatmap data can't be redistributed, so no derived tiles or images are included either.
