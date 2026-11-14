// Finds the City of Ottawa's seasonal portable toilets in parks that are missing in OSM and writes them to
// portable-toilets.osm, to review and upload from JOSM.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as portable-toilets-<today>.json if omitted
//
// The city's Public Washrooms layer also has washrooms in its buildings (libraries, community centres,
// arenas...). Those were imported years ago and are left out here; only the portable ones are compared
// (SPECIAL_TOILET_TYPE "1", which the city's own map labels "Portable Washroom / Toilettes portables").
// A portable toilet is in OSM if there is any toilet this close to it (mappers often tag them as pit latrines).
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Public Washrooms"
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/PublicWashrooms/MapServer/0";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "portable-toilets.osm";

const MONTHS = { JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr", MAY: "May", JUN: "Jun", JUL: "Jul", AUG: "Aug", SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec" };
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const HHMM = /^\d\d:\d\d$/;

// opening_hours when every day has the same hours (the city gives park hours, 05:00-23:00), else none
function openingHours(p) {
  const hours = new Set(DAYS.map(d => `${p[`HOURS_${d}_OPEN`]}-${p[`HOURS_${d}_CLOSED`]}`));
  const [open, close] = [...hours][0].split("-");
  if (hours.size !== 1 || !HHMM.test(open) || !HHMM.test(close)) return undefined;
  const season = MONTHS[p.SEASON_START] && MONTHS[p.SEASON_END] ? `${MONTHS[p.SEASON_START]}-${MONTHS[p.SEASON_END]} ` : "";
  return `${season}${open}-${close}`;
}

const tags = p => ({
  amenity: "toilets",
  access: "yes",
  fee: "no",
  operator: "City of Ottawa",
  portable: "yes",
  "toilets:disposal": "chemical",
  unisex: "yes",
  seasonal: p.SEASONAL === "0" ? "no" : "yes",
  opening_hours: openingHours(p),
});

// meters
const MATCH = 75;   // any toilet this close is the same one
const ON = 1;       // points this close to a pitch, playground or building are listed (position is likely off)

// ---------------------------------------------------------------------------------------------------------

const RAD = Math.PI / 180;
const KX = 111320 * Math.cos(45.4 * RAD), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];

// meters from point p to a node or way given as a list of [lat, lon]
function distance(p, shape) {
  const q = xy(p), pts = shape.map(xy);
  if (pts.length > 3 && inside(q, pts)) return 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l)) : 0;
    d = Math.min(d, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return d;
}
function inside(q, ring) {
  let r = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) r = !r;
  }
  return r;
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-public-toilets-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const params = new URLSearchParams({
    where: "SPECIAL_TOILET_TYPE='1' AND PUBLIC_TOILETS_YN='1'", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson",
  });
  const city = await getJSON(`${CITY_LAYER}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

// all toilets in Ottawa, and the pitches, playgrounds and buildings right around the city's points
async function downloadOSM(points) {
  const near = points.map(([lat, lon]) => `way["leisure"~"^(pitch|playground|swimming_pool|ice_rink)$"](around:15,${lat},${lon});way["building"](around:15,${lat},${lon});`).join("");
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["amenity"="toilets"](${bbox});way["building"="toilets"](${bbox});${near});out geom tags;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.map(el => {
        const pts = el.type === "node" ? [{ lat: el.lat, lon: el.lon }]
          : el.type === "way" ? el.geometry : (el.members || []).filter(m => m.geometry).flatMap(m => m.geometry);
        return { id: `${el.type[0]}${el.id}`, tags: el.tags || {}, shape: pts.map(g => [g.lat, g.lon]) };
      });
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(toilets) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  toilets.forEach((toilet, i) => {
    const [lat, lon] = toilet.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(toilet.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
    xml.push("  </node>");
  });
  xml.push("</osm>", "");
  return xml.join("\n");
}

const describe = el => `${el.id} ${Object.entries(el.tags).filter(([k]) => /^(amenity|building|leisure|sport|name|toilets:disposal|seasonal)$/.test(k)).map(([k, v]) => `${k}=${v}`).join(" ")}`;

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
    const file = local(`portable-toilets-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}`);
  }
  const toilets = city.features.map(f => ({
    p: f.properties, tags: tags(f.properties), at: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    label: `#${f.properties.UNIQUE_ID} ${(f.properties.NAME || "").trim()}, ${(f.properties.ADDRESS || "").trim()}`,
  }));
  const osm = await downloadOSM(toilets.map(t => t.at));
  const osmToilets = osm.filter(el => el.tags.amenity === "toilets" || el.tags.building === "toilets");
  const obstacles = osm.filter(el => !osmToilets.includes(el) && el.shape.length > 3);

  for (const t of toilets) {
    const near = osmToilets.map(el => ({ el, d: distance(t.at, el.shape) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= MATCH) t.osm = near;
    t.on = obstacles.map(el => ({ el, d: distance(t.at, el.shape) })).filter(o => o.d <= ON).sort((a, b) => a.d - b.d)[0];
  }

  // report
  const missing = toilets.filter(t => !t.osm);
  console.log(`\nCity portable toilets: ${toilets.length}, already in OSM: ${toilets.length - missing.length}`);
  for (const t of toilets.filter(t => t.osm)) console.log(`  ${t.label}: ${describe(t.osm.el)}, ${Math.round(t.osm.d)} m away`);

  const off = missing.filter(t => t.on);
  console.log(`\nNew toilets that sit on something they can't be on (position is off, move them): ${off.length}`);
  for (const t of off) console.log(`  ${t.label}: on ${describe(t.on.el)}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(missing));
  console.log(`\nSaved ${OUTPUT}: ${missing.length} toilets`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
