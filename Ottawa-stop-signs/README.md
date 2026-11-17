# Stop and yield signs by ward

`node update.js <ward>` compares the city's [Intersections](https://maps.ottawa.ca/arcgis/rest/services/Intersections/MapServer/0) layer with current OSM for one ward. It needs Node 18+ and no packages.

It writes `<ward>/stop-signs-01.osm`, `-02.osm`, and so on:
- At most 50 signs per file (`--chunk <n>` changes this), each file one compact area, numbered roughly north to south.
- Signs on the same road, or at the same intersection, always share a file, because a way can be modified in only one file.
- A rerun reads fresh OSM, so anything already uploaded is taken into account, and the old files are replaced.

Traffic signals aren't mapped.

## Reviewing in JOSM

Every sign the files add, change or want deleted has two tags:
- `fixme`: a short note, e.g. `new stop sign (city: two-way stop)`, `delete? (city: two-way stop, this road doesn't stop)`, `not all-way? (city: two-way stop)`.
- `fixme_sv`: a Google Street View link, from about 12 m behind the sign looking toward the junction. For a sign on the junction node, it's from the junction.

To work through a file:
1. Search `fixme=* modified` and add the selection to the TODO list plugin.
2. Delete `fixme` and `fixme_sv` on each sign once you've checked it.
3. Search `fixme_sv=*` before uploading, so none get uploaded by mistake.

To have JOSM block the upload instead, add [review.validator.mapcss](review.validator.mapcss) in Preferences > Data Validator > Tag checker rules. Any `fixme_sv`, or a `fixme` on a stop or yield sign, then shows up as an error in the check before upload. `fixme_sv` has a one-click fix that removes it.

## How the signs are placed

The city gives one point per intersection with a control type (`STOP`, `4STOP`, `YIELD`, `TRAFFICSIG`, ...). It doesn't say which approaches have the signs, so the script works that out from OSM.

**All-way stop:** one `highway=stop` + `stop=all` on the junction node, the Ottawa convention.
- If every approach already has its own sign, those signs are kept and only their tags are fixed.
- If only some approaches have one, the junction node gets the stop and those signs get `delete?`.

**Two-way stop or yield:** every approach except the through road gets the sign. The through road is the pair of legs that:
1. Runs nearly straight (165° or more). This wins even when the street name turns the corner, as at Chatham Gdn / Kenmare Pl. Checked against Barrhaven's signed T-junctions, this matches the existing sign in 837 of 841.
2. Failing that, keeps its name through the junction, or runs roughly straight (135° or more).
3. Failing that, has the higher road class.

Existing signs settle the harder cases:
- **Name and straightness disagree:** an existing sign settles it.
- **Two equal roads cross:** an existing sign settles it. With no sign to go by, the longer street is taken as the through road and the note ends with "guess which road stops".

**New two-way stops and yields** are separate nodes on the approach, 10 m before the junction (3 m behind a crosswalk if there is one), with `direction=forward/backward`.

**Existing signs** are changed but never deleted:
- A stop where the city has a yield (or the reverse) is retagged.
- `stop=all` is added or removed.
- A sign whose `direction` points at a junction far away is flipped.
- A sign on the through road, or a stop at traffic signals, gets `delete?`.
- A junction-node all-way stop where the city has a two-way stop gets `not all-way?`. This applies only to files made before 2026-11-16 05:00 UTC (wards 1–3).

From ward 4 on, when OSM already has an all-way stop (a stop on the junction node, or on every approach) and the city has a two-way stop or yield, the intersection is left alone. The city layer misses many all-way stops: Des Épinettes / Silver Bark has been all-way for over 10 years and the city still has it as `STOP`.

Left alone, and only listed in the console:
- intersections with no OSM junction within 30 m that carries the city's road names
- approaches shorter than 8 m
- yield signs tagged on a junction node

## Ward 3, Barrhaven West

**`stop-signs-01.osm` uploaded** on 2026-11-16 (changeset 192012354). The files were then rebuilt from OSM including that upload. Some intersections from it come up again: wherever a note was kept, such as the "not all-way?" junctions on Fable, Larkin and Malvern.

**Current files** (2026-11-16): 286 items in 6 files of 46–49:

| File | Signs | Main streets |
|---|---|---|
| [3/stop-signs-01.osm](3/stop-signs-01.osm) | 48 | Aura Ave, Larkin Dr, Apolune St |
| [3/stop-signs-02.osm](3/stop-signs-02.osm) | 48 | Point Prim Cres, Chapman Mills Dr, Wessex Rd |
| [3/stop-signs-03.osm](3/stop-signs-03.osm) | 48 | Jockvale Rd, Fieldberry Priv, Rhyolite Way |
| [3/stop-signs-04.osm](3/stop-signs-04.osm) | 47 | Watercolours Way, Travertine Way, Parallax Priv |
| [3/stop-signs-05.osm](3/stop-signs-05.osm) | 49 | Fameflower St, Alex Polowin Ave, Rye Grass Way |
| [3/stop-signs-06.osm](3/stop-signs-06.osm) | 46 | Alex Polowin Ave, Barnsdale Rd, Lynn Coulter St |

