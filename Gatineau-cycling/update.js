// Compares the City of Gatineau cycling network (built off-road paths) with OSM and writes two files to
// review and upload from JOSM:
//
//   new-paths.osm    city paths that are not in OSM at all, as new ways
//   bike-access.osm  existing OSM footways and crossings that run along a city bike path but don't allow
//                    bikes, with their tags changed (they keep their ids and versions, so they upload as
//                    modifications; JOSM reports a conflict if one was edited in the meantime)
//
// Painted lanes, shoulders and designated roadways are tags on roads and are not handled here.
//
//   node update.js [--new <snapshot>]
//
//   --new   city dataset; downloaded and saved as pistes-cyclables-<today>.json if omitted
//
// Licence: CC BY 4.0, the city gave permission to use its open data in OSM with attribution on the
// Contributors wiki page: https://wiki.openstreetmap.org/wiki/Gatineau/Import
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// https://www.donneesquebec.ca/recherche/dataset/vgat_906945613 (Pistes cyclables)
const CITY_PACKAGE = "https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=vgat_906945613";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const AREA = 'area["name"="Gatineau"]["admin_level"="8"]["boundary"="administrative"]';
const NEW_OUTPUT = "new-paths.osm";
const FIX_OUTPUT = "bike-access.osm";

// city TYPE -> tags of a new way, and the tags added to an OSM footway that runs along it
// (no tags: never added as a new way)
const MUP = { highway: "path", foot: "designated", bicycle: "designated", segregated: "no" };
const TYPES = {
  "Sentier polyvalent": { tags: MUP, fix: MUP },
  "Piste multifonctionnelle": { tags: MUP, fix: MUP },
  "Sentier récréatif en site propre": { tags: MUP, fix: MUP },
  "Piste cyclable": { tags: { highway: "cycleway" }, fix: { bicycle: "designated" } },
  "Jointure": { fix: { bicycle: "designated" } }, // short connectors between paths, mostly across roads
  "Autre": { tags: { highway: "path", bicycle: "yes" }, fix: { bicycle: "yes" } }, // mostly unpaved trails
};
// hiking trails ("Sentier de randonnée") and on-road types are left out
const BUILT = "T.Q.C"; // "tel que construit"; the others are "Plan d'ensemble" (planned) and "En construction"
const SURFACE = { Flexible: "asphalt", Gravier: "gravel", Rigide: "concrete" };

// all distances in meters
const STEP = 2;            // sampling interval along the lines
const TOLERANCE = 5;       // city path "exists in OSM" if there is a parallel OSM way this close
const LOOSE = 15;          // ...or if a path (not a sidewalk) runs this close beside most of it, drawn a bit off
const LOOSE_SHARE = 0.5;
const MAX_ANGLE = 30;      // degrees; what still counts as parallel
const OVERSHOOT = 1.5;     // how far past the end of a segment a point may be and still match it
const MIN_COVERED = 6;     // shorter matched stretches in the middle of an unmatched one are ignored
const MIN_NEW = 10;        // shorter unmatched leftovers of a partially matched path are dropped
const MIN_WHOLE = 10;      // shorter paths are dropped even if completely unmatched
const MAX_NEAR = 0.8;      // unmatched pieces with this share of points next to a line in any direction are dropped
const SNAP = 0.5;          // endpoints this close to another new way are connected to it
const FIX_SHARE = 0.7;     // an OSM way is changed only if this share of it runs along a city bike path

// ---------------------------------------------------------------------------------------------------------
// geometry, in a local equirectangular projection

