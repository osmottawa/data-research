// Finds City of Ottawa ball diamonds (in parks and on school grounds) that are missing in OSM and writes them to
// ball-diamonds.osm, to review and upload from JOSM. Tags follow the earlier import that most Ottawa diamonds in
// OSM come from (sport=baseball with baseball:diamond=softball/baseball/t-ball and baseball:* details), without
// source and without generic names ("Ball Diamond").
//
//   node update.js [--new-parks <snapshot>] [--new-schools <snapshot>]
//
//   --new-*  city datasets; downloaded and saved as ball-diamonds-parks/schools-<today>.json if omitted
//
// City diamonds and OSM diamonds are matched one to one, closest first, within MATCH; a leftover with an unused
// OSM diamond a bit farther (NEARBY) is listed instead (the city point is often off). Diamonds checked in imagery
// get a note in the console.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca, "Ball Diamonds" and "Ball Diamonds School" (Parks Inventory)
const LAYERS = {
  parks: "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/1",
  schools: "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/2",
};
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin
const OUTPUT = "ball-diamonds.osm";

// meters
const MATCH = 60;    // diamonds are big and the city point can be anywhere on them
const NEARBY = 120;  // an unused OSM diamond this close is probably the one, with the city point off

// what Esri imagery showed on 2026-11-14 at the points of diamonds missing then (by FACILITYID); listed in the
// console for the review, the diamonds are written anyway
const SEEN = {
  36037: "infield visible", 36069: "infield visible", 36030: "infield visible", 36017: "infield visible",
  36060: "infield visible", 36053: "infield visible", 36026: "infield visible", 36066: "infield visible",
  36024: "infield visible", 36036: "infield visible", 36008: "infield visible", 36010: "infield visible",
  36029: "infield visible", 36062: "infield visible",
  33139: "point on the rink pad, no diamond seen", 33045: "point in a parking/storage lot, no diamond seen",
  33207: "point on grass among trees, no diamond seen", 3846: "point in the basketball court; the dirt field west of it may be the diamond",
  3892: "point at the tennis court by the parking lot, no diamond seen", 36021: "point at the end of a rink",
  36040: "point in a playground", 36064: "point in a construction site", 36072: "point at the school's street corner",
  36013: "point under trees by the schoolyard",
};

const yesNo = v => v == null ? undefined : /^y/i.test(v) ? "yes" : /^n/i.test(v) ? "no" : undefined;
const GENERIC = /^(ball diamond|t-ball|t-ball diamond|ball diamond - (softball|baseball))$/i;

function tags(p) {
  // without the city's notes in brackets: "Ball Diamond 02 (grassy area)", "Ball Diamond (Small)"
  const clean = s => (s || "").replace(/\s*\([^)]*\)/g, "").trim();
  const name = clean(p.FIELD_NAME), nameFr = clean(p.FIELD_NAME_FR);
  const length = v => Number(v) > 0 ? String(v) : undefined;
  return {
    leisure: "pitch",
    sport: "baseball",
    "baseball:diamond": p.DIAMOND_TYPE ? p.DIAMOND_TYPE.trim().toLowerCase() : undefined,
    name: name && !GENERIC.test(name) ? name : undefined,
    "name:fr": name && !GENERIC.test(name) && nameFr ? nameFr : undefined,
    access: p.PARK_ID != null ? "yes" : undefined, // park diamonds, as in the earlier import
    lit: yesNo(p.LIGHTS),
    wheelchair: yesNo(p.ACCESSIBLE),
    "baseball:backstop": p.BACKSTOP ? p.BACKSTOP.trim().toLowerCase() : undefined,
    "baseball:centrefield": length(p.CENTREFIELD_LENGTH),
    "baseball:rightfield": length(p.RIGHTFIELD_LENGTH),
    "baseball:warning_track": yesNo(p.WARNING_TRACK),
    "baseball:outfield_fence": yesNo(p.OUTFIELD_FENCE),
    "baseball:line_fence": yesNo(p.LINE_FENCE),
    "baseball:dugout_fence": yesNo(p.FENCED_DUGOUT),
    "baseball:scoreboard": yesNo(p.SCOREBOARD),
    "baseball:irrigation": yesNo(p.IRRIGATION),
    "baseball:bleachers": yesNo(p.BLEACHERS),
    "baseball:safety_net": yesNo(p.SAFETY_NETTING),
    "baseball:players_benches": yesNo(p.PLAYERS_BENCHES),
    "baseball:bullpen": yesNo(p.BULL_PEN),
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
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-ball-diamonds-update" }, signal: AbortSignal.timeout(180000) });
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
  const data = `[out:json][timeout:180];nwr["sport"~"baseball|softball"](${bbox});out geom;`;
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

function buildOSM(diamonds) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  diamonds.forEach((diamond, i) => {
    const [lat, lon] = diamond.at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(diamond.tags)) if (v != null && v !== "") xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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
      const file = local(`ball-diamonds-${kind}-${today}.json`);
      fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
      console.log(`Saved ${path.basename(file)}: ${city.features.length} diamonds`);
    }
    features.push(...city.features.map(f => ({ ...f, kind })));
  }
  const osm = await downloadOSM();

  const shut = features.filter(f => /^no/i.test(f.properties.OPEN || ""));
  const diamonds = features.filter(f => f.geometry?.coordinates?.length === 2 && !shut.includes(f)).map(f => {
    const p = f.properties, at = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    return { p, at, q: xy(at), tags: tags(p), label: `#${p.FACILITYID} ${(p.PARKNAME || p.SCHOOL_NAME || "?").trim()}: ${(p.FIELD_NAME || "").trim()} (${p.DIAMOND_TYPE})` };
  });

  // one to one: closest pairs within MATCH first, then leftovers with an unused OSM diamond within NEARBY
  const pairs = diamonds.flatMap(c => osm.map(el => ({ c, el, d: distance(c.q, el) }))).filter(x => x.d <= NEARBY).sort((a, b) => a.d - b.d);
  for (const { c, el, d } of pairs) if (d <= MATCH && !c.osm && !el.used) { c.osm = el; c.d = d; el.used = true; }
  for (const { c, el, d } of pairs) if (!c.osm && !el.used) { c.osm = el; c.d = d; c.off = true; el.used = true; }
  const added = diamonds.filter(c => !c.osm), off = diamonds.filter(c => c.off);

  // report
  console.log(`\nCity diamonds: ${diamonds.length} (closed, skipped: ${shut.length}), already in OSM: ${diamonds.length - added.length}, missing: ${added.length}` +
    ` (${added.filter(c => c.p.PARK_ID != null).length} in parks, ${added.filter(c => c.p.PARK_ID == null).length} at schools)`);
  for (const c of added) console.log(`  ${c.label}${SEEN[c.p.FACILITYID] ? ` - ${SEEN[c.p.FACILITYID]}` : ""}`);
  console.log(`\nNot written, an OSM diamond ${MATCH}-${NEARBY} m away is probably the one (city point off): ${off.length}`);
  for (const c of off) console.log(`  ${c.label}: ${c.osm.id} ${Math.round(c.d)} m`);

  fs.writeFileSync(local(OUTPUT), buildOSM(added));
  console.log(`\nSaved ${OUTPUT}: ${added.length} diamonds`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
