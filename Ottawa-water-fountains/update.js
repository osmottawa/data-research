// Finds City of Ottawa public drinking fountains that are missing in OSM and writes them to an .osm file
// to review and merge manually in JOSM. Also reports what looks off in the existing OSM data.
//
//   node update.js [--new <snapshot>] [--out <file>]
//
//   --new   current city dataset; downloaded and saved as water_fountains-<today>.json if omitted
//   --out   default: water_fountains-<today>.osm
//
// A fountain exists in OSM if
//   - there is a drinking water node of the previous import with its number in the ref tag (mappers move
//     these to where the fountain really is, so they can be a bit away), or
//   - there is any other drinking water node close to it
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

const OLD_DATASET = "water_fountains-2019-05-16.geojson"; // what the previous import was made from

// source: https://open.ottawa.ca/datasets/ottawa::public-drinking-water-fountains
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Miscellaneous/MapServer/0";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin

const tags = p => ({
  amenity: "drinking_water",
  description: `At ${p.BUILDING_NAME.trim()}`,
  indoor: p.INSIDE_OUTSIDE === "Inside" ? "yes" : "no",
  seasonal: p.OPEN_YEAR_ROUND === "Yes" ? "no" : "yes",
  ref: String(p.OBJECTID),
});

// meters
const MATCH = 75;        // any drinking water node this close is the same fountain
const MATCH_REF = 300;   // a node of the previous import with the same ref can be this far
const LOOSE = 30;        // matches without a ref that are farther than this are listed for a second look

// ---------------------------------------------------------------------------------------------------------

const RAD = Math.PI / 180;
// meters between two [lat, lon]
const distance = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(45.4 * RAD)) * 111195;

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-water-fountains-update" }, signal: AbortSignal.timeout(120000) });
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
  const data = `[out:json][timeout:60][bbox:${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}];nwr[amenity=drinking_water];out tags center;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.map(el => ({
        id: `${el.type[0]}${el.id}`, tags: el.tags || {},
        at: [el.lat ?? el.center.lat, el.lon ?? el.center.lon],
      }));
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(fountains) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  fountains.forEach((fountain, i) => {
    const [lat, lon] = fountain.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(fountain.tags)) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`water_fountains-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}`);
  }
  const oldRefs = new Set(JSON.parse(fs.readFileSync(local(OLD_DATASET))).features.map(f => f.properties.ref));
  const osm = await downloadOSM();
  const imported = node => node.tags.ref && /city of ottawa/i.test(`${node.tags.source} ${node.tags.operator}`);

  const fountains = city.features.map(f => ({
    p: f.properties, tags: tags(f.properties), at: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    label: `#${f.properties.OBJECTID} ${f.properties.BUILDING_NAME.trim()}, ${f.properties.ADDRESS}`,
  }));

  // match to OSM one to one: nodes of the previous import by ref first, then whatever is closest
  const pairs = [];
  for (const fountain of fountains)
    for (const node of osm) {
      const d = distance(fountain.at, node.at), byRef = imported(node) && node.tags.ref === fountain.tags.ref && d <= MATCH_REF;
      if (byRef || d <= MATCH) pairs.push({ fountain, node, d, byRef });
    }
  for (const { fountain, node, d, byRef } of pairs.sort((a, b) => b.byRef - a.byRef || a.d - b.d)) {
    if (fountain.osm || node.fountain) continue;
    Object.assign(fountain, { osm: node, distance: d, byRef });
    node.fountain = fountain;
  }

  // report
  const missing = fountains.filter(f => !f.osm);
  const added = missing.filter(f => !oldRefs.has(f.tags.ref));
  console.log(`\nCity fountains: ${fountains.length}, already in OSM: ${fountains.length - missing.length}`);
  console.log(`Missing in OSM: ${missing.length} (${added.length} added to the city dataset since the previous import, ${missing.length - added.length} were in it but are not in OSM)`);
  for (const f of missing) {
    const near = osm.map(node => ({ node, d: distance(f.at, node.at) })).sort((a, b) => a.d - b.d)[0];
    console.log(`  ${oldRefs.has(f.tags.ref) ? " " : "+"} ${f.label} (${f.tags.indoor === "yes" ? "inside" : "outside"}${f.p.OPEN_SEASON ? `, ${f.p.OPEN_SEASON}` : ""}); nearest OSM drinking water ${near.node.id} is ${Math.round(near.d)} m away`);
  }

  const loose = fountains.filter(f => f.osm && !f.byRef && f.distance > LOOSE).sort((a, b) => b.distance - a.distance);
  console.log(`\nMatched to a drinking water node more than ${LOOSE} m away (same fountain?): ${loose.length}`);
  for (const f of loose) console.log(`  ${f.label}: ${Math.round(f.distance)} m from ${f.osm.id}${f.osm.tags.description ? ` "${f.osm.tags.description}"` : ""}`);

  const differ = fountains.filter(f => f.osm && ["indoor", "seasonal"].some(k => f.osm.tags[k] && f.osm.tags[k] !== f.tags[k]));
  console.log(`\nIn OSM with different indoor/seasonal tags than the city has now: ${differ.length}`);
  for (const f of differ)
    console.log(`  ${f.label}: ${f.osm.id} ${["indoor", "seasonal"].filter(k => f.osm.tags[k] && f.osm.tags[k] !== f.tags[k]).map(k => `${k}=${f.osm.tags[k]}, city says ${f.tags[k]}`).join("; ")}`);

  const gone = osm.filter(node => imported(node) && !node.fountain);
  console.log(`\nNodes of the previous import that are not in the city dataset anymore (fountain removed?): ${gone.length}`);
  for (const node of gone) console.log(`  ${node.id} ref=${node.tags.ref} "${node.tags.description}" at ${node.at.join(",")}`);

  const out = arg("--out") || local(`water_fountains-${today}.osm`);
  fs.writeFileSync(out, buildOSM(missing));
  console.log(`\nSaved ${path.basename(out)}: ${missing.length} fountains`);
}

main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
