// Finds City of Ottawa outdoor tennis courts that are missing in OSM and writes them to tennis-outdoor.osm, to
// review and upload from JOSM. Tags follow the 2018 import (clean.js), without source.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as tennis-courts-<today>.json if omitted
//
// A city record (one per site, with the number of courts) is in OSM if there is an OSM tennis pitch close to
// it; one with an OSM tennis pitch a bit farther is listed instead (the city point is often off). Sites with
// only indoor courts are skipped.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Tennis Courts" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/21";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "tennis-outdoor.osm";

// meters
const MATCH = 40;    // any OSM tennis pitch this close is the site
const NEARBY = 100;  // ...and one this close probably is, with the city point off: listed, not written

const yes = v => /^yes/i.test(v || "");
const ACCESS = [ // by COURT_TYPE, as in 2018 but without its placeholder operators "Private Club" and "School Board"
  [/member/i, { access: "customers" }],
  [/public/i, { access: "permissive", operator: "City of Ottawa" }],
  [/private/i, { access: "private" }],
  [/school/i, { access: "customers" }],
];
const SURFACE = [[/argile|clay/i, "clay"], [/acryl/i, "acrylic"], [/asphalt/i, "asphalt"]];
const SUFFIX = { "Ave.": "Avenue", "Rd.": "Road", "St.": "Street", "Dr.": "Drive", "Blvd.": "Boulevard" };
// street names compared loosely: "St. Laurent Boulevard" is OSM's "St-Laurent Boulevard"
const loose = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\bsaint(e?)\b/g, "st$1").replace(/[^a-z0-9]/g, "");

// the city's "815 St. Laurent Boulevard, Ottawa" as addr tags, with the street named as the OSM street nearby;
// none if that street isn't found
function address(full, streets) {
  const housenumber = (full || "").match(/^\d[\d\-a-zA-Z]*/)?.[0];
  if (!housenumber) return {};
  let street = full.slice(housenumber.length).replace(/^[\s,]+/, "").split(",")[0].trim();
  for (const [abbr, word] of Object.entries(SUFFIX)) if (street.endsWith(` ${abbr}`)) street = street.slice(0, -abbr.length) + word;
  const osmName = streets.find(name => loose(name) === loose(street));
  return osmName ? { "addr:housenumber": housenumber, "addr:street": osmName } : {};
}

function tags(p, streets) {
  const club = /club/i.test(p.COURT_TYPE || ""); // the city's CLUB is a real name only for clubs ("Public Tennis Courts" otherwise)
  const surface = SURFACE.find(([re]) => re.test(p.SURFACE_COLOUR || ""))?.[1];
  return {
    leisure: "pitch",
    sport: Number(p.PICKLEBALL) > 0 ? "tennis;pickleball" : "tennis",
    name: club ? p.CLUB?.trim() : undefined,
    "name:fr": club ? p.CLUB_FR?.trim() : undefined,
    outdoor: "yes",
    seasonal: "yes",
    description: p.COURT_TYPE?.trim(),
    courts: Number(p.OUTDOOR_COURT) > 0 ? String(p.OUTDOOR_COURT) : undefined,
    surface,
    ...(ACCESS.find(([re]) => re.test(p.COURT_TYPE || ""))?.[1] || {}),
    ...address(p.ADDRESS, streets),
    lit: yes(p.LIGHTS) ? "yes" : "no",
    wheelchair: yes(p.ACCESSIBLE) ? "yes" : "no",
    "tennis:fence": yes(p.FENCE) ? "yes" : "no",
    "tennis:benches": yes(p.BENCHES) ? "yes" : "no",
    "tennis:clubhouse": yes(p.CLUBHOUSE) ? "yes" : "no",
    "tennis:backwall": yes(p.BACKWALL) || /ball wall/i.test(p.COURT_TYPE || "") ? "yes" : "no",
    ref: String(p.FACILITYID),
    "ref:park": p.PARK_ID ? String(p.PARK_ID) : undefined,
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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-tennis-update" }, signal: AbortSignal.timeout(180000) });
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
  // "out geom" with the default verbosity, so that multipolygons come with their members
  const data = `[out:json][timeout:180];nwr["sport"~"tennis"](${bbox});out geom;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.filter(el => /(^|;)tennis(;|$)/.test(el.tags?.sport || "")).map(el => {
        const geo = el.type === "node" ? [el] : el.type === "way" ? el.geometry : (el.members || []).filter(m => m.geometry).flatMap(m => m.geometry);
        return { id: `${el.type[0]}${el.id}`, tags: el.tags || {}, pts: geo.map(g => xy([g.lat, g.lon])) };
      }).filter(el => el.pts.length);
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

// names of the streets near each point, for the addr tags
async function streetsNear(points) {
  if (!points.length) return [];
  const data = `[out:json][timeout:60];(${points.map(([lat, lon]) => `way(around:600,${lat},${lon})["highway"]["name"];`).join("")});out tags;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      return [...new Set(osm.elements.map(el => el.tags.name))];
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  console.log("  Could not get street names, no addr tags");
  return [];
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(sites) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  sites.forEach((site, i) => {
    const [lat, lon] = site.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(site.tags)) if (v != null && v !== "") xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
    const file = local(`tennis-courts-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} sites`);
  }
  const osm = await downloadOSM();

  const indoor = city.features.filter(f => Number(f.properties.INDOOR_COURT) > 0 && Number(f.properties.OUTDOOR_COURT) === 0);
  const sites = city.features.filter(f => f.geometry?.coordinates?.length === 2 && !indoor.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const near = osm.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    return { p, at, near, label: `#${p.FACILITYID} ${(p.CLUB || "").trim()} (${p.COURT_TYPE}, ${p.OUTDOOR_COURT} outdoor)` };
  });
  const inOSM = sites.filter(s => s.near && s.near.d <= MATCH);
  const nearby = sites.filter(s => s.near && s.near.d > MATCH && s.near.d <= NEARBY);
  const added = sites.filter(s => !inOSM.includes(s) && !nearby.includes(s));
  const streets = await streetsNear(added.map(s => s.at));
  for (const s of added) s.tags = tags(s.p, streets);

  // report
  console.log(`\nCity sites: ${sites.length} (indoor only, skipped: ${indoor.length}), already in OSM: ${inOSM.length}, missing: ${added.length}`);
  for (const s of added) console.log(`  ${s.label}`);
  console.log(`\nNot written, an OSM tennis pitch ${MATCH}-${NEARBY} m away is probably the site (city point off): ${nearby.length}`);
  for (const s of nearby) console.log(`  ${s.label}: ${s.near.el.id} ${Math.round(s.near.d)} m${s.near.el.tags.courts ? `, courts=${s.near.el.tags.courts}` : ""}`);

  const ids = new Set(sites.map(s => String(s.p.FACILITYID)));
  const gone = osm.filter(el => el.tags.ref && el.tags.source === "City of Ottawa" && !ids.has(el.tags.ref));
  console.log(`\nOSM pitches of the 2018 import whose ref is not in the city dataset anymore (removed?): ${gone.length}`);
  for (const el of gone) console.log(`  ${el.id} ref=${el.tags.ref} ${el.tags.name || ""}`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} sites`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
