// Finds City of Ottawa outdoor pickleball courts that are missing in OSM and writes them to pickleball.osm, to
// review and upload from JOSM.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as pickleball-courts-<today>.json if omitted
//
// Most are lines painted on tennis courts (also on basketball courts and rink pads). Ottawa maps them as their
// own pitches with sport=pickleball over the court they are painted on, one per court; here each city site gets
// one node with the number of courts, to redraw as courts if wanted. Indoor courts (in gyms) are left out.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Pickleball Courts" (Parks Inventory)
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/27";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "pickleball.osm";

// meters
const MATCH = 40;    // any OSM pickleball pitch this close is the site
const NEARBY = 100;  // ...and one this close probably is, with the city point off: listed, not written

const yes = v => /^y/i.test(v || "");
const ACCESS = [[/member/i, "customers"], [/public/i, "permissive"], [/private/i, "private"], [/school/i, "customers"]];
// city OVERLAID_ON -> description; dedicated courts ("Pickleball Only") get none
const ON = [
  [/^tennis.*$/i, "Pickleball lines on tennis courts"],
  [/^basketball.*$/i, "Pickleball lines on a basketball court"],
  [/^.*rink.*$/i, "Pickleball lines on the outdoor rink pad"],
  [/^pickleball only \((\d+)\)\s*-\s*tennis court \((\d+)\).*$/i, "$1 pickleball courts and lines on $2 tennis court"],
];
const SURFACE = [[/acryl/i, "acrylic"], [/asphalt/i, "asphalt"], [/clay|argile/i, "clay"]];

// as the pickleball pitches already in OSM, which copy the tennis courts' tags; the city's newest records have
// no attributes, they get leisure and sport only
function tags(p) {
  const known = !!p.INDOOROROUTDOOR;
  const on = (p.OVERLAID_ON || "").trim();
  return {
    leisure: "pitch",
    sport: "pickleball",
    courts: Number(p.PICKLEBALL) > 0 ? String(p.PICKLEBALL) : undefined,
    description: (([re, text]) => re && on.replace(re, text))(ON.find(([re]) => re.test(on)) || []) || undefined,
    outdoor: known ? "yes" : undefined,
    seasonal: known ? "yes" : undefined,
    surface: SURFACE.find(([re]) => re.test(p.SURFACE_COLOUR || ""))?.[1],
    lit: known && p.LIGHTS ? (yes(p.LIGHTS) ? "yes" : "no") : undefined,
    access: ACCESS.find(([re]) => re.test(p.COURT_TYPE || ""))?.[1],
    wheelchair: known && p.ACCESSIBLE ? (yes(p.ACCESSIBLE) ? "yes" : "no") : undefined,
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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-pickleball-update" }, signal: AbortSignal.timeout(180000) });
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
  const data = `[out:json][timeout:180];nwr["sport"~"pickleball"](${bbox});out geom;`;
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
    const file = local(`pickleball-courts-${today}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}: ${city.features.length} sites`);
  }
  const osm = await downloadOSM();

  const indoor = city.features.filter(f => /indoor/i.test(f.properties.INDOOROROUTDOOR || ""));
  const sites = city.features.filter(f => f.geometry?.coordinates?.length === 2 && !indoor.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]], q = xy(at);
    const near = osm.map(el => ({ el, d: distance(q, el) })).sort((a, b) => a.d - b.d)[0];
    return { p, at, near, tags: tags(p), label: `#${p.OBJECTID} ${(p.ADDRESS || "").trim()} (${p.OVERLAID_ON || "no details"}, ${p.PICKLEBALL ?? "?"} courts)` };
  });
  const inOSM = sites.filter(s => s.near && s.near.d <= MATCH);
  const nearby = sites.filter(s => s.near && s.near.d > MATCH && s.near.d <= NEARBY);
  const added = sites.filter(s => !inOSM.includes(s) && !nearby.includes(s));

  // report
  console.log(`\nCity sites: ${sites.length} outdoor (indoor, skipped: ${indoor.length}), already in OSM: ${inOSM.length}, missing: ${added.length}`);
  const byOn = {};
  for (const s of added) byOn[s.p.OVERLAID_ON || "no details"] = (byOn[s.p.OVERLAID_ON || "no details"] || 0) + 1;
  console.log(`Missing by what they are on: ${Object.entries(byOn).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  for (const s of added) console.log(`  ${s.label}`);
  console.log(`\nNot written, an OSM pickleball pitch ${MATCH}-${NEARBY} m away is probably the site (city point off): ${nearby.length}`);
  for (const s of nearby) console.log(`  ${s.label}: ${s.near.el.id} ${Math.round(s.near.d)} m`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} sites, ${added.reduce((n, s) => n + (Number(s.p.PICKLEBALL) || 1), 0)} courts`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
