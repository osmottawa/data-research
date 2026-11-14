// City of Ottawa "pathway links" are the narrow city-owned corridors between lots that connect two streets
// (or a street and a park). This finds the links that have no way running through them in OSM and writes
// their centrelines to an .osm file to check against imagery and merge manually in JOSM: the city data
// only says that the corridor exists, not that there is a built path in it.
//
//   node update.js [--new <dataset>] [--out <file>]
//
//   --new   current city dataset; downloaded and saved over pathway-links-source.json if omitted
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

const SOURCE = "pathway-links-source.json";
const OUTPUT = "pathway-links.osm";

// source: https://open.ottawa.ca/datasets/ottawa::pathway-links
const CITY_LAYER = "https://maps.ottawa.ca/arcgis/rest/services/Parks_Inventory/MapServer/23";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused

// what 85% of the ways through the mapped links are; no surface, it is asphalt in town but unknown for these
const TAGS = { highway: "path" };

// all distances in meters
const STEP = 1;          // sampling interval along the centreline
const SLICE = 4;         // distance between the cross-sections the centreline is built from
const MAX_ANGLE = 35;    // degrees; an OSM way has to run along the link, not across it (like the sidewalks at its ends)
const MARGIN = 2;        // how far outside of the corridor an OSM way can be and still count
const HAS_PATH = 0.5;    // share of the centreline that needs an OSM way beside it for the link to count as mapped
const MIN_LENGTH = 8;    // shorter links are not worth a way
const MIN_WIDTH = 1.5;   // narrower polygons are slivers, not corridors
const MAX_TURN = 50;     // degrees; a centreline that turns sharper than this is not trusted

// ---------------------------------------------------------------------------------------------------------
// geometry, in a local equirectangular projection

const RAD = Math.PI / 180, EARTH = 6371008.8, LON0 = -75.7, LAT0 = 45.4;
const KX = EARTH * RAD * Math.cos(LAT0 * RAD), KY = EARTH * RAD;
const toXY = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const toLonLat = ([x, y]) => [+(LON0 + x / KX).toFixed(7), +(LAT0 + y / KY).toFixed(7)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineLength = pts => pts.reduce((sum, p, i) => i ? sum + dist(pts[i - 1], p) : 0, 0);

function simplify(pts, tolerance) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], len = dist(a, b) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(pts.slice(at), tolerance)];
}

const inRing = (p, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

// moves the end of the line (its last point if `last`) along the line's direction to the outline of the polygon
function extend(line, ring, last) {
  const [p, q] = last ? [line[line.length - 1], line[line.length - 2]] : [line[0], line[1]];
  const len = dist(p, q), dx = (p[0] - q[0]) / len, dy = (p[1] - q[1]) / len;
  let nearest = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], ex = ring[i][0] - a[0], ey = ring[i][1] - a[1], det = ex * dy - ey * dx;
    if (Math.abs(det) < 1e-9) continue;
    const t = (ex * (a[1] - p[1]) - ey * (a[0] - p[0])) / det, k = (dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / det;
    if (t > 0 && k >= 0 && k <= 1 && t < nearest) nearest = t;
  }
  if (nearest < Infinity) line[last ? line.length - 1 : 0] = [p[0] + dx * nearest, p[1] + dy * nearest];
}

