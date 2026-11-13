// Builds an .osm file with City of Ottawa sidewalks that were added to the city dataset since the
// previous import and are still missing in OSM. Review and merge the result manually in JOSM.
//
//   node update.js [--old <snapshot>] [--new <snapshot>] [--osm <overpass json>] [--out <file>] [--histogram]
//
//   --old        city dataset used for the previous import (default: OLD_SNAPSHOT below)
//   --new        current city dataset; downloaded and saved as pedestrian-network-<today>.json if omitted
//   --osm        Overpass JSON with existing OSM ways; downloaded if the file doesn't exist (not saved if omitted)
//   --histogram  also print how far the new city sidewalks are from the old snapshot / from OSM (to tune tolerances)
//
// For the next update point OLD_SNAPSHOT to the snapshot this run saves.
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

const OLD_SNAPSHOT = "pedestrian-network-2019-02-28.json";
const OUTPUT = "ottawa-sidewalks-new.osm";

// source: https://open.ottawa.ca/datasets/ottawa::pedestrian-network
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Pedestrian_Plan/MapServer/0";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
// anything a sidewalk could already be mapped as
const OSM_HIGHWAYS = "footway|path|pedestrian|cycleway|steps|construction";

const TAGS = {
  highway: "footway",
  footway: "sidewalk",
  surface: "concrete",
  width: "2",
};

// all distances in meters
const STEP = 2;            // sampling interval along the city sidewalks
const OLD_TOLERANCE = 3;   // city sidewalk is "not new" if the old snapshot has a parallel line this close
const OSM_TOLERANCE = 5;   // city sidewalk "exists in OSM" if there is a parallel OSM way this close
const MAX_ANGLE = 30;      // degrees; what still counts as parallel (keeps crossing ways from matching)
const OVERSHOOT = 1.5;     // how far past the end of a segment a point may be and still match it
const MIN_COVERED = 6;     // shorter matched stretches in the middle of an unmatched one are ignored
const MIN_NEW = 10;        // shorter unmatched leftovers of a partially matched sidewalk are dropped
const MIN_WHOLE = 2;       // shorter sidewalks are dropped even if completely unmatched
const MAX_NEAR = 0.8;      // unmatched pieces with this share of points next to a line in any direction are dropped
const SNAP = 0.5;          // endpoints this close to another new way are connected to it

// ---------------------------------------------------------------------------------------------------------
// geometry: everything is done in a local equirectangular projection, accurate to a few cm across the city

const RAD = Math.PI / 180, EARTH = 6371008.8, LON0 = -75.7, LAT0 = 45.4;
const KX = EARTH * RAD * Math.cos(LAT0 * RAD), KY = EARTH * RAD;
const toXY = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const toLonLat = ([x, y]) => [+(LON0 + x / KX).toFixed(7), +(LAT0 + y / KY).toFixed(7)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineLength = pts => pts.reduce((sum, p, i) => i ? sum + dist(pts[i - 1], p) : 0, 0);

// feature -> list of projected polylines (multilines are split into parts)
function toLines(feature) {
  const g = feature.geometry;
  if (!g) return [];
  const parts = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  return parts
    .map(part => part.map(toXY).filter((p, i, all) => !i || dist(p, all[i - 1]) > 0.01))
    .filter(pts => pts.length > 1);
}

// grid index of line segments
class SegmentIndex {
  constructor(cell = 25) {
    this.cell = cell;
    this.cells = new Map();
    this.segs = []; // ax, ay, ux, uy, length
  }
  key(cx, cy) { return (cx + 50000) * 100000 + (cy + 50000); }
  addLine(pts) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.01) continue;
      const id = this.segs.length;
      this.segs.push(ax, ay, (bx - ax) / len, (by - ay) / len, len);
      const c = this.cell;
      for (let cx = Math.floor(Math.min(ax, bx) / c); cx <= Math.floor(Math.max(ax, bx) / c); cx++)
        for (let cy = Math.floor(Math.min(ay, by) / c); cy <= Math.floor(Math.max(ay, by) / c); cy++) {
          const k = this.key(cx, cy);
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(id);
        }
    }
  }
  // distance from a point to the nearest segment within maxDist; with a direction (ux, uy) only roughly
  // parallel segments that run alongside the point count
  nearest(px, py, maxDist, ux, uy) {
    const c = this.cell, s = this.segs, minCos = Math.cos(MAX_ANGLE * RAD);
    let best = Infinity;
    for (let cx = Math.floor((px - maxDist) / c); cx <= Math.floor((px + maxDist) / c); cx++)
      for (let cy = Math.floor((py - maxDist) / c); cy <= Math.floor((py + maxDist) / c); cy++)
        for (const id of this.cells.get(this.key(cx, cy)) || []) {
          const vx = s[id + 2], vy = s[id + 3], len = s[id + 4];
          const t = (px - s[id]) * vx + (py - s[id + 1]) * vy;
          if (ux !== undefined) {
            if (Math.abs(ux * vx + uy * vy) < minCos) continue;
            if (t < -OVERSHOOT || t > len + OVERSHOOT) continue;
          }
          const tc = Math.max(0, Math.min(len, t));
          const d = Math.hypot(px - s[id] - tc * vx, py - s[id + 1] - tc * vy);
          if (d < best) best = d;
        }
    return best <= maxDist ? best : Infinity;
  }
}

