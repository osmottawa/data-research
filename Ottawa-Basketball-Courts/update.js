// Finds City of Ottawa outdoor basketball courts that are missing in OSM and writes them to basketball.osm, to
// review and upload from JOSM.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as basketball-courts-<today>.json if omitted
//
// A city court is in OSM if there is an OSM basketball pitch close to it. Courts on an outdoor rink's pad
// (hoops used in summer) are added as a pitch inside the rink, the way they are mapped elsewhere in Ottawa.
// Courts with an OSM basketball pitch a bit farther away are listed instead: the city point is usually off.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Basketball Courts" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/3";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "basketball.osm";

// meters
const MATCH = 40;    // any OSM basketball pitch this close is the same court
const NEARBY = 100;  // ...and one this close probably is too, with the city point off: listed, not written

// courts checked in Esri imagery on 2026-11-14 (by FACILITYID): skipped with the reason, or tags changed
const CHECKED = {
  36089: "inside an OSM tennis court, no basketball markings",
  26183: "no court visible, grass under trees",
  26191: "no court visible, edge of a parking lot",
  26066: "on the skatepark",
  56775: "no court visible, grass",
  57593: "no court visible, worn patch of grass",
  36084: "no court visible",
  26162: "no imagery",
  26166: "no court visible, grass",
  52243: "imagery too coarse to tell",
  52245: "imagery too coarse to tell",
  26131: { hoops: "2" }, // a full court with two keys in imagery, the city says key court
};

// hoops by city COURT_TYPE; "Small" and "Non standard" courts can have either
const HOOPS = { "Full / Entier": "2", "Half / Demi": "1", "Key Court / Clé de basketball": "1" };
const tags = p => ({ leisure: "pitch", sport: "basketball", hoops: HOOPS[p.COURT_TYPE], ...(typeof CHECKED[p.FACILITYID] === "object" ? CHECKED[p.FACILITYID] : {}) });

// ---------------------------------------------------------------------------------------------------------

const KX = 111320 * Math.cos(45.4 * Math.PI / 180), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];

// meters from a point to an OSM node, way or area (0 inside)
function distance(q, el) {
  const pts = el.pts;
  if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return 0;
  }
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l)) : 0;
    d = Math.min(d, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return d;
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-basketball-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const features = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({
      where: "1=1", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson",
      orderByFields: "OBJECTID", resultOffset: offset, resultRecordCount: 1000,
    });
    const page = await getJSON(`${CITY_LAYER}/query?${params}`);
    if (!page.features) throw new Error("Unexpected response from the city server");
    features.push(...page.features);
    if (page.features.length < 1000) break;
  }
  return { type: "FeatureCollection", features };
}

async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["sport"~"basketball"](${bbox});nwr["leisure"="ice_rink"](${bbox}););out geom tags;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.map(el => {
        const geo = el.type === "node" ? [el] : el.type === "way" ? el.geometry : (el.members || []).filter(m => m.geometry).flatMap(m => m.geometry);
        return { id: `${el.type[0]}${el.id}`, tags: el.tags || {}, pts: geo.map(g => xy([g.lat, g.lon])) };
      }).filter(el => el.pts.length);
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(courts) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  courts.forEach((court, i) => {
    const [lat, lon] = court.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(court.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
    xml.push("  </node>");
  });
  xml.push("</osm>", "");
  return xml.join("\n");
}

// ---------------------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const local = file => path.resolve(__dirname, file);
  const today = new Date().toLocaleDateString("en-CA");

  let city;
  if (arg("--new")) city = JSON.parse(fs.readFileSync(arg("--new")));
  else {
    city = await downloadCity();
    const file = local(`basketball-courts-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} courts`);
  }
  const osm = await downloadOSM();
  const pitches = osm.filter(el => /basketball/.test(el.tags.sport || ""));
  const rinks = osm.filter(el => el.tags.leisure === "ice_rink" && el.pts.length > 3);

  const courts = city.features.filter(f => f.geometry?.coordinates?.length === 2).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const near = pitches.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    return {
      p, at, tags: tags(p), near, rink: rinks.find(el => distance(q, el) === 0),
      label: `#${p.FACILITYID} ${(p.PARKNAME || "?").trim()} (${p.COURT_TYPE})`,
    };
  });
  const inOSM = courts.filter(c => c.near && c.near.d <= MATCH);
  const rest = courts.filter(c => !inOSM.includes(c));
  const skipped = rest.filter(c => typeof CHECKED[c.p.FACILITYID] === "string");
  const nearby = rest.filter(c => !skipped.includes(c) && !c.rink && c.near && c.near.d <= NEARBY);
  const added = rest.filter(c => !skipped.includes(c) && !nearby.includes(c));

  // report
  console.log(`\nCity courts: ${courts.length}, already in OSM: ${inOSM.length}, missing: ${added.length} (${added.filter(c => c.rink).length} on a rink's pad)`);
  for (const c of added) console.log(`  ${c.label}${c.rink ? ` on rink ${c.rink.id}` : ""}`);
  console.log(`\nNot written, an OSM basketball court ${MATCH}-${NEARBY} m away is probably the one (city point off): ${nearby.length}`);
  for (const c of nearby) console.log(`  ${c.label}: ${c.near.el.id} ${Math.round(c.near.d)} m`);
  console.log(`\nNot written, checked in imagery: ${skipped.length}`);
  for (const c of skipped) console.log(`  ${c.label}: ${CHECKED[c.p.FACILITYID]}`);

  const ids = new Set(courts.map(c => String(c.p.FACILITYID)));
  const gone = pitches.filter(el => el.tags.ref && el.tags.source === "City of Ottawa" && !ids.has(el.tags.ref));
  console.log(`\nOSM courts of the 2017 import whose ref is not in the city dataset anymore (removed?): ${gone.length}`);
  for (const el of gone) console.log(`  ${el.id} ref=${el.tags.ref}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} courts`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
