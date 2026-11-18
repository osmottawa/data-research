# lit=* by ward, from the street lamps

`node update.js <ward> [<ward> ...]` or `node update.js all` works out `lit=yes` or `lit=no` for the roads and pathways of City of Ottawa wards from the street lamps mapped in OSM. All the city's ~80k lights are in OSM (only 335 have no OSM lamp within 15 m), plus about 15k more. It needs Node 18+ and no packages.

It writes `<ward>/lit-01.osm`, `-02.osm`, and so on:
- At most 100 ways per file (`--chunk <n>` changes this). Each file is one compact area, numbered roughly north to south.
- A way belongs to the ward its midpoint is in, so every way is in exactly one file.
- A rerun reads fresh OSM, so anything already uploaded is skipped, and the old files are replaced.
- Each file also holds, unchanged, the street lamps the decisions looked at (within 30 m of a way in the file), and the things tagged `lit` (pitches, rinks, parking lots) checked for its `lit=no` paths. They're there to check the result against. Unchanged objects don't upload; search `modified` to select only the changed ways.

**Ways:** `trunk` to `residential`, `living_street` and `busway` (and links); `cycleway`, `footway`, `path`, `pedestrian` and `bridleway`.
**Left out:** motorways and their links, sidewalks, crossings, traffic islands, service roads, steps, tracks, and areas.

## Reviewing in JOSM

Most ways had no `lit` tag and just get one.

A way whose existing `lit` disagrees gets the computed value plus `fixme=check lit`. `lit=no` and `lit=disused` count as no; any other value (`yes`, `limited`, `automatic`, ...) counts as yes. If the way already had a `fixme`, `; check lit` is added to it.
- The old value is in the way's history (Ctrl+H).
- To find these ways, search `fixme="check lit"` and add them to the TODO list plugin.
- Remove the `fixme` once you've checked a way.
- To have JOSM block the upload while one is left, add [review.validator.mapcss](review.validator.mapcss) in Preferences > Data Validator > Tag checker rules.

## How a way is decided

The way is sampled every 5 m, and each sample is checked for a lamp nearby. A lamp counts for a way only if it stands close to it, so a lamp on the next street doesn't light a path behind the houses.

**Roads**
- `lit=yes`: lamps light 60% or more of it. A lamp counts if it stands within 30 m of the centreline and lights samples within 30 m.
- `lit=no`: they light 20% or less, and the city's [road layer](https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/3) says the road is city-owned (`OWNERSHIP=Public`). Private roads, NCC (federal) roads and MTO (provincial) roads have their own lights, which aren't in the city data, so they never get `lit=no`.

**Pathways**
- `lit=yes`, either of:
  - Lamps standing on the path (within 4 m) light 60% of it, and lamps within 12 m light 70% of it.
  - The path is 30 m or longer, and lamps within 12 m light 80% of it. This is a path beside a lit street.
- `lit=no`, all of:
  - No more than 10% of it is within 30 m of any lamp.
  - It's at least 20 m long.
  - It isn't a tunnel, covered or indoor.
  - It isn't inside a school, campus, hospital, mall, commercial, retail, industrial, railway or military site. These light their own grounds.
  - It isn't mostly within 40 m of a private road (condo and townhouse complexes), 25 m of a parking aisle or 15 m of a parking lot.
  - It isn't mostly within 25 m of something OSM already tags `lit` (a pitch, rink, parking lot or shelter). Those lights aren't in the street light data.

**Everything in between is left alone** and counted in the console:
- partly lit ways, such as rural roads with a lamp at each intersection, or park paths that pass a street lamp at one end
- dark private roads
- short path pieces

### Checked against the existing tags

About 10k Ottawa roads and pathways already had a `lit` tag. The thresholds above were tuned on them.

| | Agree | Disagree | Left alone |
|---|---|---|---|
| Roads (no motorways) | 6,404 | 79 (98.8%) | 194 |
| Pathways | 2,026 | 64 (96.9%) | 1,630 |

The street lights overlay on maps.bikeottawa.ca (`pipeline/lamps.mjs`) counts a way as lit when a lamp is within 22 m of half of it. It scores 94.7% on roads and 85.8% on pathways. It decides every way, though, so the comparison isn't exact.