// points every ~step meters along the line (always including both ends), with the direction of the line there
function sample(pts, step) {
  const total = lineLength(pts), n = Math.max(1, Math.ceil(total / step)), samples = [];
  let i = 1, before = 0, len = dist(pts[0], pts[1]);
  for (let k = 0; k <= n; k++) {
    const s = total * k / n;
    while (i < pts.length - 1 && s > before + len) { before += len; i++; len = dist(pts[i - 1], pts[i]); }
    const t = Math.max(0, Math.min(1, (s - before) / len)), a = pts[i - 1], b = pts[i];
    samples.push({ s, x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len });
  }
  return samples;
}

// part of the line between distances s0 and s1 from its start
function slice(pts, s0, s1) {
  const out = [];
  let before = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = dist(a, b), after = before + len;
    const at = s => [a[0] + (b[0] - a[0]) * (s - before) / len, a[1] + (b[1] - a[1]) * (s - before) / len];
    if (!out.length && s0 < after) out.push(s0 <= before ? a : at(s0));
    if (out.length) {
      if (s1 <= after) { out.push(s1 >= after ? b : at(s1)); break; }
      out.push(b);
    }
    before = after;
  }
  return out.filter((p, i) => !i || dist(p, out[i - 1]) > 0.01);
}

const runs = flags => flags.reduce((all, f, i) => {
  if (i && all[all.length - 1].covered === f) all[all.length - 1].to = i;
  else all.push({ covered: f, from: i, to: i });
  return all;
}, []);

