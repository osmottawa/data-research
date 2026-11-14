// Finds City of Ottawa splash pads that are missing in OSM and writes them to splashpads.osm, to review and upload
// from JOSM. Tags follow the 2022 import (clean.js) that the splash pads in OSM come from, without source.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as splash-pads-<today>.json if omitted
//
// A city splash pad is in OSM if there is an OSM splash pad (playground=splash_pad) close to it; one a bit
// farther is listed instead (the city point is often off). New ones that sit in an OSM playground area are listed
// too: some of those areas are the splash pad itself, drawn without playground=splash_pad, and can be tagged
// instead of adding the node.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Splash Pads" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/18";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "splashpads.osm";

// meters
const MATCH = 40;    // any OSM splash pad this close is the same one
const NEARBY = 100;  // ...and one this close probably is, with the city point off: listed, not written

const isSplash = t => t.playground === "splash_pad" || t.leisure === "splash_pad" || /splash/i.test(t.name || "");

// street names compared loosely: "50 MAIZE ST" is OSM's "Maize Street", "St. Laurent" is "St-Laurent"
const SUFFIX = { street: "st", road: "rd", drive: "dr", avenue: "ave", crescent: "cres", terrace: "ter", boulevard: "blvd", place: "pl", lane: "ln", court: "crt", private: "pvt" };
const loose = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\bsaint(e?)\b/g, "st$1")
  .replace(/[a-z]+/g, w => SUFFIX[w] || w).replace(/[^a-z0-9]/g, "");
const titleCase = s => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase());

function address(full, streets) {
  const housenumber = (full || "").match(/^\d[\d\-a-zA-Z]*/)?.[0];
  if (!housenumber) return {};
  const street = full.slice(housenumber.length).replace(/^[\s,]+/, "").split(",")[0].trim();
  const osmName = streets.find(name => loose(name) === loose(street));
  return osmName ? { "addr:housenumber": housenumber, "addr:street": osmName } : {};
}

// the park: the record's own SHORTNAME ("MAIZE PARK"), in the joined PARKNAME's spelling when they agree
// (the join is sometimes to another park)
function park(p) {
  const own = (p.SHORTNAME || "").replace(/\(future\)/i, "").trim(), joined = (p.PARKNAME || "").trim();
  if (joined && (!own || loose(own) === loose(joined))) return { en: joined, fr: (p.PARKNAME_FR || "").trim() };
  return { en: own === own.toUpperCase() ? titleCase(own) : own };
}

function tags(p, streets) {
  const { en, fr } = park(p), own = (p.NAME || "").trim();
  const generic = !own || /splash pad$/i.test(own); // "Splash Pad", "Maize Park Splash Pad"; not "Carp Water Splash Park"
  return {
    leisure: "playground",
    playground: "splash_pad",
    name: generic ? (en ? `Splash Pad - ${en}` : undefined) : own,
    "name:fr": generic && fr ? `Aire de jeux d'eau - ${fr}` : undefined,
    ...address(p.ADDRESS, streets),
    wheelchair: /^yes/i.test(p.ACCESSIBLE || "") ? "yes" : "no",
    seasonal: "summer",
    website: p.LINK || undefined,
    operator: "City of Ottawa",
    ref: String(p.FACILITYID),
  };
}

// ---------------------------------------------------------------------------------------------------------

const KX = 111320 * Math.cos(45.4 * Math.PI / 180), KY = 110540;
const xy = ([lat, lon]) => [lon * KX, lat * KY];
const closed = pts => pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