Its two main kinds of error:
- **Roads called dark that aren't:** 312 of them. 22 m doesn't reach across arterials, and private roads have their own lights.
- **Pathways:** for a path, "a lamp somewhere within 22 m" isn't enough. A path 15 m behind a lit street is usually tagged `lit=no`. A dark path in a condo complex, school ground or parking lot is usually lit by private lights.

The disagreements that are left mostly look like judgment calls when drawn on imagery:
- a 10–30 m piece of an unlit pathway passing a street lamp
- a lamp at the end of a short park connector
- a path lit by the lights of a building or a condo

Only 5 of the 121 `lit=no` tags where lamps say yes were older than the newest lamp, so they aren't mostly out of date.

## Ward 1, Orléans East-Cumberland

**Files** (2026-11-18 04:03 UTC): 1,148 ways in 12 files of 95–96. 928 get `lit=yes` and 220 get `lit=no`. About 190 of the ward's ways had already been tagged in OSM since the first run, and are skipped.

| File | Ways | yes / no | Lamps | Lit things | Main streets |
|---|---|---|---|---|---|
| [1/lit-01.osm](1/lit-01.osm) | 95 | 28 / 67 | 167 | 0 | Wilhaven Dr, Old Montréal Rd, Cox Country Rd |
| [1/lit-02.osm](1/lit-02.osm) | 95 | 50 / 45 | 162 | 0 | St. Joseph Blvd, Jeanne-d'Arc Blvd N, Tweddle Rd |
| [1/lit-03.osm](1/lit-03.osm) | 96 | 93 / 3 | 279 | 0 | Trim Rd, Regional Road 174, Talcy Cres |
| [1/lit-04.osm](1/lit-04.osm) | 96 | 84 / 12 | 286 | 3 | Old Montréal Rd, Regional Road 174, Baie-des-Castors St |
| [1/lit-05.osm](1/lit-05.osm) | 96 | 60 / 36 | 188 | 5 | Duford Dr, Lacroix Ave, Bonneville Cres |
| [1/lit-06.osm](1/lit-06.osm) | 96 | 90 / 6 | 266 | 1 | Place-d'Orléans Dr, Prestone Dr, Delia Cres |
| [1/lit-07.osm](1/lit-07.osm) | 96 | 87 / 9 | 256 | 1 | St. Joseph Blvd, Princess Louise Dr, Turner Cres |
| [1/lit-08.osm](1/lit-08.osm) | 95 | 88 / 7 | 304 | 3 | Apollo Way, Tompkins Ave, Charlemagne Blvd |
| [1/lit-09.osm](1/lit-09.osm) | 96 | 93 / 3 | 304 | 0 | Charlemagne Blvd, Gardenway Dr, Taché Way |
| [1/lit-10.osm](1/lit-10.osm) | 96 | 95 / 1 | 384 | 0 | Portobello Blvd, Innes Rd, Valin St |
| [1/lit-11.osm](1/lit-11.osm) | 95 | 80 / 15 | 294 | 0 | Innes Rd, Valin St, Trail Side Circle |
| [1/lit-12.osm](1/lit-12.osm) | 96 | 80 / 16 | 235 | 1 | Prestwick Dr, Tenth Line Rd, Prairies Ave |

| | Roads | Pathways |
|---|---|---|
| New `lit=yes` | 875 | 49 |
| New `lit=no` | 50 | 169 |
| Already tagged the same | 381 | 126 |
| `fixme=check lit` | 0 | 5 |
| Left alone | 165 | 787 |

**`fixme=check lit`** (5):
- **[w243700739](https://osm.org/way/243700739) and [w243700738](https://osm.org/way/243700738)** (`lit-11`), no → yes: walkways with 3–4 lamps standing right on them, which look like pathway lights.
- **[w618811733](https://osm.org/way/618811733)** (`lit-04`) and **[w775440524](https://osm.org/way/775440524)** (`lit-10`), no → yes: 20–33 m pieces of a pathway crossing a lit road's right-of-way.
- **Cardinal Creek Trail, [w657416029](https://osm.org/way/657416029)** (`lit-10`), yes → no: a park trail with no lamp within 30 m and nothing tagged lit nearby.

The `lit=no` roads are rural and country-estate streets with a lamp only at the intersections: Cox Country Rd, Wilhaven Dr, Meadow Lane Rd, Quigley Hill Rd, Sequoia Dr, Jules-Léger Dr. Most of the pathways left alone are partly lit (356): park paths that pass a street lamp at one end.
