// Finds community gardens of the City of Ottawa list that are missing in OSM and writes them to
// ottawa-allotments.osm, to review and upload from JOSM. Tagged landuse=allotments with the name, as the 2018 import
// (clean.js) that Ottawa's community gardens in OSM come from; without source, its operator (the gardens are run
// by community groups, not the city) and its address description.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as community-gardens-<today>.json if omitted
//
// The city points are the gardens' street addresses, often a building next to the garden or with a garden behind
// it, so each node needs moving onto the garden. A garden is in OSM if there is an allotments or garden area close
// to it, or one with its name a bit farther. "In Development" gardens are left out.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Community Gardens"
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Community_Gardens/MapServer/0";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "ottawa-allotments.osm";

// meters
const MATCH = 60;      // any allotments or garden this close is the garden
const BY_NAME = 400;   // ...and one with its name this close

const tags = p => ({
  landuse: "allotments",
  name: (p.GARDEN || "").trim() || undefined,
  "name:fr": (p.GARDEN_FR || "").trim() || undefined,
  website: (p.LINK || "").trim() || undefined,
});

// name words that say something ("Russell Gardens Community Garden" -> russell)
const STOP = new Set(["community", "garden", "gardens", "the", "jardin", "jardins", "communautaire", "park", "and"]);
const words = s => new Set((s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
// every distinctive word of the shorter name is in the other one
const sameName = (a, b) => { const A = words(a), B = words(b); return A.size > 0 && B.size > 0 && [...A].filter(w => B.has(w)).length >= Math.min(A.size, B.size); };

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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-allotments-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson" });
  const city = await getJSON(`${CITY_LAYER}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

// allotments, gardens and anything named a community garden; "out geom" with the default verbosity, so that
// multipolygons come with their members
async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const data = `[out:json][timeout:180];(nwr["landuse"="allotments"](${bbox});nwr["leisure"="garden"](${bbox});nwr["garden:type"](${bbox});` +
    `nwr["name"~"community garden|jardin communautaire",i](${bbox}););out geom;`;
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

function buildOSM(gardens) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  gardens.forEach((garden, i) => {
    const [lat, lon] = garden.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(garden.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`community-gardens-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} gardens`);
  }
  const osm = await downloadOSM();

  const planned = city.features.filter(f => /development/i.test(f.properties.STATUS || ""));
  const gardens = city.features.filter(f => f.geometry?.coordinates?.length === 2 && !planned.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const near = osm.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    const named = osm.filter(el => sameName(p.GARDEN, el.tags.name)).map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    return { p, at, near, named, tags: tags(p), label: `${(p.GARDEN || "?").trim()} (${p.STATUS}, ${(p.LEGAL_ADDR || "").trim()})` };
  });
  const inOSM = gardens.filter(g => (g.near && g.near.d <= MATCH) || (g.named && g.named.d <= BY_NAME));
  const added = gardens.filter(g => !inOSM.includes(g));

  // report
  console.log(`\nCity gardens: ${gardens.length} (in development, skipped: ${planned.map(f => f.properties.GARDEN.trim()).join(", ") || "none"})`);
  console.log(`Already in OSM: ${inOSM.length}, missing: ${added.length} (the points are street addresses: move each onto the garden)`);
  for (const g of added) {
    const unnamed = osm.filter(el => el.tags.landuse === "allotments" && !el.tags.name).map(el => ({ el, d: distance(xy(g.at), el) })).filter(h => h.d <= 200).sort((a, b) => a.d - b.d)[0];
    console.log(`  ${g.label}${g.named ? `; OSM has "${g.named.el.tags.name}" ${Math.round(g.named.d)} m away (moved?)` : ""}` +
      `${unnamed ? `; unnamed allotments ${unnamed.el.id} ${Math.round(unnamed.d)} m away may be it (name it instead)` : ""}`);
  }
  const farNamed = inOSM.filter(g => !(g.near && g.near.d <= MATCH));
  console.log(`\nIn OSM by name, ${MATCH}-${BY_NAME} m from the city point: ${farNamed.length}`);
  for (const g of farNamed) console.log(`  ${g.label}: ${g.named.el.id} ${Math.round(g.named.d)} m`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} gardens`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
