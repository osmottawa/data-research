// Finds the City of Ottawa's winter-maintained bike racks that are missing in OSM and writes them to
// winter-bike-racks.osm, to review and upload from JOSM. Also reports the mapped ones that don't say yet that they
// stay out in winter.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as winter-bike-racks-<today>.json if omitted
//
// The city lists every ring and post, U-rack or hanger rack; OSM maps a spot with several as one node with a
// capacity. City racks within SITE of each other are one site, and a site is in OSM if any OSM bike parking is
// within MATCH of one of its racks. Tagged as Ottawa maps them: ring and post bicycle_parking=bollard, U-rack
// stands, hanger rack rack; seasonal=no (Ottawa's racks taken in for the winter have seasonal=yes) and
// winter_service=yes (cleared of snow).
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Winter Maintained Bike Racks" (Parking)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parking/MapServer/9";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "winter-bike-racks.osm";

// meters
const SITE = 10;
const MATCH = 25;
const NEARBY = 50;  // an OSM bike parking this close is probably the site, with the city point off: listed

// city TYPE -> bicycle_parking, and bikes per rack where it's known
const TYPES = [[/ring and post/i, "bollard", 2], [/u-rack/i, "stands", 2], [/hanger/i, "rack", undefined]];

function tags(racks) {
  const [, kind, per] = TYPES.find(([re]) => re.test(racks[0].p.TYPE || "")) || [null, undefined, undefined];
  const sameType = racks.every(r => r.p.TYPE === racks[0].p.TYPE);
  return {
    amenity: "bicycle_parking",
    bicycle_parking: sameType ? kind : undefined,
    capacity: sameType && per ? String(per * racks.length) : undefined,
    operator: "City of Ottawa",
    seasonal: "no",
    winter_service: "yes",
  };
}

// ---------------------------------------------------------------------------------------------------------

const KX = 111320 * Math.cos(45.4 * Math.PI / 180), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-bike-racks-update" }, signal: AbortSignal.timeout(180000) });
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
  const data = `[out:json][timeout:180];nwr["amenity"="bicycle_parking"](${bbox});out center tags;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.map(el => ({ id: `${el.type[0]}${el.id}`, tags: el.tags || {}, q: xy([el.lat ?? el.center.lat, el.lon ?? el.center.lon]) }));
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(sites) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  sites.forEach((site, i) => {
    const [lat, lon] = site.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(site.tags)) if (v != null) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`winter-bike-racks-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} racks`);
  }
  const osm = await downloadOSM();

  // racks into sites (chains of racks within SITE of each other)
  const sites = [];
  for (const f of city.features) {
    if (!(f.geometry?.coordinates?.length === 2) || !/^yes/i.test(f.properties.WINTERMAIN || "yes")) continue;
    const rack = { p: f.properties, at: [f.geometry.coordinates[1], f.geometry.coordinates[0]] };
    rack.q = xy(rack.at);
    const joined = sites.filter(s => s.racks.some(r => dist(r.q, rack.q) < SITE));
    const site = { racks: [rack, ...joined.flatMap(s => s.racks)] };
    sites.splice(0, sites.length, ...sites.filter(s => !joined.includes(s)), site);
  }
  for (const s of sites) {
    s.at = [0, 1].map(i => s.racks.reduce((sum, r) => sum + r.at[i], 0) / s.racks.length);
    s.near = s.racks.flatMap(r => osm.map(el => ({ el, d: dist(r.q, el.q) }))).sort((a, b) => a.d - b.d)[0];
    s.tags = tags(s.racks);
    const types = [...new Set(s.racks.map(r => r.p.TYPE))].join(", "), at = (s.racks.find(r => (r.p.WINTERSERV || "").trim()) || {}).p?.WINTERSERV;
    s.label = `${s.racks.length} ${types}${at ? ` (${at.trim()})` : ""} at ${s.at.map(v => v.toFixed(5)).join(",")}`;
  }
  const inOSM = sites.filter(s => s.near && s.near.d <= MATCH);
  const nearby = sites.filter(s => s.near && s.near.d > MATCH && s.near.d <= NEARBY);
  const added = sites.filter(s => !inOSM.includes(s) && !nearby.includes(s));

  // report
  console.log(`\nCity racks: ${sites.reduce((n, s) => n + s.racks.length, 0)} at ${sites.length} sites; in OSM: ${inOSM.length}, missing: ${added.length}`);
  for (const s of added) console.log(`  ${s.label}`);
  console.log(`\nNot written, an OSM bike parking ${MATCH}-${NEARBY} m away is probably the site (city point off): ${nearby.length}`);
  for (const s of nearby) console.log(`  ${s.label}: ${s.near.el.id} ${Math.round(s.near.d)} m`);
  const mapped = [...new Set(inOSM.map(s => s.near.el))];
  const noSeason = mapped.filter(el => !el.tags.seasonal), seasonalYes = mapped.filter(el => el.tags.seasonal === "yes");
  console.log(`\nMapped sites' OSM bike parking: ${mapped.length}; without seasonal: ${noSeason.length}; with seasonal=yes although the city keeps it out in winter: ${seasonalYes.length}`);
  for (const el of seasonalYes) console.log(`  ${el.id}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} sites`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
