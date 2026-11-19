# lit=* by ward, from the street lamps

`node update.js <ward> [<ward> ...]` or `node update.js all` works out `lit=yes` or `lit=no` for the roads and pathways of City of Ottawa wards from the street lamps mapped in OSM. All the city's ~80k lights are in OSM (only 335 have no OSM lamp within 15 m), plus about 15k more. It needs Node 18+ and no packages.

It writes `<ward>/lit-01.osm`, `-02.osm`, and so on:
- At most 200 ways per file (`--chunk <n>` changes this). Each file is one compact area, numbered roughly north to south.
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
- `lit=no`: they light 20% or less, and the city's [road layer](https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/3) says the road is city-owned and in service (`OWNERSHIP=Public`, `CURRENT_STATUS=Operational`). Private roads, NCC (federal) roads and MTO (provincial) roads have their own lights, which aren't in the city data, so they never get `lit=no`.
  - Neither do new subdivision streets the city hasn't assumed yet (`CURRENT_STATUS=Open to Traffic` or `Commence Work Issued`, about 2,200 city-wide). Their lights still belong to the developer and aren't in the city data. Added 2026-11-19 after ward 3, where 17 new Half Moon Bay streets (Moonrise Terr, Symphony Way, Peachleaf Cres, ...) came out dark with no lamp anywhere near them.

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
- dark private roads and dark new (unassumed) streets
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

## Ward 2, Orléans West-Innes

**Files** (2026-11-18 16:26 UTC): 1,308 ways in 14 files of 93–94. 1,019 get `lit=yes` and 289 get `lit=no`. No existing `lit` tag disagrees, so there's no `fixme=check lit`.

| File | Ways | yes / no | Lamps | Lit things | Main streets |
|---|---|---|---|---|---|
| [2/lit-01.osm](2/lit-01.osm) | 93 | 58 / 35 | 151 | 0 | Jeanne-d'Arc Blvd N, Décarie Dr, Bilberry Dr |
| [2/lit-02.osm](2/lit-02.osm) | 94 | 69 / 25 | 167 | 0 | Voyageur Dr, Ravine Way, Jeanne-d'Arc Blvd N |
| [2/lit-03.osm](2/lit-03.osm) | 93 | 65 / 28 | 180 | 0 | Jeanne-d'Arc Blvd N, Fortune Dr, St-Jérôme Cres |
| [2/lit-04.osm](2/lit-04.osm) | 94 | 77 / 17 | 213 | 0 | Bilberry Dr, Du Bois Ave, St. Jean St |
| [2/lit-05.osm](2/lit-05.osm) | 94 | 65 / 29 | 173 | 0 | Vineyard Dr, Youville Dr, Bordeau Grove |
| [2/lit-06.osm](2/lit-06.osm) | 93 | 75 / 18 | 200 | 0 | Jeanne-d'Arc Blvd S, Forest Valley Dr, Grey Nuns Dr |
| [2/lit-07.osm](2/lit-07.osm) | 94 | 83 / 11 | 203 | 1 | Jeanne-d'Arc Blvd S, St. Joseph Blvd, Henri Lauzon St |
| [2/lit-08.osm](2/lit-08.osm) | 93 | 73 / 20 | 236 | 0 | Sunview Dr, Des Épinettes Ave, Champneuf Dr |
| [2/lit-09.osm](2/lit-09.osm) | 93 | 80 / 13 | 219 | 0 | Beauséjour Dr, Innes Rd, Meadowglen Dr |
| [2/lit-10.osm](2/lit-10.osm) | 94 | 92 / 2 | 273 | 0 | Jeanne-d'Arc Blvd S, Viseneau Dr, Boyer Rd |
| [2/lit-11.osm](2/lit-11.osm) | 93 | 84 / 9 | 278 | 0 | Innes Rd, Jeanne-d'Arc Blvd S, Tooney Dr |
| [2/lit-12.osm](2/lit-12.osm) | 93 | 73 / 20 | 309 | 1 | Blackburn Hamlet Bypass, Innes Rd, Meadowglen Dr |
| [2/lit-13.osm](2/lit-13.osm) | 93 | 41 / 52 | 114 | 0 | Innes Rd, Trail 61, Bearbrook Rd |
| [2/lit-14.osm](2/lit-14.osm) | 94 | 84 / 10 | 351 | 1 | Blackburn Hamlet Bypass, Innes Rd, Bearbrook Rd |

