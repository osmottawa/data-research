// Finds City of Ottawa approved sledding hills that are missing in OSM and writes them to sledding-hills.osm, to
// review and upload from JOSM. Tagged as the hills of the 2017 import (clean.js) are now: piste:type=sled,
// piste:difficulty=novice, seasonal=winter, operator, ref and the city's site observations as description; without
// source, its area=yes and route=piste on nodes, and the generic name "Sledding Hill".
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as sledding-hills-<today>.json if omitted
//
// A hill is in OSM if there is a sledding piste close to it, one with its ref (the 2017 import's, mappers moved
// some) or one with its name. City records of a park within GROUP of each other are one hill.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Sledding Hills" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/17";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "sledding-hills.osm";

// meters
const GROUP = 60;
const MATCH = 150;      // hills are big and the point can be anywhere on them
const BY_REF = 500;     // a piste with the hill's ref this close is the hill
const BY_NAME = 1500;   // ...or one with its (not generic) name

const GENERIC = /^sledding hill$/i;
const clean = s => (s || "").replace(/\s*\([^)]*\)/g, "").trim(); // "Sledding Hill (Ottawa Public Library Carp Branch)"

function tags(p) {
  const name = clean(p.NAME), nameFr = clean(p.NAME_FR);
  const description = (p.OBSERVATIONS || "").replace(/\s+/g, " ").trim().slice(0, 255).trim();
  return {
    "piste:type": "sled",
    "piste:difficulty": "novice",
    name: name && !GENERIC.test(name) ? name : undefined,
    "name:fr": name && !GENERIC.test(name) && nameFr ? nameFr : undefined,
    description: description || undefined,
    seasonal: "winter",
    operator: p.PARK_ID != null ? "City of Ottawa" : undefined,
    ref: p.FACILITYID != null ? String(p.FACILITYID) : undefined,
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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-sledding-hills-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson" });
  const city = await getJSON(`${CITY_LAYER}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

// sledding pistes, and anything named a sledding/toboggan hill; "out geom" with the default verbosity, so that
// multipolygons come with their members
async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["piste:type"="sled"](${bbox});nwr["name"~"sled|sliding|tobog|glissade",i](${bbox}););out geom;`;
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

function buildOSM(hills) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  hills.forEach((hill, i) => {
    const [lat, lon] = hill.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(hill.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`sledding-hills-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} hills`);
  }
  const osm = await downloadOSM();

  // records into hills
  const shut = city.features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const hills = [];
  for (const f of city.features) {
    if (!(f.geometry?.coordinates?.length === 2) || shut.includes(f)) continue;
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], rec = { p, at, q: xy(at) };
    const hill = hills.find(h => h.park === p.PARK_ID && p.PARK_ID != null && h.recs.some(r => Math.hypot(r.q[0] - rec.q[0], r.q[1] - rec.q[1]) < GROUP));
    if (hill) hill.recs.push(rec); else hills.push({ park: p.PARK_ID, recs: [rec] });
  }
  const found = [];
  for (const h of hills) {
    h.at = h.recs[0].at;
    h.tags = tags(h.recs[0].p);
    const dist = el => Math.min(...h.recs.map(r => distance(r.q, el)));
    const name = clean(h.recs[0].p.NAME);
    const hit = osm.map(el => ({ el, d: dist(el) })).find(({ el, d }) =>
      (d <= MATCH && el.tags["piste:type"] === "sled") ||
      (d <= BY_REF && h.recs.some(r => el.tags.ref && el.tags.ref === String(r.p.FACILITYID))) ||
      (d <= BY_NAME && !GENERIC.test(name) && (el.tags.name || "").toLowerCase() === name.toLowerCase()));
    if (hit) found.push({ h, ...hit });
    h.label = `${(h.recs[0].p.PARKNAME || name || "?").trim()} (${h.recs[0].p.ASSESSMENT}${h.recs.length > 1 ? `, ${h.recs.length} records` : ""})`;
  }
  const added = hills.filter(h => !found.some(f => f.h === h));

  // report
  console.log(`\nCity hills: ${hills.length} (closed, skipped: ${shut.length}), already in OSM: ${found.length}, missing: ${added.length}`);
  for (const h of added) console.log(`  ${h.label}`);
  const far = found.filter(f => f.d > MATCH);
  console.log(`\nIn OSM by ref or name, more than ${MATCH} m from the city point: ${far.length}`);
  for (const f of far) console.log(`  ${f.h.label}: ${f.el.id} ${f.el.tags.name || ""} ${Math.round(f.d)} m`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} hills`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
