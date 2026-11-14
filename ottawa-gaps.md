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

## Basketball courts (done 2026-11-14)

- [x] [Ottawa-Basketball-Courts/basketball.osm](Ottawa-Basketball-Courts/basketball.osm): 10 courts, written over the 2017 output.
  - 8 are hoops on summer rink pads, added as `leisure=pitch` + `sport=basketball` inside the rink, the way Ottawa maps the others: Optimiste ×2, Heatherington ×2, Eugène Martineau ×2, Alfred Taylor, Dunrobin.
  - 2 are standalone courts visible in imagery: Kilreen Park (`hoops=2`, a full court even though the city says "key") and Barry Mullen Park.
  - `hoops` comes from the city's court type: full = 2, half or key = 1, none for small or non-standard courts.
- Not written:
  - 3 courts are already in OSM 47–78 m from the city point: Laroche, Westcliffe and Reid parks.
  - 11 showed no court in imagery and are listed in `CHECKED` in [update.js](Ottawa-Basketball-Courts/update.js).
- 5 courts from the 2017 import (`ref` 26036, 26167, 35185, 26212, 3728) are no longer in the city data. They may have been removed; check them in the field.

## Outdoor rinks (done 2026-11-14)

- [x] [Ottawa-rinks/outdoor-rinks.osm](Ottawa-rinks/outdoor-rinks.osm): 20 rinks, written over the 2018 output.
  - **9 puddles:** unboarded flooded patches that summer imagery can't confirm, written as the city has them.
  - **10 rinks with boards or a refrigerated surface:**
    - Canterbury Park (refrigerated)
    - Centennial Park in Manotick (its pad is mapped only as two basketball courts)
    - Cattail Creek, Laroche, Glebe Memorial, Riverain, Richmond Lions, Lyndon Hooper, Bradley-Craig and Roland Ashman
  - **Brewer Park oval:** the city now lists it separately from the rink. The existing node has `ice_rink:type=rink_with_puddle_and_oval`.
  - Tags copy the 2018 import, including `operator=Community` for rinks maintained by the community (19 of the 20).
- Not written, 5 rinks the OSM rink of the same park 75–154 m away probably is: Nimiq, Water Dragon, Guinness, Babe McRae (an untagged rink area, w1316373217), Harkness. At Harkness, imagery shows a boarded rink at the city point, not at the OSM node.
- [ ] **31 rinks from the 2018 import whose park has no open city rink anymore.** 26 parks dropped out of the city's list since 2018 and 7 records are marked closed, among them Clarke Fields, Lincoln Heights, Butterfly, Paget and the Glebe Community Centre rink. `node update.js` lists them. These are candidates to delete or mark disused, so check before removing; community rinks come and go.

## Tennis courts (file ready)

- [ ] [Ottawa-tennis-outdoor/tennis-outdoor.osm](Ottawa-tennis-outdoor/tennis-outdoor.osm): 2 sites, written over the 2018 output. The city has 132 sites and 128 are already in OSM.
  - **Medhurst Park practice ball wall:** a node with `tennis:backwall=yes`. It sits on the paved pad that OSM maps as a basketball court; you could add `tennis` to that pad's `sport` instead.
  - **Rideau High School, 4 courts:** imagery shows cracked pavement with weeds and no nets. The school closed in 2017, so these may be disused.
  - Tags follow the 2018 import, minus `source` and its placeholder operators ("Private Club", "School Board"). The `addr:street` value is taken from the matching OSM street nearby, because the city writes "St. Laurent" and OSM has "St-Laurent".
- Not written:
  - Bingham Park is mapped 65 m away.
  - Ottawa Athletic Club is mapped 65 m away as one pitch with `courts=1`, but the city says 6 outdoor courts. Worth checking.

## Pickleball courts (file ready)

- [ ] [Ottawa-pickleball/pickleball.osm](Ottawa-pickleball/pickleball.osm): 54 sites, 112 courts. The city has 86 outdoor sites; 32 are already in OSM.
  - **What they are:** 47 sites with lines on tennis courts, 3 on rink pads, 1 on a basketball court, and Parade Drive (2 dedicated courts plus lines on a tennis court).
  - **How they're mapped:** Ottawa draws each pickleball court as its own `leisure=pitch` + `sport=pickleball` over the court it's painted on, and has 101 such courts. Nothing uses `sport=tennis;pickleball`. So each site is one node with `courts=N` and a description of what it's painted on, to redraw as courts if you want.
  - **Tags:** follow the existing pickleball courts: `outdoor`, `seasonal`, `surface`, `lit`, `access` and `wheelchair` from the city data.
  - **Sweetvalley Drive (2 nodes):** these are city records added in September 2025 with no details. OSM has a court at the spot tagged `sport=tennis`. If it's really a pickleball court, change that court's `sport` and drop the 2 nodes.