// Centreline of a corridor polygon: its long axis is the direction in which its outline is spread the most,
// the centreline goes through the middles of the cross-sections perpendicular to that axis.
// Returns the line, the typical width of the corridor and whether the line can be trusted: it is fine for
// straight and gently bent corridors, but not for branching or sharply bent ones.
function centreline(ring) {
  // principal axis of points spread evenly along the outline
  const outline = [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], n = Math.max(1, Math.ceil(dist(a, b)));
    for (let k = 0; k < n; k++) outline.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of outline) { sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2; }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2, ux = Math.cos(angle), uy = Math.sin(angle);

  // u: along the axis, v: across it
  const uv = ring.map(([x, y]) => [(x - cx) * ux + (y - cy) * uy, -(x - cx) * uy + (y - cy) * ux]);
  const us = uv.map(p => p[0]), from = Math.min(...us), to = Math.max(...us);
  const count = Math.max(4, Math.round((to - from) / SLICE));
  let slices = [], branching = false;
  for (let k = 0; k <= count; k++) {
    const u = Math.min(to - 0.2, Math.max(from + 0.2, from + (to - from) * k / count));
    const crossings = [];
    for (let i = 1; i < uv.length; i++) {
      const a = uv[i - 1], b = uv[i];
      if ((a[0] > u) !== (b[0] > u)) crossings.push(a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]));
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    // crossed more than once: the corridor branches or doubles back, take the widest part
    let best = 0;
    for (let i = 2; i + 1 < crossings.length; i += 2) if (crossings[i + 1] - crossings[i] > crossings[best + 1] - crossings[best]) best = i;
    if (crossings.length > 2) branching = true;
    const v = (crossings[best] + crossings[best + 1]) / 2;
    slices.push({ at: [cx + u * ux - v * uy, cy + u * uy + v * ux], width: crossings[best + 1] - crossings[best] });
  }
  if (slices.length < 2) return { line: [], width: 0, clean: false };
  const widths = slices.map(s => s.width).sort((a, b) => a - b), width = widths[Math.floor(widths.length / 2)];

  // where the corridor ends at an angle its cross-sections taper off and their middles drift to a corner:
  // drop those and continue the line straight to the end instead
  const wide = slices.filter(s => s.width >= 0.85 * width);
  if (wide.length >= 2) slices = slices.slice(slices.indexOf(wide[0]), slices.indexOf(wide[wide.length - 1]) + 1);
  const line = simplify(slices.map(s => s.at), 0.5);
  extend(line, ring, false);
  extend(line, ring, true);

  let outside = 0, total = 0, sharp = 0;
  for (let i = 1; i < line.length; i++) {
    for (let t = 0.05; t < 1; t += 0.1) {
      total++;
      if (!inRing([line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t], ring)) outside++;
    }
    if (i > 1) {
      const turn = Math.abs(Math.atan2(line[i][1] - line[i - 1][1], line[i][0] - line[i - 1][0]) - Math.atan2(line[i - 1][1] - line[i - 2][1], line[i - 1][0] - line[i - 2][0])) / RAD;
      if (Math.min(turn, 360 - turn) > MAX_TURN) sharp++;
    }
  }
  return { line, width, clean: !branching && sharp === 0 && outside <= 0.05 * total };
}

// grid index of OSM way segments
class SegmentIndex {
  constructor(cell = 25) { this.cell = cell; this.cells = new Map(); }
  add(a, b, way) {
    const len = dist(a, b);
    if (len < 0.01) return;
    const seg = { a, ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len, len, way }, c = this.cell;
    for (let cx = Math.floor(Math.min(a[0], b[0]) / c); cx <= Math.floor(Math.max(a[0], b[0]) / c); cx++)
      for (let cy = Math.floor(Math.min(a[1], b[1]) / c); cy <= Math.floor(Math.max(a[1], b[1]) / c); cy++) {
        const k = `${cx},${cy}`;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(seg);
      }
  }
  // the way of the nearest segment that runs roughly in the given direction within maxDist of the point
  along(px, py, ux, uy, maxDist) {
    const c = this.cell, minCos = Math.cos(MAX_ANGLE * RAD);
    let best = Infinity, way;
    for (let cx = Math.floor((px - maxDist) / c); cx <= Math.floor((px + maxDist) / c); cx++)
      for (let cy = Math.floor((py - maxDist) / c); cy <= Math.floor((py + maxDist) / c); cy++)
        for (const s of this.cells.get(`${cx},${cy}`) || []) {
          if (Math.abs(ux * s.ux + uy * s.uy) < minCos) continue;
          const t = Math.max(0, Math.min(s.len, (px - s.a[0]) * s.ux + (py - s.a[1]) * s.uy));
          const d = Math.hypot(px - s.a[0] - t * s.ux, py - s.a[1] - t * s.uy);
          if (d <= maxDist && d < best) { best = d; way = s.way; }
        }
    return way;
  }
}

// ---------------------------------------------------------------------------------------------------------
// data

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-pathway-links-update" }, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const features = [];
  for (;;) {
    const params = new URLSearchParams({
      where: "1=1", outFields: "*", orderByFields: "OBJECTID", resultOffset: features.length,
      outSR: 4326, geometryPrecision: 7, f: "geojson",
    });
    const page = await getJSON(`${CITY_LAYER}/query?${params}`);
    if (!page.features) throw new Error("Unexpected response from the city server");
    features.push(...page.features.map(({ type, properties, geometry }) => ({ type, properties, geometry })));
    if (!page.exceededTransferLimit || !page.features.length) break;
  }
  return { type: "FeatureCollection", features };
}

// all OSM highways in the boxes around the links
async function downloadOSM(links) {
  const BATCH = 150, PAD = 30, ways = new Map();
  const boxes = links.map(({ ring }) => {
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const [w, s] = toLonLat([Math.min(...xs) - PAD, Math.min(...ys) - PAD]), [e, n] = toLonLat([Math.max(...xs) + PAD, Math.max(...ys) + PAD]);
    return `way[highway](${s},${w},${n},${e});`;
  });
  for (let from = 0; from < boxes.length; from += BATCH) {
    const data = `[out:json][timeout:180];(${boxes.slice(from, from + BATCH).join("")});out tags geom qt;`;
    let osm;
    for (let attempt = 0; !osm && attempt < 2 * OVERPASS.length; attempt++) {
      const url = OVERPASS[attempt % OVERPASS.length];
      console.log(`Downloading OSM ways around links ${from + 1}-${Math.min(from + BATCH, boxes.length)} of ${boxes.length} from ${new URL(url).host} ...`);
      try {
        osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
        if (osm.remark) throw new Error(osm.remark); // e.g. the query ran out of time and the result is incomplete
        const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
        if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      } catch (e) {
        console.log(`  failed: ${e.message}`);
        osm = undefined;
      }
    }
    if (!osm) throw new Error("Could not download OSM data, try again later");
    for (const el of osm.elements) if (el.geometry) ways.set(el.id, el);
  }
  return [...ways.values()];
}

