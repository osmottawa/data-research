// Finds City of Ottawa park benches (and bleachers, picnic tables) that are missing in OSM and writes them to
// new-benches-01.osm, new-benches-02.osm, ... of at most 100 objects each, to review and upload from JOSM one by
// one. Each file covers one compact area, and a park's benches always go to the same file.
//
//   node update.js [--new <snapshot>] [--chunk <n>]
//
//   --new    city dataset; downloaded and saved as benches-<today>.json if omitted
//   --chunk  objects per file, default 100
//
// A city bench is in OSM if an OSM bench is matched to it, one to one, closest pairs first, at most MATCH away.
// One that has an unmatched OSM bench a bit farther (up to NEAR) may be that one drawn off: it's listed in the
// console instead of written.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca/datasets/ottawa::benches ("Parks Inventory")
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/28";
const PARKS_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/24";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const PREFIX = "new-benches-";

// meters
const MATCH = 15;
const NEAR = 30;
const SAME_SPOT = 1; // city objects of the same kind this close are one object

// city BENCH_TYPE -> kind; the rest ("Transfer Bench": transfer stations into playground sand boxes) is skipped
const KIND = {
  "Bench": "bench", "Older Adult Plan Bench": "bench", "Lions Club Bench": "bench", "Commemorative Bench": "bench",
  "Players Bench": "bench", "Bleachers": "bleachers", "Grandstand": "bleachers", "Table": "table", "Commemorative Picnic Table": "table",
};
// OSM objects that are the same thing as a city object of each kind
const SAME = {
  bench: t => t.amenity === "bench" || t.bench === "yes",
  bleachers: t => t.leisure === "bleachers" || t.building === "grandstand" || t.amenity === "bench",
  table: t => t.leisure === "picnic_table",
};

// tags as in the 2020 import (see build.js), without source
function tags(p) {
  const type = p.BENCH_TYPE, kind = KIND[type];
  const t = kind === "bench" ? { amenity: "bench", backrest: type === "Players Bench" ? "no" : "yes" }
    : kind === "bleachers" ? { leisure: "bleachers" } : { leisure: "picnic_table" };
  if (type === "Players Bench") t.description = "Players bench";
  if (type.startsWith("Commemorative")) {
    t.memorial = kind === "bench" ? "bench" : "yes";
    const name = (p.NAME || "").trim();
    if (name && name !== "Unknown") t.description = `${type}: ${name}`;
  }
  const plaque = (p.PLAQUE_TEXT || "").split(/[\r\n]+/).map(s => s.trim()).filter(Boolean).join(" / ");
  if (plaque) t.inscription = plaque;
  if (/^\d{4}$/.test(String(p.YEAR_INSTALLED || ""))) t.start_date = String(p.YEAR_INSTALLED);
  return t;
}

// ---------------------------------------------------------------------------------------------------------

const KX = 111320 * Math.cos(45.4 * Math.PI / 180), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];

// meters from a point to an OSM node, way or area
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

// splits groups of benches (a park's, with centre c) into `parts` compact areas of about equal size: cuts the
// area across its longer side, recursively
function split(groups, parts) {
  const size = gs => gs.reduce((s, g) => s + g.list.length, 0);
  if (groups.length < 2 || parts <= 1) return [groups];
  const span = i => Math.max(...groups.map(g => g.c[i])) - Math.min(...groups.map(g => g.c[i]));
  const axis = span(0) >= span(1) ? 0 : 1;
  const sorted = [...groups].sort((a, b) => a.c[axis] - b.c[axis]);
  const left = Math.floor(parts / 2), target = size(groups) * left / parts;
  let cut = 1, sum = sorted[0].list.length;
  while (cut < sorted.length - 1 && Math.abs(sum + sorted[cut].list.length - target) < Math.abs(sum - target)) sum += sorted[cut++].list.length;
  return [...split(sorted.slice(0, cut), left), ...split(sorted.slice(cut), parts - left)];
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-benches-update" }, signal: AbortSignal.timeout(180000) });
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

// PARK_ID -> park name and ward, to say where each file is
async function downloadParks() {
  const parks = new Map();
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({
      where: "1=1", outFields: "PARK_ID,NAME,WARD_NAME", returnGeometry: false, f: "json",
      orderByFields: "OBJECTID", resultOffset: offset, resultRecordCount: 1000,
    });
    const page = await getJSON(`${PARKS_LAYER}/query?${params}`);
    if (!page.features) throw new Error("Unexpected response from the city server");
    for (const { attributes: a } of page.features) parks.set(a.PARK_ID, { name: (a.NAME || "").trim(), ward: (a.WARD_NAME || "").trim() });
    if (page.features.length < 1000) break;
  }
  return parks;
}