const RAD = Math.PI / 180, EARTH = 6371008.8, LON0 = -75.7, LAT0 = 45.45;
const KX = EARTH * RAD * Math.cos(LAT0 * RAD), KY = EARTH * RAD;
const toXY = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const toLonLat = ([x, y]) => [+(LON0 + x / KX).toFixed(7), +(LAT0 + y / KY).toFixed(7)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineLength = pts => pts.reduce((sum, p, i) => i ? sum + dist(pts[i - 1], p) : 0, 0);
const km = lines => (lines.reduce((sum, pts) => sum + lineLength(pts), 0) / 1000).toFixed(1);

function toLines(geometry) {
  if (!geometry) return [];
  const parts = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
  return parts
    .map(part => part.map(toXY).filter((p, i, all) => !i || dist(p, all[i - 1]) > 0.01))
    .filter(pts => pts.length > 1);
}

// grid index of line segments, each remembers what it belongs to
class SegmentIndex {
  constructor(cell = 25) { this.cell = cell; this.cells = new Map(); }
  addLine(pts, payload) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
      if (len < 0.01) continue;
      const seg = { ax, ay, ux: (bx - ax) / len, uy: (by - ay) / len, len, payload }, c = this.cell;
      for (let cx = Math.floor(Math.min(ax, bx) / c); cx <= Math.floor(Math.max(ax, bx) / c); cx++)
        for (let cy = Math.floor(Math.min(ay, by) / c); cy <= Math.floor(Math.max(ay, by) / c); cy++) {
          const k = `${cx},${cy}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(seg);
        }
    }
  }
  // nearest segment within maxDist; with a direction (ux, uy) only roughly parallel segments that run
  // alongside the point count. Returns { d, payload } or undefined
  nearest(px, py, maxDist, ux, uy) {
    const c = this.cell, minCos = Math.cos(MAX_ANGLE * RAD);
    let best;
    for (let cx = Math.floor((px - maxDist) / c); cx <= Math.floor((px + maxDist) / c); cx++)
      for (let cy = Math.floor((py - maxDist) / c); cy <= Math.floor((py + maxDist) / c); cy++)
        for (const s of this.cells.get(`${cx},${cy}`) || []) {
          const t = (px - s.ax) * s.ux + (py - s.ay) * s.uy;
          if (ux !== undefined) {
            if (Math.abs(ux * s.ux + uy * s.uy) < minCos) continue;
            if (t < -OVERSHOOT || t > s.len + OVERSHOOT) continue;
          }
          const tc = Math.max(0, Math.min(s.len, t)), d = Math.hypot(px - s.ax - tc * s.ux, py - s.ay - tc * s.uy);
          if (d <= maxDist && (!best || d < best.d)) best = { d, payload: s.payload };
        }
    return best;
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
function uncovered(pts, index, tolerance) {
  const samples = sample(pts, STEP), last = samples.length - 1;
  const flags = samples.map(p => !!index.nearest(p.x, p.y, tolerance, p.ux, p.uy));
  // short matches in the middle are coincidences (e.g. a path joining at a shallow angle)
  for (const r of runs(flags))
    if (r.covered && r.from > 0 && r.to < last && samples[r.to].s - samples[r.from].s < MIN_COVERED)
      for (let i = r.from; i <= r.to; i++) flags[i] = false;

  const pieces = [];
  for (const r of runs(flags)) {
    if (r.covered) continue;
    // e.g. a short corner piece where the existing ways meet at a different angle
    let near = 0;
    for (let i = r.from; i <= r.to; i++) if (index.nearest(samples[i].x, samples[i].y, tolerance)) near++;
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

// share of the line that has a parallel line of the index within the given distance, and what most of it is
function alongside(pts, index, distance) {
  const samples = sample(pts, 1), found = new Map();
  for (const p of samples) {
    const hit = index.nearest(p.x, p.y, distance, p.ux, p.uy);
    if (hit) found.set(hit.payload, (found.get(hit.payload) || 0) + 1);
  }
  const hits = [...found.values()].reduce((a, b) => a + b, 0);
  const main = [...found.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { share: hits / samples.length, main };
}

// ---------------------------------------------------------------------------------------------------------
// data

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "gatineau-cycling-update" }, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return JSON.parse((await res.text()).replace(/^﻿/, ""));
}

async function downloadCity() {
  const { result } = await getJSON(CITY_PACKAGE);
  const resource = result.resources.find(r => /geojson/i.test(r.format));
  if (!resource) throw new Error("No GeoJSON in the city dataset");
  console.log(`City dataset: ${result.title}, file updated ${resource.last_modified || resource.created}`);
  return getJSON(resource.url);
}

async function overpass(query) {
  for (let attempt = 0; attempt < 2 * OVERPASS.length; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data: query }) });
      if (osm.remark) throw new Error(osm.remark); // e.g. the query ran out of time and the result is incomplete
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      console.log(`  OSM data as of ${osm.osm3s.timestamp_osm_base} from ${new URL(url).host}`);
      return osm;
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);
const tagXml = tags => Object.entries(tags).map(([k, v]) => `    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);

// new ways; shared coordinates become shared nodes, and an endpoint lying on another new way gets joined to it
function buildNewOSM(ways) {
  const nodes = new Map(); // "x,y" (cm) -> node
  const nodeAt = p => {
    const k = `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
    if (!nodes.has(k)) nodes.set(k, { id: -(nodes.size + 1), p });
    return nodes.get(k);
  };
  const lines = ways.map(w => w.pts.map(nodeAt));

  const cell = 5, grid = new Map(); // -> [line index, the segment's first node]
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const register = (l, first, next) => {
    const [a, b] = [first.p, next.p];
    for (let cx = Math.floor((Math.min(a[0], b[0]) - SNAP) / cell); cx <= Math.floor((Math.max(a[0], b[0]) + SNAP) / cell); cx++)
      for (let cy = Math.floor((Math.min(a[1], b[1]) - SNAP) / cell); cy <= Math.floor((Math.max(a[1], b[1]) + SNAP) / cell); cy++) {
        const k = `${cx},${cy}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push([l, first]);
      }
  };
  lines.forEach((line, l) => {
    for (let i = 1; i < line.length; i++) register(l, line[i - 1], line[i]);
  });
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
    }
  });

  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  for (const node of new Set(lines.flat())) {
    const [lon, lat] = toLonLat(node.p);
    xml.push(`  <node id='${node.id}' action='modify' visible='true' lat='${lat}' lon='${lon}' />`);
  }
  lines.forEach((line, i) => {
    const refs = line.filter((node, j) => !j || node !== line[j - 1]);
    if (refs.length < 2) return;
    xml.push(`  <way id='${-(i + 1)}' action='modify' visible='true'>`, ...refs.map(node => `    <nd ref='${node.id}' />`), ...tagXml(ways[i].tags), "  </way>");
  });
  xml.push("</osm>", "");
  return xml.join("\n");
}

