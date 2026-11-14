# Ottawa open data vs OSM: what's left

Checked on 2026-11-14 against live OSM. These are the city's point layers from [Parks_Inventory](https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer), [Parking](https://maps.ottawa.ca/arcgis/rest/services/Parking/MapServer) and [Community_Gardens](https://maps.ottawa.ca/arcgis/rest/services/Community_Gardens/MapServer). "Missing" means no matching OSM object nearby, so the numbers are a rough guide until each layer gets its own `update.js`.

## Waiting for upload

- [ ] [Ottawa-Cycling](Ottawa-Cycling/): `paved-shoulders.osm`, `new-paths.osm`, `path-access.osm`
- [ ] [Gatineau-cycling](Gatineau-cycling/): `on-road.osm` (2-way fix for Rue des Cerisiers and Rue Wright)

## Benches (done 2026-11-14)

[Ottawa-benches/update.js](Ottawa-benches/update.js) found 891 park benches, bleachers and picnic tables in the city's inventory that aren't in OSM. Almost all were added to the inventory in 2020–2022, after the 2020 import. The script splits them into files of fewer than 100, one compact area each; a park's benches always stay in the same file.

- [x] `new-benches-01.osm`: 91 in Kanata South, Stittsville, Rideau-Jock (Meynell Park, Cardelrec Recreation Complex, Monahan Drain)
- [x] `new-benches-02.osm`: 90 in Bay, College, Kanata North (Britannia Park, Cattail Creek Park, Lynwood Park)
- [x] `new-benches-03.osm`: 88 in Barrhaven West, Barrhaven East, Knoxdale-Merivale (Minto Recreation Complex Barrhaven, Claudette Cain Park)
- [x] `new-benches-04.osm`: 88 in River, Bay, College (McKellar Park, Bob Mitchell Park, Bellevue Manor Park)
- [x] `new-benches-05.osm`: 89 in Kitchissippi, Somerset, Bay (Byron Linear Tramway Park 23, Dundonald Park 12)
- [x] `new-benches-06.osm`: 89 in Osgoode, Riverside South-Findlay Creek, Rideau-Jock (Josie Anselmo Memorial Park, Manotick Remembrance Park)
- [x] `new-benches-07.osm`: 90 in Alta Vista, Capital, River (McCarthy Park, Calzavara Family Park, Arnott Park)
- [x] `new-benches-08.osm`: 89 in Rideau-Rockcliffe, Rideau-Vanier, Beacon Hill-Cyrville (Lindenlea Park, Manor Park)
- [x] `new-benches-09.osm`: 88 in Orléans West-Innes, Beacon Hill-Cyrville, Orléans South-Navan (Chapel Hill Park, Longleaf Park)
- [x] `new-benches-10.osm`: 89 in Orléans East-Cumberland, Orléans West-Innes, Orléans South-Navan (Wilfred Murray Park, Big Bird Park)

Tags follow the 2020 import, without `source`:

| City type | Tags |
|---|---|
| Benches | `amenity=bench` and `backrest=yes` |
| Players' benches | `backrest=no` |
| Commemorative benches | `memorial=bench`, plus `inscription` from the plaque text |
| Bleachers | `leisure=bleachers` |
| Tables | `leisure=picnic_table` |

`start_date` comes from the city's install year. 54 of the benches have 1991, which looks like a default year rather than a real install date.

Things for the console, not the files:
- 47 city benches have an unmatched OSM bench 15–30 m away, which may be the same bench drawn off.
- 50 benches from the 2020 import aren't in the city inventory anymore; they may have been removed or moved.
- The 10 "Transfer Bench" records are skipped. They're sandbox transfer stations at playgrounds.

## Basketball courts (file ready)

- [ ] [Ottawa-Basketball-Courts/basketball.osm](Ottawa-Basketball-Courts/basketball.osm): 10 courts, written over the 2017 output.
  - 8 are hoops on summer rink pads, added as `leisure=pitch` + `sport=basketball` inside the rink, the way Ottawa maps the others: Optimiste ×2, Heatherington ×2, Eugène Martineau ×2, Alfred Taylor, Dunrobin.
  - 2 are standalone courts visible in imagery: Kilreen Park (`hoops=2`, a full court even though the city says "key") and Barry Mullen Park.
  - `hoops` comes from the city's court type: full = 2, half or key = 1, none for small or non-standard courts.
- Not written:
  - 3 courts are already in OSM 47–78 m from the city point: Laroche, Westcliffe and Reid parks.
  - 11 showed no court in imagery and are listed in `CHECKED` in [update.js](Ottawa-Basketball-Courts/update.js).
- 5 courts from the 2017 import (`ref` 26036, 26167, 35185, 26212, 3728) are no longer in the city data. They may have been removed; check them in the field.

## Next

- [ ] **Pickleball** (Parks_Inventory/27): 47 outdoor tennis courts have pickleball lines that OSM doesn't record. Add `pickleball` to `sport` on the existing courts. About 13 more have no court nearby in OSM. The 17 indoor courts in gyms are skipped.

## Small leftovers: spot-check before building

Counts this small tend to be mostly mismatches rather than real gaps (the Ottawa bike-lane leftovers were), so check a few in imagery first.

| | City layer | City | Missing |
|---|---|---|---|
| [ ] Play structures | Parks_Inventory/15 | 1,719 | 43 |
| [ ] Ball diamonds | Parks_Inventory/1, /2 | 355 | 39 |
| [ ] Outdoor rinks | Parks_Inventory/13 | 270 | 26 |
| [ ] Sledding hills | Parks_Inventory/17 | 75 | 22 |
| [ ] Park parking lots | Parks_Inventory/14 | 409 | 19 |
| [ ] Boat launches | Parks_Inventory/4 | 30 | 18 |
| [ ] Community gardens | Community_Gardens/0 | 83 | 18 |
| [ ] Winter-maintained bike racks | Parking/9 | 87 | 18 |
| [ ] Sports fields | Parks_Inventory/19, /20 | 645 | 14 |
| [ ] Splash pads | Parks_Inventory/18 | 161 | 14 |
| [ ] Tennis courts | Parks_Inventory/21 | 132 | 9 |
| [ ] Skateparks | Parks_Inventory/16 | 32 | 7 |

## Nothing to do

These layers are already fully or almost fully in OSM:
- volleyball courts (37 of 39)
- wading pools (52 of 53)
- outdoor pools (11 of 11)
- public toilets (the 60 park portables were uploaded on 2026-11-14)
- water fountains, bike repair stations, sidewalks and pathway links (updated on 2026-11-13)
- winter-maintained cycling network (12,600 Ottawa ways already have `winter_service`)

## Not checked yet

- Street lights ([Road_Information/7](https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/7), 80,670 points). They were last looked at in 2019 ([Ottawa-street-lights](Ottawa-street-lights/)).
