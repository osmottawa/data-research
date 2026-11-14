// Finds City of Ottawa sports fields in parks that are missing in OSM and writes them to sports-fields.osm, to
// review and upload from JOSM (nodes, to redraw as the field if wanted). Tags follow the 2018 import (clean.js):
// leisure=pitch, sport, surface=grass and the pitch:* details; without source and without the generic field name
// as description. The city's "Sports Fields on School Property" layer is left out, its points are poor.
//
//   node update.js [--new-parks <snapshot>]
//
//   --new-parks  city dataset; downloaded and saved as sports-fields-parks-<today>.json if omitted
//
// A city field is in OSM if any OSM pitch is within MATCH of it. Fields farther from a pitch are written: a
// school's or park's second field is often 80-120 m from the first. Fields checked in imagery get a note in the
// console.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Sports Fields" (Parks Inventory)
const LAYERS = {
  parks: "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/19",
};
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "sports-fields.osm";

const MATCH = 60; // meters

// what Esri imagery showed on 2026-11-14 at the points of fields missing then (by FACILITYID)
const SEEN = { 57607: "field visible" };

const yesNo = v => /^y/i.test(v || "") ? "yes" : /^n/i.test(v || "") ? "no" : undefined;
const SPORT = [[/soccer/i, "soccer"], [/football/i, "american_football"], [/ultimate/i, "ultimate"], [/cricket/i, "cricket"]]; // as in 2018
const SIZE = { mini: "mini", full: "full", int: "intermediate", interm: "intermediate" };

function tags(p) {
  const use = p.REGULAR_USE_TYPE || "";
  const posts = (p.POST_TYPE || "").trim();
  const length = v => Number(v) > 0 ? String(v) : undefined;
  return {
    leisure: "pitch",
    sport: SPORT.find(([re]) => re.test(use))?.[1] || "multi", // "sportsfield", "general open field", "multi-use"
    surface: "grass",
    access: p.PARK_ID != null ? "yes" : undefined, // park fields, as in 2018
    lit: yesNo(p.LIGHTS),
    "pitch:size": SIZE[(p.FIELD_SIZE || "").trim().toLowerCase()],
    "pitch:width": length(p.WIDTH),
    "pitch:length": length(p.LENGTH),
    "pitch:bleachers": yesNo(p.BLEACHERS),
    "pitch:players_bench": yesNo(p.PLAYERS_BENCHES),
    "pitch:running_track": yesNo(p.RUNNING_TRACK),
    "pitch:posts": !posts ? undefined : /none/i.test(posts) ? "no" : /both/i.test(posts) ? "soccer;american_football" : posts.replace("football", "american_football"),
    ref: p.FACILITYID != null ? String(p.FACILITYID) : undefined,
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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-sports-fields-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity(layer) {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson" });
  const city = await getJSON(`${layer}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  // "out geom" with the default verbosity, so that multipolygons come with their members
  const data = `[out:json][timeout:180];nwr["leisure"="pitch"](${bbox});out geom;`;
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

function buildOSM(fields) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  fields.forEach((field, i) => {
    const [lat, lon] = field.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(field.tags)) if (v != null && v !== "") xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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

  const features = [];
  for (const [kind, layer] of Object.entries(LAYERS)) {
    let city;
    if (arg(`--new-${kind}`)) city = JSON.parse(fs.readFileSync(arg(`--new-${kind}`)));
    else {
      city = await downloadCity(layer);
      const file = local(`sports-fields-${kind}-${today}.json`);
      fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
      console.log(`Saved ${path.basename(file)}: ${city.features.length} fields`);
    }
    features.push(...city.features);
  }
  const osm = await downloadOSM();

  const shut = features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const fields = features.filter(f => f.geometry?.coordinates?.length === 2 && !shut.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const near = osm.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    return { p, at, near, tags: tags(p), label: `#${p.FACILITYID} ${(p.PARKNAME || p.SCHOOL_NAME || "?").trim()}: ${(p.FIELD_NAME || "").trim()} (${p.REGULAR_USE_TYPE}, ${p.FIELD_SIZE || "?"})` };
  });
  const added = fields.filter(f => !(f.near && f.near.d <= MATCH));

  // report
  console.log(`\nCity fields: ${fields.length} (closed, skipped: ${shut.length}), already in OSM: ${fields.length - added.length}, missing: ${added.length}`);
  for (const f of added) console.log(`  ${f.label}; nearest OSM pitch ${f.near ? `${Math.round(f.near.d)} m (${f.near.el.tags.sport || "?"})` : "-"}${SEEN[f.p.FACILITYID] ? ` - ${SEEN[f.p.FACILITYID]}` : ""}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} fields`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