| Note | Count |
|---|---|
| new stop sign | 224 |
| new yield sign | 18 |
| new all-way stop | 4 |
| delete? | 13 |
| not all-way? | 11 |
| stop changed to yield | 7 |
| yield changed to stop | 1 |
| stop=all removed | 5 |
| direction flipped | 3 |

Not in the files:
- **16 intersections with no matching junction:**
  - **Chapman Mills Drive (divided):** Verulam, Riocan, Jockvale, Damson Gardens Grove
  - **Loops meeting themselves:** Cobble Hill, Madrid, River Rock, Tartan
  - **Other:**
    - Opal Lane at Strandherd
    - Soldats Riendeau at Sundragon
    - Damselfly at River Mist
    - the Urbancrest and Bismite private roads
    - an unnamed yield
    - a mid-block signal on Strandherd
  - **Cortado Way:** not in OSM at all
- **Traffic signals:** in Barrhaven, every signalised intersection already has a signal node.

## Ward 1, Orléans East-Cumberland

**Files** (2026-11-16): 239 items in 5 files of 46–49:

| File | Signs | Main streets |
|---|---|---|
| [1/stop-signs-01.osm](1/stop-signs-01.osm) | 49 | Cameron St, Gauthier St, Fieldown St |
| [1/stop-signs-02.osm](1/stop-signs-02.osm) | 48 | Jeanne D'Arc Blvd, Prestone Dr, Second St |
| [1/stop-signs-03.osm](1/stop-signs-03.osm) | 46 | Charlemagne Blvd, Jeanne D'Arc Blvd N, Trim Rd |
| [1/stop-signs-04.osm](1/stop-signs-04.osm) | 49 | Portobello Blvd, Cap-Diamant Way, Saintonge |
| [1/stop-signs-05.osm](1/stop-signs-05.osm) | 47 | Prestwick Dr, Payette Dr, Duford Dr |

| Note | Count |
|---|---|
| new stop sign | 69 |
| new yield sign | 30 |
| new all-way stop | 4 |
| yield changed to stop | 38 |
| delete? | 33 |
| not all-way? | 20 |
| stop=all added | 20 |
| stop=all removed | 13 |
| stop changed to yield | 10 |
| direction flipped | 2 |

Most of the ward is already mapped, so about 60% of the items are disagreements with existing signs, not new signs:
- **22 of the 28 through-road `delete?` notes** are on `stop=all` signs mapped on each approach in March 2026. OSM has those intersections as all-way stops, while the city lists them as two-way.
- **Most of the 38 "yield changed to stop"** are yields mapped in 2019 where the city has a stop.

Not in the files: 20 intersections with no matching junction, mostly around the Regional Road 174 ramps, South Frontage and Inlet Private, plus two loops of Wilhaven Dr.

## Ward 2, Orléans West-Innes

**Files** (2026-11-16): 148 items in 3 files of 49–50:

| File | Signs | Main streets |
|---|---|---|
| [2/stop-signs-01.osm](2/stop-signs-01.osm) | 50 | Belcourt Blvd, Des Epinettes Ave, D'Orleans Blvd |
| [2/stop-signs-02.osm](2/stop-signs-02.osm) | 49 | St. Andre Dr, Glen Park Dr, Ridgeburn Gt |
| [2/stop-signs-03.osm](2/stop-signs-03.osm) | 49 | Beausejour Dr, Ashmont St, Meadowglen Dr |

| Note | Count |
|---|---|
| new stop sign | 56 |
| new yield sign | 2 |
| new all-way stop | 4 |
| delete? | 35 |
| not all-way? | 24 |
| stop=all removed | 14 |
| yield changed to stop | 11 |
| stop changed to yield | 2 |

As in ward 1, most items are disagreements with existing signs:
- **22 of the through-road `delete?` notes** are on `stop=all` signs mapped on each approach in March 2026.
- **21 of the 24 "not all-way?"** are junction-node all-way stops from a December 2023 edit sourced from Bing imagery.

Not in the files: 18 intersections with no matching junction, mostly Regional Road 174 ramps, the Transitway, mid-block signals, and roads that meet themselves (Innes, Orleans Blvd, St. Andre, Loranger, Midsummer).

## Ward 4, Kanata North

**Files** (2026-11-16): 82 items in 2 files. This is the first ward run with the all-way rule: 9 intersections where OSM has an all-way stop and the city a two-way stop were left alone.

| File | Signs | Main streets |
|---|---|---|
| [4/stop-signs-01.osm](4/stop-signs-01.osm) | 41 | Catherwood Crt, Selwyn Cres, Teron Rd |
| [4/stop-signs-02.osm](4/stop-signs-02.osm) | 41 | Arkose St, Upper Canada St, Natare Pl |

| Note | Count |
|---|---|
| new stop sign | 52 |
| new yield sign | 16 |
| yield changed to stop | 5 |
| stop changed to yield | 4 |
| direction flipped | 3 |
| delete? | 2 |

Not in the files: 16 intersections with no matching junction, mostly the Transitway, Highway 417 ramps, a proposed road (Farrar) and private roads.