| | Roads | Pathways |
|---|---|---|
| New `lit=yes` | 985 | 34 |
| New `lit=no` | 4 | 285 |
| Already tagged the same | 201 | 37 |
| `fixme=check lit` | 0 | 0 |
| Left alone | 133 | 707 |

**The 4 `lit=no` roads:**
- Hart Road (2 ways), a rural lane.
- Two 2.6 km ways of the Blackburn Hamlet Bypass, with lamps only at the intersections.

**Left alone:**
- 62 dark private roads and 7 federal (NCC) roads.
- Pathways: mostly partly lit (415), short pieces (103 dark ones under 20 m), paths by private roads (67) and in school or similar sites (49).

The `lit=no` pathways are woodland and park trails, nearly all unnamed. The named ones are the Greenbelt Pathway East (3 ways), Trails 61 and 63, and the Green's Creek bridge. `lit-13`, in the Greenbelt by Bearbrook Road, has the most (52). One that's worth a look: [w1341099506](https://osm.org/way/1341099506) (`lit-14`), 42 m around a building and into its parking lot. Lights on the building's walls aren't in the street light data.

## Ward 3, Barrhaven West

**Files** (2026-11-19 04:21 UTC): 1,580 ways in 8 files of 197–198, the first ward at 200 per file. 1,329 get `lit=yes` and 251 get `lit=no`. No existing `lit` tag disagrees, so there's no `fixme=check lit`.

| File | Ways | yes / no | Lamps | Lit things | Main streets |
|---|---|---|---|---|---|
| [3/lit-01.osm](3/lit-01.osm) | 198 | 151 / 47 | 406 | 1 | Cedarview Rd, Fallowfield Rd, Strandherd Dr |
| [3/lit-02.osm](3/lit-02.osm) | 197 | 154 / 43 | 427 | 1 | Jockvale Rd, Greenbank Rd, Larkin Dr |
| [3/lit-03.osm](3/lit-03.osm) | 197 | 178 / 19 | 492 | 0 | Strandherd Dr, Tartan Dr, Chapman Mills Dr |
| [3/lit-04.osm](3/lit-04.osm) | 198 | 183 / 15 | 473 | 0 | Greenbank Rd, Longfields Dr, River Run Ave |
| [3/lit-05.osm](3/lit-05.osm) | 198 | 175 / 23 | 559 | 0 | Borrisokane Rd, Strandherd Dr, Watercolours Way |
| [3/lit-06.osm](3/lit-06.osm) | 197 | 131 / 66 | 257 | 0 | Longfields Dr, Golflinks Dr, Stonebridge Trail |
| [3/lit-07.osm](3/lit-07.osm) | 198 | 186 / 12 | 783 | 0 | River Mist Rd, Grand Canal St, Dundonald Dr |
| [3/lit-08.osm](3/lit-08.osm) | 197 | 171 / 26 | 614 | 0 | Kilbirnie Dr, Greenbank Rd, Longfields Dr |

| | Roads | Pathways |
|---|---|---|
| New `lit=yes` | 1,248 | 81 |
| New `lit=no` | 68 | 183 |
| Already tagged the same | 11 | 39 |
| `fixme=check lit` | 0 | 0 |
| Left alone | 265 | 900 |

**The 68 `lit=no` roads:**
- 24 ways of rural roads with lamps only at the intersections: Prince of Wales Dr (8), Borrisokane Rd (6), Barnsdale Rd (3), Cambrian, Cedarview and Greenbank Rds (2 each), Fallowfield Rd (1).
- 44 country-estate streets west and south of Barrhaven, mostly with one lamp at the corner: the Cedarhill golf course streets (Mission Inn Grove, Southern Hills Crt, Swilken Burn, Glen Oaks Circle, ...), Lytle Ave, Roberta, Leetom, Ettrick and Barrhaven Cres, Townsend Dr, Adele and Amherst Cres, Benlark Rd.

**Left alone:**
- 17 dark streets in new subdivisions the city hasn't assumed (Half Moon Bay, Pumice Pl, Andesite Terr). See the road rule above.
- 40 dark private roads, 206 partly lit roads.
- Pathways: mostly partly lit (537), short pieces (146 dark ones under 20 m), paths by private roads (77) and in school or similar sites (44).

The `lit=no` pathways are almost all unnamed; the only named one is Stonebridge Trail (4 ways). `lit-06`, around Stonebridge and the Jock River, has the most (66 `lit=no` in all).
