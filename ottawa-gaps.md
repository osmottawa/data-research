# Ottawa open data vs OSM: what's left

Checked on 2026-11-14 against live OSM. These are the city's point layers from [Parks_Inventory](https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer), [Parking](https://maps.ottawa.ca/arcgis/rest/services/Parking/MapServer) and [Community_Gardens](https://maps.ottawa.ca/arcgis/rest/services/Community_Gardens/MapServer). "Missing" means no matching OSM object nearby, so the numbers are a rough guide until each layer gets its own `update.js`.

## Waiting for upload

- [ ] [Ottawa-Cycling](Ottawa-Cycling/): `paved-shoulders.osm`, `new-paths.osm`, `path-access.osm`
- [ ] [Gatineau-cycling](Gatineau-cycling/): `on-road.osm` (2-way fix for Rue des Cerisiers and Rue Wright)
- [ ] [Ottawa-stop-signs](Ottawa-stop-signs/): `3/stop-signs-01..06.osm` (ward 3, Barrhaven West, after the first upload: 286 signs to review, up to 50 per file, each with `fixme` + `fixme_sv`)
- [ ] [Ottawa-stop-signs](Ottawa-stop-signs/): `1/stop-signs-01..05.osm` (ward 1, Orléans East-Cumberland: 239 signs to review)
- [ ] [Ottawa-stop-signs](Ottawa-stop-signs/): `2/stop-signs-01..03.osm` (ward 2, Orléans West-Innes: 148 signs to review)
- [ ] [Ottawa-stop-signs](Ottawa-stop-signs/): `4/stop-signs-01..02.osm` (ward 4, Kanata North: 82 signs to review)

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

## Ball diamonds (file ready)

