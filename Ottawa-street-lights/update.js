// Finds City of Ottawa street lights put up since the 2019 import (Street_Lights-2019-09-05.zip) that are missing
// in OSM and writes them to new-lamps-01.osm, new-lamps-02.osm, ..., one compact area per file, to review and
// upload from JOSM. Tags follow the 2019 import (clean.js), without source and lamp_ref (the city has renumbered
// its lights since).
//
//   node update.js [--new <snapshot>] [--chunk <n>]
//
//   --new    city dataset (.json or .json.gz); downloaded and saved as street-lights-<today>.json.gz if omitted
//   --chunk  lamps per file, default 500
//
// City records within SPOT of each other are one light (the city lists some twice). City lights and OSM street
// lamps are matched one to one, closest first, within MATCH; lights left over that are also not in the 2019 data
// are the new ones written. Left-over lights that were in the 2019 data are only counted (mappers may have deleted
// them for a reason).
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Street Lights"
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/7";
const OLD_DATASET = "Street_Lights-2019-09-05.zip";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const PREFIX = "new-lamps-";

// meters
const SPOT = 0.5;
const MATCH = 10;
const OLD = 3;       // a light within this of a 2019 light was there in 2019

// as in 2019
const LAMP_TYPE = { HPS: "high_pressure_sodium", LED: "led", LPS: "low_pressure_sodium", MH: "metal-halide", MV: "mercury", "LIGHT BULB": "electric" };
function tags(p) {
  const head = (p.HEAD_STYLE || "").toUpperCase(), pole = (p.POLE_TYPE || "").toUpperCase();
  let flames = parseInt(p.LIGHTS_NUM, 10);
  const mount = /WALL/.test(head) ? "wall" : /COBRA|CLDM|CLSM/.test(head) ? "bent_mast" : /LANTERN|POST TOP/.test(head) ? "straight_mast" : undefined;
  if (/CLSM/.test(head)) flames = 2;
  const material = /ALUM|METAL|STEEL/.test(pole) ? "metal" : /WOOD/.test(pole) ? "wood" : /CONCRETE|HAMPT/.test(pole) ? "concrete" : undefined;
  const height = Math.round(Number(p.POLE_HEIGHT));
  return {
    highway: "street_lamp",
    lamp_type: LAMP_TYPE[(p.LIGHT_SOUR || "").trim().toUpperCase()],
    lamp_mount: mount,
    material,
    lamp_flames: flames > 0 ? String(flames) : undefined,
    height: height > 1 && height <= 40 ? String(height) : undefined,
  };
}
const isReceptacle = p => /RECEPTACLE/i.test(p.HEAD_STYLE || "") || /^REC$/i.test(p.LIGHT_TYPE || "") || /RECEPTACLE/i.test(p.LIGHT_SOUR || "");

// ---------------------------------------------------------------------------------------------------------

const KX = 111320 * Math.cos(45.4 * Math.PI / 180), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const CELL = 25;
function grid(items) {
  const g = new Map();
  for (const it of items) { const k = `${Math.floor(it.q[0] / CELL)},${Math.floor(it.q[1] / CELL)}`; (g.get(k) || g.set(k, []).get(k)).push(it); }
  return g;
}
function around(g, q, m) {
  const out = [], cx = Math.floor(q[0] / CELL), cy = Math.floor(q[1] / CELL), r = Math.ceil(m / CELL);
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (const it of g.get(`${cx + dx},${cy + dy}`) || []) { const d = dist(it.q, q); if (d <= m) out.push({ it, d }); }
  return out;
}

// 2019 light positions from the shapefile in the zip (stored, not compressed, or deflated)
function read2019(file) {
  const zip = fs.readFileSync(file), zlib = require("zlib");
  for (let o = 0; o < zip.length - 30;) {
    if (zip.readUInt32LE(o) !== 0x04034b50) break;
    const method = zip.readUInt16LE(o + 8), size = zip.readUInt32LE(o + 18), nameLen = zip.readUInt16LE(o + 26), extra = zip.readUInt16LE(o + 28);
    const name = zip.toString("latin1", o + 30, o + 30 + nameLen), start = o + 30 + nameLen + extra;
    if (name.endsWith(".shp")) {
      const raw = zip.subarray(start, start + size), shp = method === 8 ? zlib.inflateRawSync(raw) : raw, pts = [];
      for (let off = 100; off < shp.length;) {
        const len = shp.readInt32BE(off + 4) * 2;
        if (shp.readInt32LE(off + 8) === 1) pts.push(xy([shp.readDoubleLE(off + 20), shp.readDoubleLE(off + 12)]));
        off += 8 + len;
      }
      return pts;
    }
    o = start + size;
  }
  throw new Error(`No .shp in ${file}`);
}