function buildOSM(links) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  const tags = Object.entries(TAGS).map(([k, v]) => `    <tag k='${k}' v='${v}' />`);
  let node = 0;
  const ways = [];
  for (const link of links) {
    const refs = link.line.map(p => {
      const [lon, lat] = toLonLat(p);
      xml.push(`  <node id='${--node}' action='modify' visible='true' lat='${lat}' lon='${lon}' />`);
      return `    <nd ref='${node}' />`;
    });
    ways.push(`  <way id='${-(ways.length + 1)}' action='modify' visible='true'>`, ...refs, ...tags, "  </way>");
  }
  xml.push(...ways, "</osm>", "");
  return xml.join("\n");
}

// ---------------------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const local = file => path.resolve(__dirname, file);

  let city;
  if (arg("--new")) city = JSON.parse(fs.readFileSync(arg("--new")));
  else {
    city = await downloadCity();
    fs.writeFileSync(local(SOURCE), `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${SOURCE}`);
  }

  const links = city.features.filter(f => f.geometry?.type === "Polygon").map(f => {
    const ring = f.geometry.coordinates[0].map(toXY), { line, width, clean } = centreline(ring);
    return { p: f.properties, ring, line, width, clean, length: lineLength(line) };
  }).filter(link => link.width >= MIN_WIDTH && link.length >= MIN_LENGTH);
  console.log(`City pathway links: ${city.features.length}, ${city.features.length - links.length} of them too small or narrow to be a corridor`);

  const index = new SegmentIndex();
  for (const way of await downloadOSM(links)) {
    const pts = way.geometry.filter(Boolean).map(p => toXY([p.lon, p.lat]));
    for (let i = 1; i < pts.length; i++) index.add(pts[i - 1], pts[i], way);
  }

  // share of each centreline that has an OSM way running along it inside of the corridor
  const kinds = {};
  for (const link of links) {
    let covered = 0, total = 0;
    const found = {};
    for (let i = 1; i < link.line.length; i++) {
      const a = link.line[i - 1], b = link.line[i], len = dist(a, b), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      for (let s = STEP / 2; s < len; s += STEP) {
        total++;
        const way = index.along(a[0] + ux * s, a[1] + uy * s, ux, uy, link.width / 2 + MARGIN);
        if (!way) continue;
        covered++;
        found[way.tags.highway] = (found[way.tags.highway] || 0) + 1;
      }
    }
    link.covered = total ? covered / total : 0;
    link.kind = Object.entries(found).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (link.covered >= HAS_PATH) kinds[link.kind] = (kinds[link.kind] || 0) + 1;
  }

  const describe = l => {
    const [lon, lat] = toLonLat(l.line[Math.floor(l.line.length / 2)]);
    const partly = l.covered >= 0.1 ? `, ${Math.round(l.covered * 100)}% of it has a ${l.kind} in OSM` : "";
    return `  #${l.p.FACILITYID} ${(l.p.ADDRESS || "").trim()}: ${Math.round(l.length)} m long, ${l.width.toFixed(1)} m wide${partly}; ${lat.toFixed(5)},${lon.toFixed(5)}`;
  };
  const mapped = links.filter(l => l.covered >= HAS_PATH);
  const unmapped = links.filter(l => l.covered < HAS_PATH).sort((a, b) => b.length - a.length);
  const missing = unmapped.filter(l => l.clean), odd = unmapped.filter(l => !l.clean);
  console.log(`Have a way through them in OSM: ${mapped.length} (${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(", ")})`);
  console.log(`No way through them in OSM: ${missing.length}`);
  for (const l of missing) console.log(describe(l));
  if (odd.length) console.log(`\nBranching or sharply bent corridors that look unmapped too, not in the file, check by hand: ${odd.length}`);
  for (const l of odd) console.log(describe(l));

  const out = arg("--out") || local(OUTPUT);
  fs.writeFileSync(out, buildOSM(missing));
  console.log(`\nSaved ${path.basename(out)}: ${missing.length} ways`);
}

if (require.main === module)
  main().catch(e => {
    console.error(`\n${e.message}`);
    process.exit(1);
  });
else module.exports = { centreline, toXY, toLonLat, lineLength };