// existing ways with changed tags, plus their nodes unchanged, with versions from a fresh download
function buildFixOSM(elements, changes) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  for (const el of elements.filter(el => el.type === "node"))
    xml.push(`  <node id='${el.id}' version='${el.version}' visible='true' lat='${el.lat}' lon='${el.lon}'${el.tags ? `>\n${tagXml(el.tags).join("\n")}\n  </node>` : " />"}`);
  for (const el of elements.filter(el => el.type === "way")) {
    const tags = { ...el.tags, ...changes.get(el.id) };
    xml.push(`  <way id='${el.id}' action='modify' version='${el.version}' visible='true'>`, ...el.nodes.map(n => `    <nd ref='${n}' />`), ...tagXml(tags), "  </way>");
  }
  xml.push("</osm>", "");
  return xml.join("\n");
}

// ---------------------------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const local = file => path.resolve(__dirname, file);

  let city;
  if (arg("--new")) city = JSON.parse(fs.readFileSync(arg("--new"), "utf8").replace(/^﻿/, ""));
  else {
    city = await downloadCity();
    const file = local(`pistes-cyclables-${new Date().toLocaleDateString("en-CA")}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}`);
  }

  // built off-road paths of the city
  const paths = city.features
    .filter(f => f.properties.STATUT === BUILT && TYPES[f.properties.TYPE])
    .flatMap(f => toLines(f.geometry).map(pts => ({ pts, p: f.properties })));
  const cityIndex = new SegmentIndex();
  for (const path_ of paths) cityIndex.addLine(path_.pts, path_);
  console.log(`City built off-road paths: ${paths.length} lines, ${km(paths.map(p => p.pts))} km`);

  console.log("Downloading OSM paths in Gatineau ...");
  const osm = await overpass(`[out:json][timeout:300];${AREA}->.g;way(area.g)[highway~"^(footway|path|pedestrian|cycleway|steps|construction|track|bridleway)$"];out body geom qt;`);
  const osmWays = osm.elements.filter(el => el.type === "way" && el.geometry);
  if (!osmWays.length) throw new Error("No ways in the OSM data, refusing to treat everything as missing");
  const allIndex = new SegmentIndex(), pathIndex = new SegmentIndex();
  for (const way of osmWays) {
    way.pts = way.geometry.filter(Boolean).map(p => toXY([p.lon, p.lat]));
    allIndex.addLine(way.pts, way);
    if (!["sidewalk", "crossing"].includes(way.tags.footway)) pathIndex.addLine(way.pts, way);
  }

  // 1. new paths
  const newWays = [], beside = [];
  for (const { pts, p } of paths.filter(({ p }) => TYPES[p.TYPE].tags))
    for (const piece of uncovered(pts, allIndex, TOLERANCE)) {
      if (alongside(piece, pathIndex, LOOSE).share >= LOOSE_SHARE) { beside.push(piece); continue; }
      const tags = { ...TYPES[p.TYPE].tags };
      if (SURFACE[p.REVETEMENT]) tags.surface = SURFACE[p.REVETEMENT];
      if (p.DIREC_UNIQ === "Oui" && tags.highway === "cycleway") tags.oneway = "yes";
      newWays.push({ pts: piece, tags, type: p.TYPE });
    }
  console.log(`\nMissing in OSM: ${newWays.length} ways, ${km(newWays.map(w => w.pts))} km`);
  const byType = {};
  for (const w of newWays) (byType[w.type] = byType[w.type] || []).push(w.pts);
  for (const [type, lines] of Object.entries(byType)) console.log(`  ${type}: ${lines.length} ways, ${km(lines)} km`);
  console.log(`  (skipped ${beside.length} more, ${km(beside)} km, that have an OSM path running within ${LOOSE} m beside them)`);
  fs.writeFileSync(local(NEW_OUTPUT), buildNewOSM(newWays));
  console.log(`Saved ${NEW_OUTPUT}`);

  // 2. OSM ways along city bike paths that don't allow bikes
  const allowsBikes = t => t.highway === "cycleway" || ["yes", "designated", "permissive"].includes(t.bicycle)
    || (["path", "track"].includes(t.highway) && !t.bicycle); // allowed by default in Canada
  const changes = new Map(), left = { sidewalk: [], refused: [], other: [], partly: [] }, crossingItems = [];
  for (const way of osmWays) {
    const t = way.tags;
    if (allowsBikes(t) || t.highway === "construction") continue;
    const { share, main } = alongside(way.pts, cityIndex, TOLERANCE);
    if (!main) continue;
    const item = { way, share, type: main.p.TYPE, length: lineLength(way.pts) };
    if (t.footway === "sidewalk") left.sidewalk.push(item);
    else if (t.bicycle === "no" || t.bicycle === "dismount") left.refused.push(item);
    else if (t.highway !== "footway" || (t.footway && t.footway !== "crossing")) left.other.push(item);
    else if (share < FIX_SHARE) left.partly.push(item);
    else if (t.footway === "crossing") crossingItems.push(item); // decided below, by what they connect
    else {
      const change = { ...TYPES[main.p.TYPE].fix };
      if (change.highway && !t.surface && SURFACE[main.p.REVETEMENT]) change.surface = SURFACE[main.p.REVETEMENT];
      changes.set(way.id, change);
    }
  }

  // Crossings stay crossings and get the weakest bike access of the ways at their ends (counting the changes
  // above): designated when designated ways are on both sides, yes when bikes are allowed on both sides,
  // otherwise they are left alone. Crossings chained across a median island are treated as one.
  const nodeWays = new Map();
  for (const way of osmWays) for (const n of way.nodes || []) {
    if (!nodeWays.has(n)) nodeWays.set(n, []);
    nodeWays.get(n).push(way);
  }
  const access = way => {
    const t = { ...way.tags, ...changes.get(way.id) };
    if (t.bicycle === "no" || t.bicycle === "dismount") return 0;
    if (t.highway === "cycleway" || t.bicycle === "designated") return 2;
    return allowsBikes(t) ? 1 : 0;
  };
  const cap = item => TYPES[item.type].fix.bicycle === "designated" ? 2 : 1;
  const groupOf = new Map(crossingItems.map(item => [item.way.id, [item]]));
  for (const ways of nodeWays.values()) {
    const items = ways.map(w => groupOf.get(w.id)).filter(Boolean);
    for (const other of items.slice(1)) if (other !== items[0]) {
      items[0].push(...other);
      for (const item of other) groupOf.set(item.way.id, items[0]);
    }
  }
  const crossingResult = { designated: 0, yes: 0, "an end touches only footways or sidewalks without bikes": [], "an end touches no path (a road, or nothing)": [] };
  for (const group of new Set(groupOf.values())) {
    const members = new Set(group.map(item => item.way.id)), ends = [];
    for (const { way } of group) for (const n of [way.nodes[0], way.nodes[way.nodes.length - 1]])
      if (nodeWays.get(n).filter(w => members.has(w.id)).length === 1) ends.push(n);
    const levels = ends.map(n => Math.max(-1, ...nodeWays.get(n).filter(w => !members.has(w.id)).map(access)));
    const level = Math.min(...levels, ...group.map(cap));
    if (ends.length >= 2 && level >= 1) {
      const bicycle = level === 2 ? "designated" : "yes";
      for (const { way } of group) changes.set(way.id, { bicycle });
      crossingResult[bicycle] += group.length;
    } else crossingResult[levels.includes(-1) || ends.length < 2 ? "an end touches no path (a road, or nothing)" : "an end touches only footways or sidewalks without bikes"].push(...group);
  }

  const fixed = osmWays.filter(w => changes.has(w.id));
  const crossings = fixed.filter(w => w.tags.footway === "crossing");
  console.log(`\nOSM ways along city bike paths that don't allow bikes: ${fixed.length} to change, ${km(fixed.map(w => w.pts))} km`);
  console.log(`  footways: ${fixed.length - crossings.length} (to highway=path + foot/bicycle=designated on shared-use paths, else bicycle=* added)`);
  console.log(`  crossings: ${crossings.length} (bicycle=designated: ${crossingResult.designated}, bicycle=yes: ${crossingResult.yes})`);
  const show = (title, items, limit = Infinity) => {
    if (!items.length) return;
    console.log(`  ${title}: ${items.length}, ${km(items.map(i => i.way.pts))} km${items.length > limit ? `, the ${limit} longest:` : ""}`);
    for (const { way, share, type, length } of items.sort((a, b) => b.length * b.share - a.length * a.share).slice(0, limit)) {
      const [lon, lat] = toLonLat(way.pts[Math.floor(way.pts.length / 2)]);
      console.log(`    w${way.id} ${way.tags.highway}${way.tags.footway ? `/${way.tags.footway}` : ""}${way.tags.bicycle ? ` bicycle=${way.tags.bicycle}` : ""}: ${Math.round(length)} m, ${Math.round(share * 100)}% along a city "${type}"; ${lat.toFixed(5)},${lon.toFixed(5)}`);
    }
  };
  console.log("Not changed, check by hand:");
  show("sidewalks (a separate cycle path may be missing next to them, or the sidewalk is the path)", left.sidewalk.filter(i => i.share >= 0.5 && i.length >= 20), 15);
  show("bicycle=no or dismount set by a mapper", left.refused.filter(i => i.share >= 0.5));
  show("steps, pedestrian areas and other footway kinds", left.other.filter(i => i.share >= 0.5 && i.length >= 20));
  show("footways that run only partly along a city path", left.partly.filter(i => i.share * i.length >= 50));
  for (const reason of ["an end touches only footways or sidewalks without bikes", "an end touches no path (a road, or nothing)"])
    show(`crossings where ${reason}`, crossingResult[reason], 10);

  if (fixed.length) {
    console.log("Downloading the current version of the ways to change ...");
    const ids = fixed.map(w => w.id).join(",");
    const full = await overpass(`[out:json][timeout:120];way(id:${ids});(._;>;);out meta;`);
    fs.writeFileSync(local(FIX_OUTPUT), buildFixOSM(full.elements, changes));
  } else fs.writeFileSync(local(FIX_OUTPUT), buildFixOSM([], changes));
  console.log(`Saved ${FIX_OUTPUT}`);
}

main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
