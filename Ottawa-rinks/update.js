// Finds City of Ottawa outdoor rinks that are missing in OSM and writes them to outdoor-rinks.osm, to review and
// upload from JOSM. Tags follow the 2018 import (clean.js) that most Ottawa rinks in OSM come from, without source.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as outdoor-rinks-<today>.json if omitted
//
// City rinks and OSM rinks are matched one to one, closest first, within MATCH. A city rink left over with an
// unmatched OSM rink of the same park (ref:park or name), or any unmatched OSM rink, a bit farther away (NEARBY)
// is that rink with the city point off: listed, not written. Puddles (flooded patches without boards) don't show
// in summer imagery, they are written as the city has them.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Outdoor Rinks" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/13";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "outdoor-rinks.osm";

// meters
const MATCH = 50;
const NEARBY = 100;      // any unmatched OSM rink this close is the same one
const NEARBY_PARK = 200; // ...or one of the same park this close

const none = v => !v || /^(none|no)/i.test(String(v).trim());
const snake = v => String(v).trim().toLowerCase().replace(/ +/g, "_");
const parkName = p => (p.PARKNAME || p.RINK_PARK_NAME || "").trim();

function tags(p) {
  const park = parkName(p), custom = p.NAME && !/^outdoor rink$/i.test(p.NAME.trim());
  let description = `Outdoor ice rink (${p.RINK_TYPE}) at ${park}`;
  const supervised = /^yes/i.test(p.SUPERVISION || "");
  if (supervised && !none(p.SUPERVISED_HOURS))
    description = `${description}. Supervised time: ${p.SUPERVISED_HOURS}`.replace(/\r?\n/g, ". ").replace(/ {2,}/g, " ").trim().slice(0, 255).trim();
  return {
    leisure: "ice_rink",
    name: custom ? p.NAME.trim() : park ? `${park} Ice Rink` : undefined,
    "name:fr": custom && p.NAME_FR ? p.NAME_FR.trim() : undefined,
    description,
    seasonal: "winter",
    access: "permissive",
    "ice_rink:type": snake(p.RINK_TYPE),
    "ice_rink:boards": none(p.BOARDS_TYPE) ? "no" : snake(p.BOARDS_TYPE),
    "ice_rink:lights": none(p.LIGHTS_TYPE) ? "no" : snake(p.LIGHTS_TYPE),
    lit: none(p.LIGHTS_TYPE) ? "no" : "yes",
    "ice_rink:facility": none(p.FACILITY) ? "no" : p.FACILITY.trim(),
    change_area: none(p.PUBLIC_CHANGE_SPACE) ? "no" : "yes",
    toilets: none(p.TOILET) ? "no" : "yes",
    operator: !p.ICE_MAINTENANCE || /city/i.test(p.ICE_MAINTENANCE) ? "City of Ottawa" : p.ICE_MAINTENANCE.trim(),
    supervised: supervised ? "yes" : "no",
    wheelchair: /^yes/i.test(p.ACCESSIBLE || "") ? "yes" : "no",
    "ref:park": p.PARK_ID != null ? String(p.PARK_ID) : undefined,
  };
}

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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-rinks-update" }, signal: AbortSignal.timeout(180000) });
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
  // "out geom" with the default verbosity, so that multipolygons come with their members
  const data = `[out:json][timeout:180];nwr["leisure"="ice_rink"](${bbox});out geom;`;
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

function buildOSM(rinks) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  rinks.forEach((rink, i) => {
    const [lat, lon] = rink.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(rink.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`outdoor-rinks-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} rinks`);
  }
  const osm = await downloadOSM();

  const closed = city.features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const rinks = city.features.filter(f => f.geometry?.coordinates?.length === 2 && !closed.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    return { p, at, q: xy(at), tags: tags(p), label: `#${p.FACILITYID ?? "-"} ${parkName(p) || "?"} (${p.RINK_TYPE})` };
  });
  const samePark = (r, el) => (el.tags["ref:park"] && el.tags["ref:park"] === String(r.p.PARK_ID)) ||
    (parkName(r.p) && (el.tags.name || "").toLowerCase().includes(parkName(r.p).toLowerCase()));

  // one to one: closest pairs within MATCH first, then leftovers with a nearby unmatched rink
  const pairs = rinks.flatMap(r => osm.map(el => ({ r, el, d: distance(r.q, el) }))).filter(x => x.d <= NEARBY_PARK);
  pairs.sort((a, b) => a.d - b.d);
  for (const { r, el, d } of pairs) if (d <= MATCH && !r.osm && !el.used) { r.osm = el; r.d = d; el.used = true; }
  for (const { r, el, d } of pairs) if (!r.osm && !el.used && (d <= NEARBY || samePark(r, el))) { r.osm = el; r.d = d; r.off = true; el.used = true; }
  const added = rinks.filter(r => !r.osm);
  const off = rinks.filter(r => r.off);

  // report
  console.log(`\nCity rinks: ${rinks.length} (closed, skipped: ${closed.length}), already in OSM: ${rinks.length - added.length}, missing: ${added.length}`);
  for (const r of added) console.log(`  ${r.label}`);
  console.log(`\nNot written, the OSM rink ${MATCH}-${NEARBY_PARK} m away is probably the same one (city point off): ${off.length}`);
  for (const r of off) console.log(`  ${r.label}: ${r.osm.id} ${r.osm.tags.name || ""} (${r.osm.tags["ice_rink:type"] || "-"}), ${Math.round(r.d)} m`);

  const parks = new Set(rinks.map(r => String(r.p.PARK_ID)));
  const gone = osm.filter(el => el.tags["ref:park"] && !el.used && !parks.has(el.tags["ref:park"]));
  console.log(`\nOSM rinks of the 2018 import whose park has no city rink anymore (gone?): ${gone.length}`);
  for (const el of gone) console.log(`  ${el.id} ${el.tags.name || ""}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} rinks`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