- [ ] [Ottawa-ball-diamonds/ball-diamonds.osm](Ottawa-ball-diamonds/ball-diamonds.osm): 6 diamonds in parks: Village Green, Connaught, Princess Louise, Laroche, Bingham and Whitehaven. The city has 280 park diamonds, and 274 are already in OSM.
  - **Tags:** follow the earlier import: `sport=baseball` with `baseball:diamond=softball|baseball|t-ball` (Ottawa doesn't use `sport=softball`), the `baseball:*` details, `access=yes`, and `ref` / `ref:park`.
    - Generic names ("Ball Diamond", "T-Ball") are dropped, and so are the city's notes in brackets.
  - **Imagery:** at 5 of the 6 the point is off: on a rink pad, in a parking lot, under trees, in the Laroche basketball court (the dirt field west of it may be the diamond), and at the Bingham tennis court. Whitehaven showed nothing clear. The console prints these notes.
- School-ground diamonds are left out. Their points are poor.

## Playgrounds (file ready)

- [ ] [Ottawa-playgrounds/playgrounds.osm](Ottawa-playgrounds/playgrounds.osm): 17 `leisure=playground` nodes, to redraw as areas if you want.
  - **How the city records become playgrounds:** the city has 1,719 records, play areas and single structures by age group. Records of a park within 40 m of each other are grouped into one playground, which gives 794, and 769 are already in OSM.
  - **Visible in imagery:** Hillside Estates, William Bradley and Lola. Small structures show at Harthill Way (2 nodes), unnamed park 1644 and Forest Glen.
  - **Not visible:**
    - under trees: Rooney, Blackburn, Isaiah Scharfe, and unnamed parks 1645 (2 nodes) and 1647
    - Louis Turner is a new park whose imagery still shows a meadow
    - Cobe Parkette has no imagery
  - **Bob MacQuarrie:** the point is on the building, so it may be an indoor play area.
  - **Fisher Park:** don't add the node. The area there tagged `leisure=water_park` (w154548031) is really the playground: sand and equipment, with the splash pad mapped next to it. Retag it instead.
- Not written, 8 playgrounds with an OSM playground 68–109 m away, probably the same one: Trend, Notre-Dame-des-Champs, Green Briar, Village Green, Riverain, Glebe, Centennial and Stanstead.

## Community gardens (file ready)

- [ ] [Ottawa-allotments/ottawa-allotments.osm](Ottawa-allotments/ottawa-allotments.osm): 9 gardens, written over the 2018 output. The city lists 80 that exist, and 71 are in OSM, 8 of them under the same name 62–276 m from the city point.
  - **Which ones:**
    - Urban Shades, St. Joe's Supper Table, West Barrhaven and Greenstar
    - new since 2018: Heron Gate, Kitigànensag, Westboro Food Bank and 2 Ottawa Salus sites
  - **Tags:** `landuse=allotments` with the name, French name and website, like the 2018 import. The 2018 `operator=City of Ottawa` is dropped (community groups run the gardens), and so is the address description.
  - **Every node needs moving.** The city points are the street addresses: rooftops, yards and parking lots. None of the gardens shows at its point, and some are probably small gardens behind or on top of the building.
  - **St. Joe's and West Barrhaven:** an unnamed allotments area 129–143 m away may be the garden. If so, name it and drop the node.
  - **Kitigànensag:** OSM has a garden of that name 3.2 km away. The garden may have moved, so check whether the old one still exists.
- Not written: 3 gardens the city lists as "In Development": Lindenlea, Queensway Terrace North and South Nepean Muslim Centre.

## Winter-maintained bike racks (file ready)

- [ ] [Ottawa-bike-racks/winter-bike-racks.osm](Ottawa-bike-racks/winter-bike-racks.osm): 2 racks, single ring-and-posts near Bank Street around Lansdowne. They have no ID in the city data, so they're probably recent.
  - **Tags:**
    - `bicycle_parking=bollard` and `capacity=2`. Ottawa maps ring-and-posts as `bollard`, U-racks as `stands` and hanger racks as `rack`.
    - `operator=City of Ottawa`.
    - `seasonal=no` + `winter_service=yes`. Ottawa marks racks taken in for the winter with `seasonal=yes`.
  - **Why only 2 of the 18:** the city lists every ring separately, while OSM maps a spot as one node with a capacity. The city's 87 racks are 47 sites, and 42 are mapped.
- Not written, 3 sites with OSM bike parking 27–44 m away, probably the same: a hanger rack, 2 U-racks at a pharmacy, and a ring-and-post.
- [ ] **Idea:** the 42 mapped sites' bike parking has no `seasonal` tag. Adding `seasonal=no` + `winter_service=yes` would show which racks are usable in winter; no OSM bike parking in Ottawa says so yet.

## Sports fields (file ready)

- [ ] [Ottawa-sports-fields/sports-fields.osm](Ottawa-sports-fields/sports-fields.osm): 1 field, the Kings Grant Park general open field (`sport=multi`, 50 × 70 m), visible in imagery. It's written over the 2018 output, with tags following that import. The city has 526 park fields, and 525 are already in OSM.
- School-ground fields are left out. Their points are poor: on portables, between walkways, on small lawns.

## Sledding hills (file ready)

- [ ] [Ottawa-sledding-hills/sledding-hills.osm](Ottawa-sledding-hills/sledding-hills.osm): 18 hills, written over the 2017 output. The city lists 74 approved hills, and 56 are in OSM. Most of the missing ones were approved in 2024.
  - **Tags:** what the 2017 hills carry now that mappers have tidied them: `piste:type=sled`, `piste:difficulty=novice`, `seasonal=winter`, `operator=City of Ottawa`, `ref`, and the city's site notes as `description` ("gradual slope to the east, unlit, no parking").
    - Not included: `source`, the 2017 `area=yes` and `route=piste` (wrong on nodes), and the generic name "Sledding Hill".
  - **Imagery can't confirm these,** since any grassy hill looks the same in summer. Every city hill is "Approved site", 64 of them conditionally.
  - **Uplands Riverside** has 2 records 36 m apart, written as one hill.
- Already in OSM but more than 150 m from the city point: Alfred Taylor (183 m) and Gardenway (160 m), found by their 2017 `ref`; Conroy Pit (582 m), found by name.

## Street lights (new lamps uploaded 2026-11-14)

City layer: [Road_Information/7](https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/7). The portal item was last modified 2026-08-12, and the newest pole is from June 2024.
- **Compared with the 2019 zip:**
  - The 2019 export had 142,446 records, but 76,013 of them were stacked duplicates: 66,433 distinct lights. Today there are 74,435.
  - Every ID changed. Matched by position:
    - 9,233 lights are new or moved since 2019, and 1,217 are gone.
    - 8,973 lights changed from high-pressure sodium to LED.
- **OSM has about 93,000 street lamps.** 66,345 are from the 2019 import, which has `lamp_ref`. zzptichka has mapped 23,924 more since, mostly bare `highway=street_lamp`, including a 2024 batch of 14,644.
- [x] **New lamps:** [Ottawa-street-lights/update.js](Ottawa-street-lights/update.js) wrote `new-lamps-01.osm` … `new-lamps-06.osm`, 2,979 lamps in compact areas of about 500 (`--chunk` changes that). These are city lights since 2019 with no OSM lamp within 10 m (matched one to one).
  - Most are on rebuilt streets (Elgin, Montreal Road, Airport Parkway, Rideau), at the LRT stations (Tunney's Pasture, St-Laurent, Blair, Tremblay), and in new subdivisions (Meynell, Cope, Conservancy, Emmerson).
  - **Tags:** follow the 2019 import: `lamp_type`, `lamp_mount`, `material`, `lamp_flames`, `height`. No `source`, and no `lamp_ref`, since the city renumbered its lights.
  - 448 of them have an OSM lamp no city light claims 10–30 m away. That's often the old pole of a rebuilt street, which can go.
- [ ] **Removed lamps:** 893 lights from the 2019 data are missing from OSM; mappers may have deleted them on purpose, so they're not written. Separately, about 22,000 OSM lamps match no city light (NCC, private, parking lots, or removed poles). The 1,217 lights gone since 2019 are the next thing to check.
- [ ] **LED changes:** `lamp_type` on the imported lamps whose light source changed.

## More city datasets (checked 2026-11-14)

A second pass over the rest of [maps.ottawa.ca](https://maps.ottawa.ca/arcgis/rest/services) and [open.ottawa.ca](https://open.ottawa.ca). Rough numbers from position matching; none of these has an `update.js` yet.

**Tag fixes on objects already in OSM:**
- [ ] **Speed cameras:** Ottawa switched off every automated speed camera on 2025-11-13 (Bill 56). OSM still has 20 `highway=speed_camera` nodes and 2 `enforcement=maxspeed` relations, all at the city's old camera sites. Delete them or make them `disused:`.
- [ ] **All-way stops** ([Intersections](https://maps.ottawa.ca/arcgis/rest/services/Intersections/MapServer/0), `CONTROLTYPE=4STOP`): 965 in the city layer. 147 have `highway=stop` nodes without `stop=all`, and 21 have no stop node at all.
- [ ] **PXOs:** 69 of the 220 intersection PXOs and 23 of the 159 mid-block ones have no `crossing_ref=pxo`. 41 of those have a plain crossing node, so only the tag is missing.
- [ ] **Dogs in parks:** 799 parks already have `dog=*`, 169 named parks don't, and 6 disagree with the city.
- [ ] **Bus stops:** compared with OC Transpo's current GTFS (service 2026-11-13 to 12-13) and the city's [OC Transpo Stops](https://open.ottawa.ca/datasets/ottawa::oc-transpo-stops) layer (2025-07-21, the only source with shelter and bench flags). Stop codes are compared as numbers, because GTFS writes "0351" and the city layer 351.
  - **Missing stops:** 351 served stop codes aren't in OSM. 269 of them have no OSM stop within 30 m.
  - **Possibly removed stops:** 476 OSM refs aren't served now; 402 of them are in neither GTFS nor the city layer.
  - **Moved stops:** 409 stops with the same code are 30 m or more from the GTFS position (55 over 100 m, a few of them wrong refs many km off).
  - **Ref format:** 40 OSM refs lack the leading zero.
  - **Shelters and benches:** OSM and the city agree on 92% of shelters. Only 35 untagged stops get `shelter=yes` and 61 get `bench=yes`; 126 and 40 conflict with an OSM `no`. A blank bench flag doesn't mean "no": 1,009 stops have a bench in OSM and a blank in the city data.

**New objects:**
- [ ] **Traffic signals:** 38 of 1,235 signalised intersections have no signal node within 40 m.
- [ ] **Two-way stops and yields:** 1,722 STOP and 359 YIELD intersections have no control node at all. The city gives only the intersection point, so each sign has to go on the minor road's approaches, which needs a rule and review. [Ottawa-stop-signs/update.js](Ottawa-stop-signs/update.js) does this one ward at a time; wards 1–4 are done.
- [ ] **Red-light cameras:** 25 of 86 are missing, all installed 2020–2025. Ottawa maps them as `type=enforcement` relations (54 exist), so each needs a relation, not just a node.
- [ ] **Pay-and-display machines** ([Parking/0](https://maps.ottawa.ca/arcgis/rest/services/Parking/MapServer/0)): 495 of 623 active machines are missing, mostly in Somerset, Kitchissippi and Rideau-Vanier. 6 decommissioned ones are still in OSM. The rate and hours fields could give `opening_hours` and `charge`.
- [ ] **Mountain bike trails** ([CyclingMap/17](https://maps.ottawa.ca/arcgis/rest/services/CyclingMap/MapServer/17), from the Ottawa Mountain Bike Association): 76 named trails, 63 of the names already on OSM paths. The Easy/Intermediate/Hard ratings could become `mtb:scale:imba` 1/2/3; only 35 Ottawa paths have any `mtb:scale` now.
- [ ] **Other park features** ([Parks_Inventory/12](https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/12)): about 100 missing: 29 gazebos, 27 monuments, 15 fitness stations, 8 game tables, 5 horseshoe pits, 3 orchards and a few others.
- [ ] **Food banks** ([CommunitySocialServices/8](https://maps.ottawa.ca/arcgis/rest/services/CommunitySocialServices/MapServer/8)): 20 of 23 aren't in OSM.
- [ ] **Child care centres** ([CommunitySocialServices/4](https://maps.ottawa.ca/arcgis/rest/services/CommunitySocialServices/MapServer/4)): 170 of 433 licensed centres aren't in OSM. 124 of those are programs in schools; 46 are standalone daycares. OSM uses `amenity=kindergarten` (293) here, not `childcare` (2).
- [ ] **Parks** ([Parks_Inventory/24](https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/24)): 259 of 1,378 match no OSM park by name or position, 202 of them "passive" (woodlots, ponds). 29 OSM parks have no name and could take the city's.
- [ ] **Fire hydrants** ([WaterInfrastructure/4](https://maps.ottawa.ca/arcgis/rest/services/WaterInfrastructure/MapServer/4)): 28,168 of 28,635 missing; OSM has 571. That's a full import, which needs a proposal on the community forum first.

Not matched yet: trees (OSM has 231,000, the city inventory 304,000) and truck routes (4,307 city segments, 5 OSM ways with `hgv=designated`).

## Nothing to do

These layers are already fully or almost fully in OSM:
- roundabouts (199 of 199), long-term care homes (28 of 28), lawn bowling (4 of 4), beaches (4 of 4)
- library branches: all mapped; 11 city points are 180 m to 1.2 km off
- volleyball courts (37 of 39)
- wading pools (52 of 53)
- outdoor pools (11 of 11)
- skateparks (checked 2026-11-14): every permanent skatepark is in OSM. Of the 7 left:
  - 6 are "Roving Skateboard Park Location" records. These are stops of the city's portable summer ramps; the data is from 2018–2022 and nothing permanent is there. The 2017 import file had 7 of them, and none are in OSM now.
  - #59126 (2025) is the Trillium Park BMX track, already mapped as "Dragon Canyon BMX track".
- park parking lots (404 of 409, checked 2026-11-14). The first scan said 19 were missing, but most are mapped as multipolygons, many with the city's `ref`. Of the 5 left:
  - Barnett Park is mapped 55 m away.
  - Reid Park, Ottawa South Community Centre and Sindy Hooper show no lot in imagery.
  - François Dupuis has no position.
- public toilets (the 60 park portables were uploaded on 2026-11-14)
- water fountains, bike repair stations, sidewalks and pathway links (updated on 2026-11-13)
- winter-maintained cycling network (12,600 Ottawa ways already have `winter_service`)