async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["amenity"="bench"](${bbox});nwr["bench"="yes"](${bbox});` +
    `nwr["leisure"~"^(bleachers|picnic_table)$"](${bbox});nwr["building"="grandstand"](${bbox}););out geom tags;`;
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
      }).filter(el => el.pts.length);
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(benches) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  benches.forEach((bench, i) => {
    const [lat, lon] = bench.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(bench.tags)) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
  const chunk = Number(arg("--chunk") || 100);

  let city;
  if (arg("--new")) city = JSON.parse(fs.readFileSync(arg("--new")));
  else {
    city = await downloadCity();
    const file = local(`benches-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} objects`);
  }
  const osm = await downloadOSM();
  const parkInfo = await downloadParks();

  const skipped = {};
  const benches = [];
  for (const f of city.features) {
    const p = f.properties, kind = KIND[p.BENCH_TYPE];
    if (!(f.geometry?.coordinates?.length === 2)) continue; // a few have no position
    if (!kind) { skipped[p.BENCH_TYPE] = (skipped[p.BENCH_TYPE] || 0) + 1; continue; }
    const at = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    benches.push({ p, kind, at, q: xy(at), tags: tags(p), park: p.PARK_ID, label: `#${p.OBJECTID} ${p.BENCH_TYPE}` });
  }
  // the city has a few objects twice, on top of each other
  const twice = [];
  for (let i = benches.length - 1; i >= 0; i--) {
    const b = benches[i], first = benches.find((o, j) => j < i && o.kind === b.kind && Math.hypot(o.q[0] - b.q[0], o.q[1] - b.q[1]) < SAME_SPOT);
    if (first) { twice.push(`${b.label} (same as #${first.p.OBJECTID})`); benches.splice(i, 1); }
  }

  // one to one matching, closest pairs first; an OSM area (bleachers) can match several city points
  const grid = new Map(), CELL = 100, key = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  for (const el of osm) for (const k of new Set(el.pts.map(([x, y]) => key(x, y)))) (grid.get(k) || grid.set(k, []).get(k)).push(el);
  const around = q => {
    const found = new Set(), cx = Math.floor(q[0] / CELL), cy = Math.floor(q[1] / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const el of grid.get(`${cx + dx},${cy + dy}`) || []) found.add(el);
    return [...found];
  };
  const pairs = [];
  for (const b of benches) {
    b.near = around(b.q).filter(el => SAME[b.kind](el.tags)).map(el => ({ el, d: distance(b.q, el) })).filter(h => h.d <= NEAR);
    for (const h of b.near) if (h.d <= MATCH) pairs.push({ b, ...h });
  }
  for (const { b, el, d } of pairs.sort((x, y) => x.d - y.d)) {
    if (b.osm || (el.node && el.used)) continue;
    b.osm = el; b.distance = d; el.used = true;
  }
  const missing = benches.filter(b => !b.osm);
  const doubtful = missing.filter(b => b.near.some(h => !(h.el.node && h.el.used)));
  const added = missing.filter(b => !doubtful.includes(b));

  // report
  console.log(`\nCity objects: ${benches.length} (skipped: ${Object.entries(skipped).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}; listed twice: ${twice.join(", ") || "none"})`);
  console.log(`Already in OSM: ${benches.length - missing.length}, missing: ${added.length}, unsure: ${doubtful.length}`);
  const byKind = {};
  for (const b of added) byKind[b.p.BENCH_TYPE] = (byKind[b.p.BENCH_TYPE] || 0) + 1;
  console.log(`Missing by type: ${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", ")}`);

  console.log(`\nNot written, an unmatched OSM object ${MATCH}-${NEAR} m away may be the same one: ${doubtful.length}`);
  for (const b of doubtful) {
    const h = b.near.filter(h => !(h.el.node && h.el.used)).sort((x, y) => x.d - y.d)[0];
    console.log(`  ${b.label} at ${b.at.map(v => v.toFixed(6)).join(",")}: ${h.el.id} ${Math.round(h.d)} m`);
  }

  const cityIds = new Set(benches.filter(b => b.osm).map(b => b.osm.id));
  const gone = osm.filter(el => el.tags.source === "City of Ottawa" && el.tags.amenity === "bench" && !cityIds.has(el.id) && !el.used);
  console.log(`\nOSM benches of the 2020 import with no city bench within ${MATCH} m anymore (removed or moved?): ${gone.length}`);
  if (gone.length) console.log(`  ${gone.map(el => el.id).join(" ")}`);

  // chunks: parks in Hilbert curve order, a park's benches together, at most `chunk` per file
  const parks = new Map();
  for (const b of added) (parks.get(b.park ?? b.label) || parks.set(b.park ?? b.label, []).get(b.park ?? b.label)).push(b);
  const groups = [...parks.values()].map(list => ({
    list, c: [0, 1].map(i => list.reduce((s, b) => s + b.q[i], 0) / list.length),
  }));
  // as few files as possible with at most `chunk` objects each (parks can't be split, so sometimes one more)
  let chunks;
  for (let parts = Math.ceil(added.length / chunk); ; parts++) {
    chunks = split(groups, parts).map(part => part.flatMap(g => g.list));
    if (chunks.every(list => list.length <= chunk) || parts >= groups.length) break;
  }

  for (const f of fs.readdirSync(__dirname)) if (f.startsWith(PREFIX) && f.endsWith(".osm")) fs.unlinkSync(local(f));
  const width = String(chunks.length).length < 2 ? 2 : String(chunks.length).length;
  console.log("");
  chunks.forEach((list, i) => {
    const file = `${PREFIX}${String(i + 1).padStart(width, "0")}.osm`;
    fs.writeFileSync(local(file), buildOSM(list));
    const count = (key, top) => {
      const n = new Map();
      for (const b of list) { const k = key(b); if (k) n.set(k, (n.get(k) || 0) + 1); }
      return [...n].sort((a, b) => b[1] - a[1]).slice(0, top);
    };
    const wards = count(b => parkInfo.get(b.park)?.ward, 3).map(([k]) => k).join(", ");
    const biggest = count(b => parkInfo.get(b.park)?.name, 3).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`Saved ${file}: ${list.length} objects in ${new Set(list.map(b => b.park)).size} parks; ${wards}; most in ${biggest}`);
  });
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