// parts of the line that have no parallel line of the index within the tolerance
function uncovered(pts, index, tolerance, distances) {
  const samples = sample(pts, STEP), last = samples.length - 1;
  const flags = samples.map(p => {
    const d = index.nearest(p.x, p.y, distances ? 30 : tolerance, p.ux, p.uy);
    if (distances) distances.push(d);
    return d <= tolerance;
  });
  // short matches in the middle are coincidences (e.g. a path joining at a shallow angle)
  for (const r of runs(flags))
    if (r.covered && r.from > 0 && r.to < last && samples[r.to].s - samples[r.from].s < MIN_COVERED)
      for (let i = r.from; i <= r.to; i++) flags[i] = false;

  const pieces = [];
  for (const r of runs(flags)) {
    if (r.covered) continue;
    // e.g. a short corner piece where the existing ways meet at a different angle
    let near = 0;
    for (let i = r.from; i <= r.to; i++) if (index.nearest(samples[i].x, samples[i].y, tolerance) <= tolerance) near++;
    if (near >= MAX_NEAR * (r.to - r.from + 1)) continue;
    if (r.from === 0 && r.to === last) {
      if (samples[last].s >= MIN_WHOLE) pieces.push(pts);
      continue;
    }
    // extend to the neighbouring matched points, so that the piece ends where the existing way does
    const s0 = samples[Math.max(0, r.from - 1)].s, s1 = samples[Math.min(last, r.to + 1)].s;
    if (s1 - s0 >= MIN_NEW) pieces.push(slice(pts, s0, s1));
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------
// data

async function getJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const query = params => getJSON(`${CITY_LAYER}/query?${new URLSearchParams({ where: "1=1", ...params })}`);
  const { count } = await query({ returnCountOnly: true, f: "json" });
  const features = [];
  for (;;) {
    const page = await query({
      outFields: "OBJECTID,GLOBALID,WALK_TYPE,YEAR,TYPE_EN,CREATED_DATE,LAST_EDITED_DATE",
      orderByFields: "OBJECTID", resultOffset: features.length, resultRecordCount: 1000,
      outSR: 4326, geometryPrecision: 7, f: "geojson",
    });
    if (!page.features) throw new Error(`Unexpected response from the city server: ${JSON.stringify(page).slice(0, 300)}`);
    features.push(...page.features.map(({ type, properties, geometry }) => ({ type, properties, geometry })));
    process.stdout.write(`\rDownloading city dataset: ${features.length}/${count}`);
    if (!page.features.length || features.length >= count) break;
  }
  console.log();
  if (features.length !== count) throw new Error(`Expected ${count} features, got ${features.length}`);
  return { type: "FeatureCollection", features };
}

const writeCollection = (file, collection) =>
  fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${collection.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);

async function downloadOSM(lines) {
  // only the 1 km tiles that have something to compare, to keep the query light
  const TILE = 1000, PAD = 100, tiles = new Map();
  for (const pts of lines)
    for (const p of sample(pts, 50)) {
      const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
      tiles.set(`${cx},${cy}`, [cx, cy]);
    }
  const boxes = [...tiles.values()].map(([cx, cy]) => {
    const [w, s] = toLonLat([cx * TILE - PAD, cy * TILE - PAD]), [e, n] = toLonLat([(cx + 1) * TILE + PAD, (cy + 1) * TILE + PAD]);
    return `way[highway~"^(${OSM_HIGHWAYS})$"](${s},${w},${n},${e});`;
  });
  const data = `[out:json][timeout:600];(${boxes.join("")});out tags geom qt;`;
  for (const url of OVERPASS) {
    console.log(`Downloading OSM ways in ${boxes.length} tiles from ${new URL(url).host} ...`);
    try {
      const osm = await getJSON(url, {
        method: "POST", body: new URLSearchParams({ data }),
        headers: { "User-Agent": "ottawa-sidewalks-update" }, signal: AbortSignal.timeout(600000),
      });
      if (osm.remark) throw new Error(osm.remark); // e.g. the query ran out of time and the result is incomplete
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`  OSM data as of ${osm.osm3s?.timestamp_osm_base}`);
      return osm;
    } catch (e) {
      console.log(`  failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

function histogram(title, distances) {
  console.log(`\n${title} (share of ${distances.length} sample points)`);
  const edges = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, Infinity];
  edges.forEach((edge, i) => {
    const n = distances.filter(d => d <= edge && d > (i ? edges[i - 1] : -1)).length;
    const label = edge === Infinity ? "   none" : `≤ ${String(edge).padStart(4)}m`;
    console.log(`  ${label} ${(100 * n / distances.length).toFixed(1).padStart(5)}% ${"#".repeat(Math.round(60 * n / distances.length))}`);
  });
}

// connects the new ways to each other: shared coordinates become shared nodes, and an endpoint lying on
// another new way gets joined to it
function buildOSM(ways) {
  const nodes = new Map(); // "x,y" (cm) -> node
  const nodeAt = p => {
    const k = `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
    if (!nodes.has(k)) nodes.set(k, { id: -(nodes.size + 1), p });
    return nodes.get(k);
  };
  const lines = ways.map(pts => pts.map(nodeAt));

  const cell = 5, grid = new Map(); // -> [line index, position of the segment's first node]
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const cellsOf = (a, b) => {
    const keys = [];
    for (let cx = Math.floor((Math.min(a[0], b[0]) - SNAP) / cell); cx <= Math.floor((Math.max(a[0], b[0]) + SNAP) / cell); cx++)
      for (let cy = Math.floor((Math.min(a[1], b[1]) - SNAP) / cell); cy <= Math.floor((Math.max(a[1], b[1]) + SNAP) / cell); cy++)
        keys.push(`${cx},${cy}`);
    return keys;
  };
  // registers the segment of line l that starts at the given node
  const register = (l, first, next) => {
    for (const k of cellsOf(first.p, next.p)) {
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push([l, first]);
    }
  };
  lines.forEach((line, l) => {
    for (let i = 1; i < line.length; i++) register(l, line[i - 1], line[i]);
  });

  let joined = 0;
  lines.forEach((line, l) => {
    for (const end of [0, line.length - 1]) {
      const node = line[end], [px, py] = node.p;
      let best = null;
      for (const [other, first] of grid.get(key(px, py)) || []) {
        const target = lines[other];
        if (other === l || target.includes(node)) continue; // own line or already connected
        const i = target.indexOf(first), a = first.p, b = target[i + 1].p;
        const len = dist(a, b), t = Math.max(0, Math.min(len, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / len));
        const d = Math.hypot(px - a[0] - (b[0] - a[0]) * t / len, py - a[1] - (b[1] - a[1]) * t / len);
        if (d <= SNAP && (!best || d < best.d)) best = { d, other, i, t, len };
      }
      if (!best) continue;
      const { other, i, t, len } = best, target = lines[other];
      // reuse the target's node if the endpoint is right next to it, otherwise insert the endpoint into the target
      if (t <= SNAP) line[end] = target[i];
      else if (len - t <= SNAP) line[end] = target[i + 1];
      else {
        target.splice(i + 1, 0, node);
        register(other, node, target[i + 2]);
      }
      joined++;
    }
  });

  const used = new Set(lines.flat());
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  for (const node of used) {
    const [lon, lat] = toLonLat(node.p);
    xml.push(`  <node id='${node.id}' action='modify' visible='true' lat='${lat}' lon='${lon}' />`);
  }
  const tags = Object.entries(TAGS).map(([k, v]) => `    <tag k='${k}' v='${v}' />`);
  lines.forEach((line, i) => {
    const refs = line.filter((node, j) => !j || node !== line[j - 1]);
    if (refs.length < 2) return;
    xml.push(`  <way id='${-(i + 1)}' action='modify' visible='true'>`, ...refs.map(node => `    <nd ref='${node.id}' />`), ...tags, "  </way>");
  });
  xml.push("</osm>", "");
  const shared = [...used].filter(node => lines.filter(line => line.includes(node)).length > 1).length;
  return { xml: xml.join("\n"), nodes: used.size, shared, joined };
}

// ---------------------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const local = file => path.resolve(__dirname, file);
  const km = lines => (lines.reduce((sum, pts) => sum + lineLength(pts), 0) / 1000).toFixed(1);
  const showHistogram = args.includes("--histogram");

  const oldCity = JSON.parse(fs.readFileSync(arg("--old") || local(OLD_SNAPSHOT)));
  let newCity;
  if (arg("--new")) newCity = JSON.parse(fs.readFileSync(arg("--new")));
  else {
    newCity = await downloadCity();
    const file = local(`pedestrian-network-${new Date().toLocaleDateString("en-CA")}.json`);
    writeCollection(file, newCity);
    console.log(`Saved ${path.basename(file)}`);
  }

  // 1. what's new in the city dataset since the previous import
  const oldIndex = new SegmentIndex();
  for (const pts of oldCity.features.flatMap(toLines)) oldIndex.addLine(pts);
  const sidewalks = newCity.features.filter(f => f.properties.WALK_TYPE === "SIDEWALK").flatMap(toLines);
  const oldDistances = showHistogram ? [] : undefined;
  const added = sidewalks.flatMap(pts => uncovered(pts, oldIndex, OLD_TOLERANCE, oldDistances));
  console.log(`City sidewalks: ${sidewalks.length} ways, ${km(sidewalks)} km`);
  console.log(`Added since ${path.basename(arg("--old") || OLD_SNAPSHOT)}: ${added.length} ways, ${km(added)} km`);
  if (showHistogram) histogram("Distance from current city sidewalks to the old snapshot", oldDistances);
  if (!added.length) return console.log("Nothing new");

  // 2. what of that is still missing in OSM
  const osmFile = arg("--osm");
  let osm;
  if (osmFile && fs.existsSync(osmFile)) osm = JSON.parse(fs.readFileSync(osmFile));
  else {
    osm = await downloadOSM(added);
    if (osmFile) fs.writeFileSync(osmFile, JSON.stringify(osm));
  }
  const osmWays = osm.elements.filter(el => el.type === "way" && el.geometry);
  if (!osmWays.length) throw new Error("No ways in the OSM data, refusing to treat everything as missing");
  const osmIndex = new SegmentIndex();
  for (const way of osmWays) osmIndex.addLine(way.geometry.filter(Boolean).map(p => toXY([p.lon, p.lat])));
  const osmDistances = showHistogram ? [] : undefined;
  const missing = added.flatMap(pts => uncovered(pts, osmIndex, OSM_TOLERANCE, osmDistances));
  console.log(`OSM ways to compare with: ${osmWays.length}`);
  console.log(`Missing in OSM: ${missing.length} ways, ${km(missing)} km`);
  if (showHistogram) histogram("Distance from the added city sidewalks to OSM ways", osmDistances);

  // 3. write them out
  const result = buildOSM(missing);
  const out = arg("--out") || local(OUTPUT);
  fs.writeFileSync(out, result.xml);
  console.log(`Saved ${path.basename(out)}: ${missing.length} ways, ${result.nodes} nodes, ${result.shared} of them shared between ways (${result.joined} endpoints snapped)`);
}

if (require.main === module)
  main().catch(e => {
    console.error(`\n${e.message}`);
    process.exit(1);
  });
else module.exports = { buildOSM, uncovered, SegmentIndex, toXY };
