// Finds City of Ottawa playgrounds that are missing in OSM and writes them to playgrounds.osm, to review and upload
// from JOSM (as leisure=playground nodes, to redraw as areas if wanted).
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as play-areas-<today>.json if omitted
//
// The city lists play areas and single structures (a swing, a climber) per age group; OSM maps the playground.
// City records of a park within GROUP of each other are one playground. A playground is in OSM if an OSM
// playground is within MATCH of any of its records; one with an OSM playground a bit farther (NEARBY) is listed
// instead (the city point is often off). Playgrounds checked in imagery get a note in the console.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Play Area - Structures" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/15";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "playgrounds.osm";

// meters
const GROUP = 40;
const MATCH = 60;
const NEARBY = 120;

// what Esri imagery showed on 2026-11-14 at playgrounds missing then (by any FACILITYID of the group)
const SEEN = {
  57025: "sand areas with equipment visible", 53113: "playground visible", 53447: "playground visible",
  49177: "small structure by the path visible", 49179: "small structure by the path visible",
  32457: "small structure at the path junction", 31535: "something under the trees",
  32573: "point on the building, maybe indoor", 34657: "no imagery", 57951: "new park, imagery shows a meadow",
  32182: "under trees", 32459: "under trees", 32460: "under trees", 32458: "under trees",
  31551: "under trees by the parking lot", 31110: "in the woods",
  31621: "the leisure=water_park area w154548031 here is the playground (sand and equipment, the splash pad is mapped next to it): retag it instead",
};

const tags = () => ({ leisure: "playground" });

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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-playgrounds-update" }, signal: AbortSignal.timeout(180000) });
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

// playgrounds and playground equipment, not splash pads; "out geom" with the default verbosity, so that
// multipolygons come with their members
async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["leisure"="playground"](${bbox});nwr["playground"](${bbox}););out geom;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.filter(el => el.tags?.playground !== "splash_pad").map(el => {
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

function buildOSM(playgrounds) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  playgrounds.forEach((pg, i) => {
    const [lat, lon] = pg.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(pg.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`play-areas-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} play areas and structures`);
  }
  const osm = await downloadOSM();

  // group the records into playgrounds
  const shut = city.features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const groups = [];
  for (const f of city.features) {
    if (!(f.geometry?.coordinates?.length === 2) || shut.includes(f)) continue;
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], rec = { p, at, q: xy(at) };
    const group = groups.find(g => g.park === p.PARK_ID && g.recs.some(r => Math.hypot(r.q[0] - rec.q[0], r.q[1] - rec.q[1]) < GROUP));
    if (group) group.recs.push(rec); else groups.push({ park: p.PARK_ID, recs: [rec] });
  }
  for (const g of groups) {
    g.near = g.recs.flatMap(r => osm.map(el => ({ el, d: distance(r.q, el) }))).sort((a, b) => a.d - b.d)[0];
    g.at = [0, 1].map(i => g.recs.reduce((s, r) => s + r.at[i], 0) / g.recs.length);
    g.tags = tags();
    const p = g.recs[0].p, seen = g.recs.map(r => SEEN[r.p.FACILITYID]).find(Boolean);
    g.label = `${(p.PARKNAME || `park ${p.PARK_ID}`).trim()}: ${g.recs.map(r => `${(r.p.NAME || "").trim()} (${r.p.AGE_GROUP || "?"})`).join(", ")}${seen ? ` - ${seen}` : ""}`;
  }
  const inOSM = groups.filter(g => g.near && g.near.d <= MATCH);
  const nearby = groups.filter(g => g.near && g.near.d > MATCH && g.near.d <= NEARBY);
  const added = groups.filter(g => !inOSM.includes(g) && !nearby.includes(g));

  // report
  console.log(`\nCity records: ${groups.reduce((n, g) => n + g.recs.length, 0)} (closed, skipped: ${shut.length}) in ${groups.length} playgrounds; already in OSM: ${inOSM.length}, missing: ${added.length}`);
  for (const g of added) console.log(`  ${g.label}`);
  console.log(`\nNot written, an OSM playground ${MATCH}-${NEARBY} m away is probably the one (city point off): ${nearby.length}`);
  for (const g of nearby) console.log(`  ${g.label}: ${g.near.el.id} ${Math.round(g.near.d)} m`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} playgrounds`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