// meters from a point to an OSM node, way or area (0 inside)
function distance(q, el) {
  const pts = el.pts;
  if (closed(pts)) {
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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-splash-pads-update" }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function overpass(data) {
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      return osm;
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

async function downloadCity() {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: 4326, geometryPrecision: 7, f: "geojson" });
  const city = await getJSON(`${CITY_LAYER}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

// splash pads and playgrounds; "out geom" with the default verbosity, so that multipolygons come with their members
async function downloadOSM() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const osm = await overpass(`[out:json][timeout:180];(nwr["playground"="splash_pad"](${bbox});nwr["leisure"~"^(splash_pad|playground)$"](${bbox}););out geom;`);
  console.log(`OSM data as of ${osm.osm3s.timestamp_osm_base}`);
  return osm.elements.map(el => {
    const geo = el.type === "node" ? [el] : el.type === "way" ? el.geometry : (el.members || []).filter(m => m.geometry).flatMap(m => m.geometry);
    return { id: `${el.type[0]}${el.id}`, tags: el.tags || {}, pts: geo.map(g => xy([g.lat, g.lon])) };
  }).filter(el => el.pts.length);
}

async function streetsNear(points) {
  if (!points.length) return [];
  const osm = await overpass(`[out:json][timeout:60];(${points.map(([lat, lon]) => `way(around:600,${lat},${lon})["highway"]["name"];`).join("")});out tags;`);
  return [...new Set(osm.elements.map(el => el.tags.name))];
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(pads) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  pads.forEach((pad, i) => {
    const [lat, lon] = pad.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(pad.tags)) if (v != null && v !== "") xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`splash-pads-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} splash pads`);
  }
  const osm = await downloadOSM();
  const splash = osm.filter(el => isSplash(el.tags)), playgrounds = osm.filter(el => !isSplash(el.tags) && closed(el.pts));

  const shut = city.features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const pads = city.features.filter(f => f.geometry?.coordinates?.length === 2 && !shut.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const near = splash.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    const inside = playgrounds.filter(el => distance(q, el) === 0).sort((a, b) => area(a.pts) - area(b.pts))[0];
    return { p, at, near, inside, label: `#${p.FACILITYID} ${park(p).en || "?"}` };
  });
  const inOSM = pads.filter(s => s.near && s.near.d <= MATCH);
  const nearby = pads.filter(s => s.near && s.near.d > MATCH && s.near.d <= NEARBY);
  const added = pads.filter(s => !inOSM.includes(s) && !nearby.includes(s));
  const streets = await streetsNear(added.map(s => s.at));
  for (const s of added) s.tags = tags(s.p, streets);

  // report
  console.log(`\nCity splash pads: ${pads.length} (closed, skipped: ${shut.length}), already in OSM: ${inOSM.length}, missing: ${added.length}`);
  for (const s of added)
    console.log(`  ${s.label}${s.inside ? `: in playground area ${s.inside.id} (${Math.round(area(s.inside.pts))} m²${s.inside.tags.name ? `, "${s.inside.tags.name}"` : ""}); if that area is the pad, tag it instead` : ""}`);
  console.log(`\nNot written, an OSM splash pad ${MATCH}-${NEARBY} m away is probably the one (city point off): ${nearby.length}`);
  for (const s of nearby) console.log(`  ${s.label}: ${s.near.el.id} ${Math.round(s.near.d)} m`);

  const ids = new Set(city.features.map(f => String(f.properties.FACILITYID)));
  const shutIds = new Set(shut.map(f => String(f.properties.FACILITYID)));
  const imported = splash.filter(el => el.tags.ref && el.tags.source === "City of Ottawa");
  const closedInOSM = imported.filter(el => shutIds.has(el.tags.ref)), gone = imported.filter(el => !ids.has(el.tags.ref));
  console.log(`\nOSM splash pads of the 2022 import that the city now lists as closed: ${closedInOSM.length}`);
  for (const el of closedInOSM) console.log(`  ${el.id} ref=${el.tags.ref} ${el.tags.name || ""}`);
  console.log(`\nOSM splash pads of the 2022 import whose ref is not in the city dataset anymore (removed?): ${gone.length}`);
  for (const el of gone) console.log(`  ${el.id} ref=${el.tags.ref} ${el.tags.name || ""}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} splash pads`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