async function getJSON(url, options = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-street-lights-update" }, signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
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
  const data = `[out:json][timeout:300];node["highway"="street_lamp"](${bbox});out;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}: ${osm.elements.length} street lamps`);
      return osm.elements.map(el => ({ id: el.id, q: xy([el.lat, el.lon]) }));
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

// splits lamps into `parts` compact areas of about equal size, cutting across the longer side, recursively
function split(items, parts) {
  if (items.length < 2 || parts <= 1) return [items];
  const span = i => Math.max(...items.map(t => t.q[i])) - Math.min(...items.map(t => t.q[i]));
  const axis = span(0) >= span(1) ? 0 : 1, sorted = [...items].sort((a, b) => a.q[axis] - b.q[axis]);
  const left = Math.floor(parts / 2), cut = Math.round(items.length * left / parts);
  return [...split(sorted.slice(0, cut), left), ...split(sorted.slice(cut), parts - left)];
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(lamps) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  lamps.forEach((lamp, i) => {
    const [lat, lon] = lamp.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(lamp.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
  const chunk = Number(arg("--chunk") || 500);

  // the snapshot is gzipped, it's 40+ MB as plain JSON
  const zlib = require("zlib");
  let city;
  if (arg("--new")) {
    const raw = fs.readFileSync(arg("--new"));
    city = JSON.parse(arg("--new").endsWith(".gz") ? zlib.gunzipSync(raw) : raw);
  } else {
    city = await downloadCity();
    const file = local(`street-lights-${today}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(`{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`));
    console.log(`Saved ${path.basename(file)}: ${city.features.length} lights`);
  }
  const old = grid(read2019(local(OLD_DATASET)).map(q => ({ q })));
  const osm = await downloadOSM();

  // city records into lights (one per spot), receptacles left out as in 2019
  const records = city.features.filter(f => f.geometry?.coordinates?.length === 2 && !isReceptacle(f.properties))
    .map(f => ({ p: f.properties, at: [f.geometry.coordinates[1], f.geometry.coordinates[0]], q: xy([f.geometry.coordinates[1], f.geometry.coordinates[0]]) }));
  const recGrid = grid(records), taken = new Set(), lights = [];
  for (const r of records) {
    if (taken.has(r)) continue;
    for (const { it } of around(recGrid, r.q, SPOT)) taken.add(it);
    lights.push({ ...r, isNew: around(old, r.q, OLD).length === 0 });
  }

  // one to one, closest pairs first
  const osmGrid = grid(osm);
  const pairs = lights.flatMap(l => around(osmGrid, l.q, MATCH).map(({ it, d }) => ({ l, o: it, d }))).sort((a, b) => a.d - b.d);
  for (const { l, o } of pairs) if (!l.osm && !o.used) { l.osm = o; o.used = true; }
  const missing = lights.filter(l => !l.osm), added = missing.filter(l => l.isNew);
  for (const l of added) l.tags = tags(l.p);

  // report
  console.log(`\nCity lights: ${lights.length} (from ${records.length} records), in OSM: ${lights.length - missing.length}, missing: ${missing.length}`);
  console.log(`  new since 2019, written: ${added.length}`);
  console.log(`  in the 2019 data too, not written (deleted by mappers?): ${missing.length - added.length}`);
  const near = added.filter(l => around(osmGrid, l.q, 30).some(({ it }) => !it.used)).length;
  console.log(`  of the written ones, with an OSM lamp no city light claimed 10-30 m away (same lamp drawn off?): ${near}`);
  const byYear = {};
  for (const l of added) { const y = l.p.INSTALL_POLE ? new Date(l.p.INSTALL_POLE).getUTCFullYear() : "-"; byYear[y] = (byYear[y] || 0) + 1; }
  console.log(`  written by pole install year: ${Object.entries(byYear).sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const byStreet = {};
  for (const l of added) { const s = (l.p.STREET_NAM || "?").trim(); byStreet[s] = (byStreet[s] || 0) + 1; }
  console.log(`  streets with most: ${Object.entries(byStreet).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  // files
  let chunks;
  for (let parts = Math.max(1, Math.ceil(added.length / chunk)); ; parts++) {
    chunks = split(added, parts);
    if (chunks.every(c => c.length <= chunk)) break;
  }
  for (const f of fs.readdirSync(__dirname)) if (f.startsWith(PREFIX) && f.endsWith(".osm")) fs.unlinkSync(local(f));
  console.log("");
  chunks.forEach((list, i) => {
    const file = `${PREFIX}${String(i + 1).padStart(2, "0")}.osm`;
    fs.writeFileSync(local(file), buildOSM(list));
    const streets = {};
    for (const l of list) { const s = (l.p.STREET_NAM || "?").trim(); streets[s] = (streets[s] || 0) + 1; }
    console.log(`Saved ${file}: ${list.length} lamps; most on ${Object.entries(streets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  });
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
