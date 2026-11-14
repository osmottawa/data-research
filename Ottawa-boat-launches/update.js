// Finds City of Ottawa boat launches, canoe launches and boat docks that are missing in OSM and writes them to
// boat-launches.osm, to review and upload from JOSM.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as boat-launches-<today>.json if omitted
//
// Tagged the way Ottawa maps them: boat launches leisure=slipway (a node at the water end of the road to it),
// canoe launches waterway=access_point + canoe=yes (a node on the water's edge). Docks are piers, which are
// ways or areas only, so they get a waterway=access_point node to put on the end of the pier when it's drawn.
// A city launch is in OSM if there is any of these close to it, whatever the kind (a canoe launch next to a
// pier is the same spot).
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Boat Launches" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/4";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "boat-launches.osm";

// meters
const MATCH = 40;     // any OSM launch, put-in or pier this close is the same spot
const NEARBY = 100;   // ...and one this close probably is, with the city point off: listed, not written
const SAME_SPOT = 10; // city records of the same kind this close are one launch (some are listed twice)

const SURFACE = { gravel: "gravel", dirt: "dirt", paved: "paved", wood: "wood" };
const kind = p => /dock/i.test(p.LAUNCH_TYPE || "") ? "dock" : /canoe/i.test(p.LAUNCH_TYPE || "") ? "canoe" : "ramp";
const KIND_TAGS = {
  ramp: { leisure: "slipway" },
  // canoe=yes is the access tag most used with waterway=access_point; JOSM doesn't know canoe=put_in
  canoe: { waterway: "access_point", canoe: "yes", trailer: "no" },
  dock: { waterway: "access_point" }, // its surface (wood) belongs on the pier
};
const tags = p => ({ ...KIND_TAGS[kind(p)], surface: kind(p) === "dock" ? undefined : SURFACE[(p.SURFACE || "").trim().toLowerCase()] });

// OSM objects that are a launch spot (not the canoe=* tags on whole rivers)
const isLaunch = el => el.tags.leisure === "slipway" || el.tags.waterway === "access_point" || el.tags.man_made === "pier"
  || (el.node && el.tags.canoe);

// ---------------------------------------------------------------------------------------------------------

const KX = 111320 * Math.cos(45.4 * Math.PI / 180), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];

// meters from a point to an OSM node or way
function distance(q, el) {
  let d = Infinity;
  for (let i = 0; i < el.pts.length; i++) {
    const a = el.pts[i], b = el.pts[Math.min(i + 1, el.pts.length - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l)) : 0;
    d = Math.min(d, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return d;
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-boat-launches-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson" });
  const city = await getJSON(`${CITY_LAYER}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["leisure"="slipway"](${bbox});nwr["waterway"="access_point"](${bbox});` +
    `node["canoe"](${bbox});nwr["man_made"="pier"](${bbox}););out geom;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.map(el => {
        const geo = el.type === "node" ? [el] : el.type === "way" ? el.geometry : (el.members || []).filter(m => m.geometry).flatMap(m => m.geometry);
        return { id: `${el.type[0]}${el.id}`, node: el.type === "node", tags: el.tags || {}, pts: geo.map(g => xy([g.lat, g.lon])) };
      }).filter(el => el.pts.length && isLaunch(el));
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(launches) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  launches.forEach((launch, i) => {
    const [lat, lon] = launch.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(launch.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`boat-launches-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} launches`);
  }
  const osm = await downloadOSM();

  const shut = city.features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const launches = [], twice = [];
  for (const f of city.features) {
    if (!(f.geometry?.coordinates?.length === 2) || shut.includes(f)) continue;
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const label = `${(p.NAME || "?").trim()} (${p.LAUNCH_TYPE}, ${p.SURFACE})`;
    if (launches.some(l => kind(l.p) === kind(p) && Math.hypot(l.q[0] - q[0], l.q[1] - q[1]) < SAME_SPOT)) { twice.push(label); continue; }
    const near = osm.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    launches.push({ p, at, q, near, tags: tags(p), label });
  }
  const inOSM = launches.filter(l => l.near && l.near.d <= MATCH);
  const nearby = launches.filter(l => l.near && l.near.d > MATCH && l.near.d <= NEARBY);
  const added = launches.filter(l => !inOSM.includes(l) && !nearby.includes(l));

  // report
  console.log(`\nCity launches: ${launches.length} (closed, skipped: ${shut.length}; listed twice: ${twice.join(", ") || "none"})`);
  console.log(`Already in OSM: ${inOSM.length}, missing: ${added.length}`);
  for (const l of added) console.log(`  ${l.label} at ${l.at.map(v => v.toFixed(5)).join(",")}`);
  console.log(`\nNot written, an OSM launch, put-in or pier ${MATCH}-${NEARBY} m away is probably the spot (city point off): ${nearby.length}`);
  for (const l of nearby) console.log(`  ${l.label}: ${l.near.el.id} ${Math.round(l.near.d)} m`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} launches`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