- Indoor courts (17, in gyms) are left out.

## Splash pads (file ready)

- [ ] [Ottawa-splash-pads/splashpads.osm](Ottawa-splash-pads/splashpads.osm): 14 splash pads, written over the 2022 output. The city has 153 open; 139 are already in OSM.
  - **Which ones:** 11 new in 2024–2025: Atrium, Barnabé, Barrett Farm, Bert Dowler, Bradley-Craig, Cobble Hill, Lyndon Hooper, Maize, Mantha, Miikana and Dundonald. Plus Citiplace, Parkway and the Carp Water Splash Park at the Huntley Community Centre.
  - **Tagging:** nodes with `leisure=playground` + `playground=splash_pad`, named "Splash Pad - <park>" like the 2022 import.
  - **Pads already drawn as playgrounds:** 11 of the points sit in an OSM playground area. At Citiplace, Miikana and Atrium, imagery shows that area is the concrete pad itself, drawn without `playground=splash_pad`. Tag the area and drop the node. The console lists the area for each.
  - **Cobble Hill:** the pad is the bare concrete shape about 20 m south of the point.
- [ ] **Closed splash pads:** 8 pads from the 2022 import are now closed in the city data: Whitehaven / George C. Brown, Walter Baker, Cyrville, Big Bird, Whiterock, Lawson, Boothfield and Kaladar. Tierney Park is gone from the city data altogether. These may be decommissioned or under renovation; check before removing them.

## Boat launches (file ready)

- [ ] [Ottawa-boat-launches/boat-launches.osm](Ottawa-boat-launches/boat-launches.osm): 11 launches. The city has 28 (it lists Roslyn and Dick Bell twice), and 17 are already in OSM as slipways or piers. The first scan said 18 were missing because it only looked for slipways.
  - **Canoe launches (7):** `waterway=access_point` + `canoe=yes` + `trailer=no`, the most common combination worldwide. JOSM doesn't know `canoe=put_in`, which the 3 older Ottawa put-ins use.
    - Claudette Cain, Honey Gables, Springhurst, Jock River Landing, Barney McCarney Landing, and 2 at David Barlett Park
  - **Docks (3):** a `waterway=access_point` node each. The wiki says `man_made=pier` is for ways and areas only, not nodes. Draw the pier as a way (`floating=yes` if it floats, `surface=wood`) and put the node on its end.
    - Pinhey's Point: the T-shaped dock in imagery is about 15 m from the point.
    - Tighe Street and Bordeleau
  - **How to place them:** put each node on the water's edge, joined to the water area's outline. Connect the path or road that leads to it.
    - At Roslyn, end the `highway=service` at the slipway node. `service=slipway` on the road is optional. Don't tag the road itself `leisure=slipway` as well, or the map shows two icons.
  - **Boat ramp (1):** Roslyn Park, as `leisure=slipway`.
  - Every point is on the shoreline in imagery. Names are left off; the city's names are mostly "<park> Canoe Launch".

## Small leftovers: spot-check before building

Counts this small tend to be mostly mismatches rather than real gaps (the Ottawa bike-lane leftovers were), so check a few in imagery first.

| | City layer | City | Missing |
|---|---|---|---|
| [ ] Play structures | Parks_Inventory/15 | 1,719 | 43 |
| [ ] Ball diamonds | Parks_Inventory/1, /2 | 355 | 39 |
| [ ] Sledding hills | Parks_Inventory/17 | 75 | 22 |
| [ ] Community gardens | Community_Gardens/0 | 83 | 18 |
| [ ] Winter-maintained bike racks | Parking/9 | 87 | 18 |
| [ ] Sports fields | Parks_Inventory/19, /20 | 645 | 14 |
| [ ] Skateparks | Parks_Inventory/16 | 32 | 7 |

## Nothing to do

These layers are already fully or almost fully in OSM:
- volleyball courts (37 of 39)
- wading pools (52 of 53)
- outdoor pools (11 of 11)
- park parking lots (404 of 409, checked 2026-11-14). The first scan said 19 were missing, but most are mapped as multipolygons, many with the city's `ref`. Of the 5 left:
  - Barnett Park is mapped 55 m away.
  - Reid Park, Ottawa South Community Centre and Sindy Hooper show no lot in imagery.
  - François Dupuis has no position.
- public toilets (the 60 park portables were uploaded on 2026-11-14)
- water fountains, bike repair stations, sidewalks and pathway links (updated on 2026-11-13)
- winter-maintained cycling network (12,600 Ottawa ways already have `winter_service`)

## Not checked yet

- Street lights ([Road_Information/7](https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/7), 80,670 points). They were last looked at in 2019 ([Ottawa-street-lights](Ottawa-street-lights/)).
