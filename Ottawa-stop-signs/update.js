// Stop and yield signs for one City of Ottawa ward, from the city's Intersections layer, written to
// <ward>/stop-signs-NN.osm, files of at most CHUNK signs, one compact area each, for review in JOSM. Every sign the
// files add, change or want deleted has a fixme saying why, so `fixme=*` finds them all (e.g. to load into the
// TODO list plugin), and a fixme_sv tag with a Google Street View link looking at the spot. Traffic signals are
// not mapped.
//
//   node update.js [--chunk <n>] <ward number> [<ward number> ...]
//
// The city gives each intersection one point and a control type (STOP, 4STOP, YIELD, TRAFFICSIG, ...), not the
// signs themselves, so the approaches are worked out from OSM:
//   - all-way stop: one highway=stop + stop=all on the junction node (the Ottawa convention). An intersection
//     already mapped with a stop on every approach keeps them; a partly signed one gets the junction node sign and
//     its approach signs a "delete?" fixme.
//   - two-way stop / yield: the through road is the pair of legs that carries the same name and/or runs straight
//     through, the higher road class winning; the other approaches get the sign. When two roads cross at the same
//     class, existing signs decide, else the longer street is taken as the through road and the fixme says so.
// New signs are separate nodes on the approach, SETBACK m before the junction (behind a crosswalk if there is
// one), with direction=forward/backward, the way most existing Ottawa signs are mapped.
// Existing signs are only changed or flagged, never deleted: a stop where the city has a yield (or the reverse) is
// retagged, stop=all is added or removed, a direction pointing at a far junction is flipped, and a sign on a
// through road or a stop at traffic signals gets a "delete?" fixme. An all-way stop already in OSM where the city
// has a two-way stop or yield is left alone: the city layer misses many all-way stops (Des Epinettes / Silver Bark
// has been all-way for 10+ years, the city says STOP).
// An intersection whose sign can't be placed (no OSM junction carries the city's names, only 2 road legs, junction
// node already tagged) gets a loose sign node at the city's point with a "place by hand" fixme.
// Signs on the same way, and signs of the same intersection, always go in the same file.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca
const INTERSECTIONS = "https://maps.ottawa.ca/arcgis/rest/services/Intersections/MapServer/0";
const WARDS = "https://maps.ottawa.ca/arcgis/rest/services/Wards/MapServer/0";
// overpass-api.de (and its two servers by name) is the only public instance with current data: on 2026-11-19
// private.coffee was 4 months behind, kumi.systems and openstreetmap.ru timed out, openstreetmap.fr is
// whitelist-only. When busy it answers 502/504 "at capacity" and asks for retries with growing waits.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];
const OVERPASS_TRIES = 8; // waits 15, 30, 60, then 120 s between tries: about 10 minutes in all
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const UA = "BikeOttawa-data-research/1.0";

const RANK = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, busway: 5, unclassified: 5, residential: 6, living_street: 7, service: 8 };
const ROADS = Object.keys(RANK).flatMap(h => [h, `${h}_link`]).join("|");
const IGNORED_SERVICE = /^(driveway|parking_aisle|drive-through|emergency_access)$/;

// metres
const MARGIN = 400;   // OSM and city data around the ward
const SNAP = 30;      // city point to an OSM junction
const NAMELESS = 20;  // ... when the road names don't match
const SEARCH = 30;    // existing signs this far up an approach count
const SETBACK = 10;   // new signs this far before the junction (Barrhaven's existing ones: median 10-11 m)
const CHUNK = 50;     // signs per file (default)
const MIN_LEG = 8;    // no new sign on a shorter approach (median connectors and the like)
const GUESS = ", guess which road stops";

// ---------------------------------------------------------------------------------------------------------

// the report is printed and kept: each ward's goes to <ward>/last-update.txt, which is committed in place of the
// .osm files (they're in .gitignore)
const printed = [];
function log(...a) { console.log(...a); printed.push(a.join(" ")); }
function writeLastUpdate(dir, lines) {
  const run = `node update.js ${process.argv.slice(2).join(" ")}, run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  fs.writeFileSync(path.join(dir, "last-update.txt"), [run, "", ...lines.join("\n").replace(/^\n+/, "").split("\n"), ""].join("\n"));
}

async function get(url, options = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}

async function cityQuery(layer, params) {
  const features = [];
  for (let offset = 0; ; offset += 1000) {
    const q = new URLSearchParams({ outFields: "*", outSR: 4326, f: "geojson", orderByFields: "OBJECTID", resultOffset: offset, resultRecordCount: 1000, ...params });
    const page = await get(`${layer}/query?${q}`);
    if (!page.features) throw new Error(`Unexpected response from the city server: ${JSON.stringify(page).slice(0, 200)}`);
    features.push(...page.features);
    if (page.features.length < 1000) return features;
  }
}

async function overpass(bbox) {
  const data = `[out:json][timeout:300];way["highway"~"^(${ROADS})$"](${bbox.join(",")});(._;>;);out meta;`;
  for (let attempt = 0; attempt < OVERPASS_TRIES; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    if (attempt) {
      const wait = Math.min(15 * 2 ** (attempt - 1), 120);
      console.log(`  retrying in ${wait} s`);
      await new Promise(r => setTimeout(r, wait * 1000));
    }
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data }), headers: { "User-Agent": UA }, signal: AbortSignal.timeout(600000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const osm = await res.json();
      if (osm.remark) throw new Error(osm.remark);
      const age = (Date.now() - Date.parse(osm.osm3s?.timestamp_osm_base)) / 3600000;
      if (!(age < MAX_OSM_AGE)) throw new Error(`its data is as of ${osm.osm3s?.timestamp_osm_base}, too old`);
      log(`OSM data as of ${osm.osm3s.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements;
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

// ---------------------------------------------------------------------------------------------------------
// geometry, in metres on a local plane

const KX = 111320 * Math.cos(45.3 * Math.PI / 180), KY = 110540;
const xy = (lon, lat) => [lon * KX, lat * KY];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const bearing = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
function angleBetween(a, b) { const d = Math.abs(a - b) % (2 * Math.PI); return (d > Math.PI ? 2 * Math.PI - d : d) * 180 / Math.PI; }

function inPolygon([x, y], geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let inside = false;
  for (const rings of polys) for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

// ---------------------------------------------------------------------------------------------------------
// names: "STONEWAY DR W" (city) and "Stoneway Drive West" (OSM) both become "STONEWAY"

const TYPES = new Set(("STREET ST AVENUE AVE DRIVE DR ROAD RD CRESCENT CRES COURT CRT CT CIRCLE CIRC CIR PLACE PL LANE LN WAY " +
  "TERRACE TERR TER BOULEVARD BLVD PRIVATE PRIV GATE TRAIL TRL GROVE GRV HEIGHTS HTS PARKWAY PKWY SQUARE SQ RIDGE ROW " +
  "MEWS PATH WALK LANDING POINT PT GARDENS GDNS GARDEN GDN HIGHWAY HWY CLOSE COMMON CROSSING GREEN HOLLOW VIEW VALE WYND CIRCUIT " +
  "LOOP RISE NORTH SOUTH EAST WEST N S E W").split(" "));
function base(name) {
  const t = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  while (t.length > 1 && TYPES.has(t[t.length - 1])) t.pop();
  return t.join(" ");
}
// equal, or one letter off for longer names (the city has "Celestrial Grove", OSM "Celestial Grove")
function sameName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length] <= 1;
}
const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const cityNames = p => [...new Set(`${p.LOCATION_DESCRIPTION || ""}:${p.INT_RDNAME || ""}`.split(/\s*[,:]\s*/).map(base).filter(Boolean))];
const cityPlace = p => titleCase((p.LOCATION_DESCRIPTION || "").split(/\s*[,:]\s*/).filter(Boolean).join(" / "));

// ---------------------------------------------------------------------------------------------------------

function onewayOf(w) {
  const o = w.tags.oneway;
  if (o === "yes" || o === "true" || o === "1") return 1;
  if (o === "-1" || o === "reverse") return -1;
  if (o === "no") return 0;
  if (/^(roundabout|circular)$/.test(w.tags.junction || "") || /^motorway/.test(w.tags.highway)) return 1;
  return 0;
}

async function runWard(ward, chunk) {
  const from = printed.length;
  log(`\n=== Ward ${ward}`);
  const [wardFeature] = await cityQuery(WARDS, { where: `WARD_NUM='${ward}'` });
  if (!wardFeature) throw new Error(`No ward ${ward} in the city's Wards layer`);
  const wardName = wardFeature.properties.WARD_NAME_EN;
  log(`${wardName}`);
  const coords = [];
  (function walk(c) { if (typeof c[0] === "number") coords.push(c); else c.forEach(walk); })(wardFeature.geometry.coordinates);
  const mLon = MARGIN / KX, mLat = MARGIN / KY;
  const bbox = [Math.min(...coords.map(c => c[1])) - mLat, Math.min(...coords.map(c => c[0])) - mLon, Math.max(...coords.map(c => c[1])) + mLat, Math.max(...coords.map(c => c[0])) + mLon];

  const city = (await cityQuery(INTERSECTIONS, {
    where: "1=1", geometry: [bbox[1], bbox[0], bbox[3], bbox[2]].join(","), geometryType: "esriGeometryEnvelope", inSR: 4326, spatialRel: "esriSpatialRelIntersects",
  })).filter(f => f.geometry?.coordinates?.length >= 2).map(f => ({
    p: f.properties, type: f.properties.CONTROLTYPE, ll: f.geometry.coordinates.slice(0, 2), q: xy(...f.geometry.coordinates.slice(0, 2)),
    inWard: inPolygon(f.geometry.coordinates, wardFeature.geometry),
  }));
  const counts = {};
  for (const c of city) if (c.inWard) counts[c.type] = (counts[c.type] || 0) + 1;
  log(`City intersections in the ward: ${city.filter(c => c.inWard).length} (${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")})`);

  // ----- OSM road graph
  const elements = await overpass(bbox);
  const nodes = new Map(), ways = new Map();
  for (const e of elements) {
    if (e.type === "node") nodes.set(e.id, { ...e, tags: e.tags || {}, q: xy(e.lon, e.lat) });
    else if (e.type === "way") ways.set(e.id, { ...e, tags: e.tags || {} });
  }
  const cls = w => w.tags.highway.replace(/_link$/, "");
  const inGraph = w => RANK[cls(w)] !== undefined && w.tags.area !== "yes" && !(cls(w) === "service" && IGNORED_SERVICE.test(w.tags.service || ""));
  const memb = new Map();
  for (const w of ways.values()) if (inGraph(w)) w.nodes.forEach((n, i) => { (memb.get(n) || memb.set(n, []).get(n)).push({ w, i }); });
  const legsAt = n => (memb.get(n) || []).flatMap(({ w, i }) => [...(i > 0 ? [{ w, i, step: -1 }] : []), ...(i < w.nodes.length - 1 ? [{ w, i, step: 1 }] : [])]);
  const deg = n => legsAt(n).length;
  log(`OSM: ${ways.size} road ways, ${nodes.size} nodes`);

  // street length per name, the tie-break for two equal roads crossing
  const streetLen = new Map();
  for (const w of ways.values()) {
    if (!inGraph(w) || !w.tags.name) continue;
    let len = 0;
    for (let i = 1; i < w.nodes.length; i++) len += dist(nodes.get(w.nodes[i - 1]).q, nodes.get(w.nodes[i]).q);
    streetLen.set(base(w.tags.name), (streetLen.get(base(w.tags.name)) || 0) + len);
  }

  // follows a leg from junction n until the next junction, a dead end or `max` metres; each point records the
  // way it was reached on, its index there and the walking direction along that way
  function walk(n, leg, max) {
    const pts = [{ id: n, d: 0, w: null }];
    let { w, i, step } = leg, d = 0, prev = nodes.get(n).q;
    const seen = new Set([n]);
    for (;;) {
      i += step;
      const id = w.nodes[i], node = nodes.get(id);
      d += dist(prev, node.q); prev = node.q;
      pts.push({ id, d, w, i, step });
      if (seen.has(id)) return { pts, end: "loop", endNode: id, len: d };
      seen.add(id);
      const k = deg(id);
      if (k === 1) return { pts, end: "deadend", endNode: id, len: d };
      if (k >= 3) return { pts, end: "junction", endNode: id, len: d };
      if (d > max) return { pts, end: "far", endNode: id, len: d };
      if (i + step < 0 || i + step >= w.nodes.length) {        // way ends here, carry on along the other way
        const next = legsAt(id).find(l => !(l.w === w && l.i === i));
        if (!next) return { pts, end: "deadend", endNode: id, len: d };
        ({ w, i, step } = next);
      }
    }
  }

  function describeLegs(n, complex) {
    return legsAt(n).map(leg => {
      const wk = walk(n, leg, 300);
      const far = wk.pts.find(p => p.d >= 12) || wk.pts[wk.pts.length - 1];
      const ow = onewayOf(leg.w);
      return {
        ...leg, walk: wk, name: leg.w.tags.name || "", base: base(leg.w.tags.name), rank: RANK[cls(leg.w)] + (/_link$/.test(leg.w.tags.highway) ? 0.5 : 0),
        link: /_link$/.test(leg.w.tags.highway), service: cls(leg.w) === "service",
        dir: bearing(nodes.get(n).q, nodes.get(far.id).q),
        approach: ow === 0 || ow === -leg.step,                  // traffic can drive along this leg into the junction
        internal: complex.has(wk.endNode) && wk.endNode !== n && wk.len < 60,
        // signs facing this junction; one facing away counts too (as reversed) when this junction is close and
        // the next one the way it faces is far or a dead end: its direction was tagged the wrong way round
        signs: wk.pts.filter(p => p.w && p.d <= SEARCH && /^(stop|give_way)$/.test(nodes.get(p.id).tags.highway || "")).flatMap(p => {
          const node = nodes.get(p.id), dt = node.tags.direction, toward = p.step === 1 ? "backward" : "forward";
          if (!/^(forward|backward)$/.test(dt || "") || dt === toward) return [node];
          const ahead = wk.len - p.d;
          return wk.end === "deadend" || (ahead > 40 && ahead > 3 * p.d) ? [Object.assign(Object.create(node), { reversed: toward, ahead })] : [];
        }),
      };
    });
  }

  // ----- assign OSM junctions to the nearest city intersection
  const junctions = [...memb.keys()].filter(n => deg(n) >= 3);
  const CELL = 50, grid = new Map();
  for (const c of city) { const k = `${Math.floor(c.q[0] / CELL)},${Math.floor(c.q[1] / CELL)}`; (grid.get(k) || grid.set(k, []).get(k)).push(c); }
  for (const c of city) c.nodes = [];
  for (const n of junctions) {
    const q = nodes.get(n).q, cx = Math.floor(q[0] / CELL), cy = Math.floor(q[1] / CELL);
    let best = null, bd = SNAP;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const c of grid.get(`${cx + dx},${cy + dy}`) || []) {
      const d = dist(q, c.q); if (d < bd) { bd = d; best = c; }
    }
    if (best) best.nodes.push({ n, d: bd });
  }

  // ----- edits
  const edits = new Map();     // existing node id -> { tags, notes[] }
  const added = [];            // { tags, w, a, b, t, at }  new node on way w between indices a < b, t from a
  const manual = [];           // { tags, at, q }  loose node at the city point, to be placed by hand
  const report = { unmatched: [], short: [], junctionSigns: [], manual: [], counts: {} };
  const count = k => { report.counts[k] = (report.counts[k] || 0) + 1; };
  let current = null, currentNodes = new Set(), currentAt = null;   // the city intersection being worked on, its OSM junction(s)
  const viewToward = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], m = Math.hypot(dx, dy) || 1;
    return { q: [from[0] - dx / m * 12, from[1] - dy / m * 12], heading: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 };
  };
  const streetView = v => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${(v.q[1] / KY).toFixed(5)},${(v.q[0] / KX).toFixed(5)}${v.heading != null ? `&heading=${Math.round(v.heading)}` : ""}`;
  const edit = (node, change, note) => {
    const e = edits.get(node.id) || edits.set(node.id, { tags: { ...node.tags }, notes: [], keys: new Set() }).get(node.id);
    change(e.tags); e.notes.push(note); e.keys.add(current);
    e.view = e.view || (currentNodes.has(node.id) ? { q: node.q } : viewToward(node.q, currentAt));
  };

  function place(leg, tags, note, what) {
    const wk = leg.walk;
    if (wk.len < MIN_LEG) { report.short.push(`${what} (${wk.len.toFixed(0)} m)`); count("skipped: approach too short"); return; }
    const cross = wk.pts.find(p => p.w && p.d > 1 && p.d < 20 && (nodes.get(p.id).tags.highway === "crossing" || nodes.get(p.id).tags.crossing || nodes.get(p.id).tags.railway));
    let D = Math.min(Math.max(SETBACK, cross ? cross.d + 3 : 0), wk.len - 4);
    for (const off of [0, 1.5, -1.5, 2.5, -2.5, 3.5, -3.5]) {   // keep 1.5 m clear of existing vertices
      const d = D + off;
      if (d >= 3 && d <= wk.len - 3 && wk.pts.every(p => Math.abs(p.d - d) >= 1.5)) { D = d; break; }
    }
    const k = wk.pts.findIndex(p => p.d >= D), p0 = wk.pts[k - 1], p1 = wk.pts[k];
    const t = (D - p0.d) / (p1.d - p0.d), a0 = nodes.get(p0.id), a1 = nodes.get(p1.id);
    const at = [a0.lon + (a1.lon - a0.lon) * t, a0.lat + (a1.lat - a0.lat) * t];
    // segment p0 -> p1 lies on p1.w between indices p1.i - p1.step and p1.i
    const lo = Math.min(p1.i, p1.i - p1.step);
    const url = streetView(viewToward(xy(...at), nodes.get(wk.pts[0].id).q));
    added.push({ tags: { ...tags, direction: p1.step === 1 ? "backward" : "forward", fixme: note, fixme_sv: url }, w: p1.w, a: lo, t: p1.step === 1 ? t : 1 - t, at, key: current });
  }

  // an intersection the script can't place: a loose sign node at the city's point, not on any way, for the
  // reviewer to move onto the right approach. Any existing stop or yield close by is named in the fixme.
  const KIND = { STOP: "two-way stop", "4STOP": "all-way stop", YIELD: "yield" };
  function placeholder(c, why) {
    const tags = { highway: c.type === "YIELD" ? "give_way" : "stop", ...(c.type === "4STOP" ? { stop: "all" } : {}) };
    let near = null, nd = SNAP;
    for (const node of nodes.values()) {
      if (!/^(stop|give_way)$/.test(node.tags.highway || "")) continue;
      const d = dist(node.q, c.q); if (d < nd) { nd = d; near = node; }
    }
    const place_ = cityPlace(c.p), sign = s => s === "give_way" ? "yield" : "stop";
    const note = `place by hand, ${why}${near ? `, OSM has a ${sign(near.tags.highway)} ${Math.round(nd)} m away` : ""} (city: ${KIND[c.type]}${place_ ? `, ${place_}` : ""})`;
    manual.push({ tags: { ...tags, fixme: note, fixme_sv: streetView({ q: c.q }) }, at: c.ll, q: c.q, key: c });
    report.manual.push(`${c.type} ${place_ || "(no name)"}  ${c.ll[1].toFixed(5)},${c.ll[0].toFixed(5)}: ${why}${near ? `, OSM ${near.tags.highway} ${Math.round(nd)} m away` : ""}`);
    count(`placeholder: ${why.replace(/ is highway=.*/, " taken")}`);
  }

  const handled = new Set(["STOP", "YIELD", "4STOP", "TRAFFICSIG"]);   // signals only to flag stop signs there
  for (const c of city.filter(c => c.inWard && handled.has(c.type))) {
    current = c;
    const names = cityNames(c.p), place_ = cityPlace(c.p);
    // the junction(s) of this intersection: OSM junctions whose legs carry the city's road names
    const qualifies = n => {
      const bases = legsAt(n).map(l => base(l.w.tags.name)).filter(Boolean);
      const hit = names.filter(b => bases.some(x => sameName(x, b)));
      return names.length >= 2 ? hit.length >= 2 : hit.length === 1 && bases.filter(b => sameName(b, names[0])).length >= 3;
    };
    let complex = c.nodes.filter(({ n }) => qualifies(n)).map(({ n }) => n);
    if (!complex.length) {
      const near = c.nodes.filter(({ d }) => d < NAMELESS).sort((a, b) => a.d - b.d)[0];
      if (!near) {
        if (c.type === "TRAFFICSIG") { report.unmatched.push(`${c.type} ${place_}  ${c.ll[1].toFixed(5)},${c.ll[0].toFixed(5)}`); count(`unmatched ${c.type}`); }
        else placeholder(c, "no matching OSM junction");
        continue;
      }
      complex = [near.n];
    }
    const set = new Set(complex);
    currentNodes = set; currentAt = complex.map(n => nodes.get(n).q).sort((a, b) => dist(a, c.q) - dist(b, c.q))[0];

    if (c.type === "TRAFFICSIG") {
      for (const n of complex) {
        const nd = nodes.get(n);
        if (nd.tags.highway === "stop") { edit(nd, () => {}, "delete? (city: traffic signals)"); count("stop at signals flagged"); }
      }
      for (const n of complex) for (const leg of describeLegs(n, set)) {
        if (leg.internal || leg.link || !leg.approach) continue;
        for (const s of leg.signs) if (s.tags.highway === "stop") {
          edit(s, () => {}, "delete? (city: traffic signals)"); count("stop at signals flagged");
        }
      }
      continue;
    }

    const want = c.type === "YIELD" ? "give_way" : "stop", allWay = c.type === "4STOP";
    const kind = allWay ? "all-way stop" : c.type === "YIELD" ? "yield" : "two-way stop";
    // brings an existing sign in line with the city
    const fixSign = s => {
      if (s.reversed) {
        edit(s, t => { t.direction = s.reversed; },
          "direction flipped");
        count("direction flipped");
      }
      if (s.tags.highway !== want) {
        edit(s, t => { t.highway = want; if (want === "give_way") delete t.stop; if (allWay) t.stop = "all"; },
          `${s.tags.highway === "give_way" ? "yield" : s.tags.highway} changed to ${want === "give_way" ? "yield" : want} (city: ${kind})`);
        count(`retagged ${s.tags.highway} -> ${want}`);
      } else if (allWay && s.tags.stop !== "all") {
        edit(s, t => { t.stop = "all"; }, "stop=all added (city: all-way stop)"); count("added stop=all");
      } else if (!allWay && s.tags.stop === "all") {
        edit(s, t => { delete t.stop; }, `stop=all removed (city: ${kind})`); count("removed stop=all");
      }
    };

    // all-way stop: one highway=stop + stop=all on the junction node (the Ottawa convention). Intersections already
    // mapped with a sign on each approach keep them, only their tags are fixed.
    if (allWay) {
      const onNode = complex.map(n => nodes.get(n)).filter(nd => /^(stop|give_way)$/.test(nd.tags.highway || ""));
      if (onNode.length) { onNode.forEach(fixSign); count("all-way stop on the junction node, checked"); continue; }
      const onLegs = new Map();
      const approaches = complex.flatMap(n => describeLegs(n, set)).filter(l => !l.internal && l.approach && !(l.service && !l.name));
      for (const leg of approaches) for (const sg of leg.signs) onLegs.set(sg.id, sg);
      if (approaches.length && approaches.every(l => l.signs.length)) { onLegs.forEach(fixSign); count("all-way stop mapped on every approach, checked"); continue; }
      const main = complex.map(n => nodes.get(n)).sort((a, b) => dist(a.q, c.q) - dist(b.q, c.q))[0];
      if (main.tags.highway) { placeholder(c, `junction node is highway=${main.tags.highway}`); continue; }
      edit(main, t => { t.highway = "stop"; t.stop = "all"; }, "new all-way stop (city: all-way stop)");
      count("all-way stop added on the junction node");
      // signs on some approaches only: the junction node sign replaces them
      for (const sg of onLegs.values()) { edit(sg, () => {}, "delete? (all-way stop moved to the junction node)"); count("approach sign replaced by the junction node sign: flagged"); }
      continue;
    }

    // OSM already has an all-way stop here (a stop on the junction node, or a stop on every approach): the city's
    // two-way or yield record misses many all-way stops. Left alone.
    {
      const onNode = complex.some(n => nodes.get(n).tags.highway === "stop");
      const approaches = complex.flatMap(n => describeLegs(n, set)).filter(l => !l.internal && l.approach && !(l.service && !l.name));
      const everyLeg = approaches.length >= 3 && approaches.every(l => l.signs.some(sg => sg.tags.highway === "stop"));
      if (onNode || everyLeg) { count("all-way stop in OSM, city says not all-way: left alone"); continue; }
    }

    const fewLegs = [];
    for (const n of complex) {
      const node = nodes.get(n);
      if (/^(stop|give_way)$/.test(node.tags.highway || "")) {
        // a sign on the junction node means an all-way stop; the city says otherwise
        if (node.tags.highway === "stop") { edit(node, () => {}, `not all-way? (city: ${kind})`); count("all-way stop on the junction node, city says not all-way: flagged"); }
        else { report.junctionSigns.push(`${node.tags.highway} on junction node ${n}, ${place_} (city: ${kind})`); count("give_way on the junction node, left alone"); }
        continue;
      }
      const legs = describeLegs(n, set).filter(l => !(l.service && !l.name));
      if (legs.length < 3) { fewLegs.push(`only ${legs.length} road legs at node ${n}`); continue; }

      // which legs stop
      let minor, through = null, why = "";
      {
        const pairs = [];
        for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
          // a nearly straight road outweighs a street name that turns the corner (at Chatham Gdn / Kenmare Pl the
          // short end of Chatham is the stem of the T); checked against Barrhaven's signed T-junctions: 837 of 841
          const A = legs[i], B = legs[j], same = !!A.base && A.base === B.base, angle = angleBetween(A.dir, B.dir);
          const straight = angle >= 165 ? 12 : angle >= 135 ? 5 : 0;
          if (!same && !straight) continue;
          pairs.push({ A, B, same, straight, score: (same ? 10 : 0) + straight - 3 * Math.max(A.rank, B.rank) });
        }
        pairs.sort((x, y) => y.score - x.score);
        let best = pairs[0];
        if (!best) {
          // no pair runs through: take the straightest
          let m = -1;
          for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) { const a = angleBetween(legs[i].dir, legs[j].dir); if (a > m) { m = a; best = { A: legs[i], B: legs[j] }; } }
          why = GUESS;
        } else {
          const rival = pairs.find(p => p !== best && ![p.A, p.B].some(l => l === best.A || l === best.B) && best.score - p.score < 1);
          if (rival) {
            const signed = p => [p.A, p.B].filter(l => l.signs.length).length;
            const len = p => streetLen.get(p.A.base) || 0;
            if (signed(best) && !signed(rival)) { best = rival; why = ""; }
            else if (signed(rival) && !signed(best)) why = "";
            else {
              if (len(rival) > len(best)) best = rival;
              why = GUESS;
            }
          }
        }
        // name and straightness disagree: an existing sign on the chosen through road settles it the other way
        const signedLegs = p => [p.A, p.B].filter(l => l.signs.length).length;
        const other = best.score !== undefined && pairs.find(p => p.same !== best.same && (p.same || p.straight === 12));
        if (other && signedLegs(best) && !signedLegs(other)) { best = other; why = ""; }
        if (!why && best.same === false && !pairs.some(p => p.same)) why = GUESS;
        through = best;
        minor = legs.filter(l => l !== best.A && l !== best.B);
      }
      const throughName = through ? (through.A.name || through.B.name || "the through road") : "";
      const onto = l => through ? `${l.name || "unnamed road"} at ${throughName}` : `${l.name || "unnamed road"} at ${place_}`;

      for (const leg of minor) {
        if (leg.internal || !leg.approach || (leg.service && !leg.name)) continue;
        const what = `${kind} ${onto(leg)}`;
        if (!leg.signs.length) {
          place(leg, { highway: want }, `new ${want === "stop" ? "stop" : "yield"} sign (city: ${kind})${why}`, what);
          count(`added ${want}`);
          continue;
        }
        for (const s of leg.signs) fixSign(s);
      }
      if (through) for (const leg of [through.A, through.B]) {
        if (leg.internal || !leg.approach) continue;
        for (const s of leg.signs) {
          edit(s, () => {}, `delete? (city: ${kind}, this road doesn't stop)${why}`);
          count("sign on the through road flagged");
        }
      }
    }
    // no junction of this intersection could take the signs (the side road is often an unnamed service road)
    if (fewLegs.length === complex.length) placeholder(c, fewLegs.length > 1 ? "too few road legs at the junction" : fewLegs[0].replace(/ at node \d+/, " at the junction"));
    else for (const f of fewLegs) { report.unmatched.push(`${c.type} ${place_}: ${f}`); count("too few legs"); }
  }

  // ----- group into files: signs on the same way or at the same intersection stay together (a way can be
  // modified in one file only), then the groups are split into compact areas of at most `chunk` signs
  added.forEach((s, k) => { s.id = -(k + 1); });
  manual.forEach((s, k) => { s.id = -(added.length + k + 1); });
  const items = [
    ...added.map(s => ({ kind: "new", s, q: xy(...s.at), keys: [`w${s.w.id}`, s.key] })),
    ...manual.map(s => ({ kind: "manual", s, q: s.q, keys: [s.key] })),
    ...[...edits].map(([id, e]) => ({ kind: "edit", id, e, q: nodes.get(id).q, keys: [`n${id}`, ...e.keys] })),
  ];
  const modifiedWays = new Set(added.map(s => s.w.id));
  for (const it of items) if (it.kind === "edit") for (const { w } of memb.get(it.id) || []) if (modifiedWays.has(w.id)) it.keys.push(`w${w.id}`);
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const it of items) for (const k of it.keys) if (!parent.has(k)) parent.set(k, k);
  for (const it of items) for (const k of it.keys.slice(1)) parent.set(find(k), find(it.keys[0]));
  const groupMap = new Map();
  for (const it of items) { const r = find(it.keys[0]); (groupMap.get(r) || groupMap.set(r, []).get(r)).push(it); }
  const groups = [...groupMap.values()].map(list => ({ list, q: [list.reduce((a, it) => a + it.q[0], 0) / list.length, list.reduce((a, it) => a + it.q[1], 0) / list.length] }));
  const size = gs => gs.reduce((a, g) => a + g.list.length, 0);
  // halves along the longer side, cutting at the share of signs each half should get
  function split(gs, parts) {
    if (gs.length < 2 || parts <= 1) return [gs];
    const span = i => Math.max(...gs.map(g => g.q[i])) - Math.min(...gs.map(g => g.q[i]));
    const axis = span(0) >= span(1) ? 0 : 1, sorted = [...gs].sort((x, y) => x.q[axis] - y.q[axis]);
    const left = Math.floor(parts / 2), target = size(gs) * left / parts;
    let cut = 0, acc = 0;
    while (cut < sorted.length - 1 && acc + sorted[cut].list.length <= target) acc += sorted[cut++].list.length;
    cut = Math.max(1, cut);
    return [...split(sorted.slice(0, cut), left), ...split(sorted.slice(cut), parts - left)];
  }
  const biggest = Math.max(0, ...groups.map(g => g.list.length)), limit = Math.max(chunk, biggest);
  let chunks;
  for (let parts = Math.max(1, Math.ceil(items.length / chunk)); ; parts++) {
    chunks = split(groups, parts);
    if (chunks.every(c => size(c) <= limit) || parts > items.length) break;
  }
  // north to south, then west to east, so the file numbers run across the ward in reading order
  const centre = c => [c.reduce((a, g) => a + g.q[0] * g.list.length, 0) / size(c), c.reduce((a, g) => a + g.q[1] * g.list.length, 0) / size(c)];
  chunks.sort((x, y) => Math.round((centre(y)[1] - centre(x)[1]) / 1500) || centre(x)[0] - centre(y)[0]);

  // ----- write
  const xmlEscape = s => String(s).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[ch]);
  const tagLines = tags => Object.entries(tags).filter(([, v]) => v != null && v !== "").map(([k, v]) => `    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
  const nodeXml = (nd, modified, tags) => {
    const head = `  <node id='${nd.id}'${modified ? " action='modify'" : ""} visible='true' version='${nd.version}' lat='${nd.lat}' lon='${nd.lon}'`;
    const t = tagLines(tags);
    return t.length ? [`${head}>`, ...t, "  </node>"] : [`${head} />`];
  };
  function buildOSM(list) {
    const out = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research Ottawa-stop-signs'>"];
    const written = new Set(), byWay = new Map();
    for (const it of list) if (it.kind === "new") {
      const s = it.s;
      (byWay.get(s.w.id) || byWay.set(s.w.id, []).get(s.w.id)).push(s);
      out.push(`  <node id='${s.id}' action='modify' visible='true' lat='${s.at[1].toFixed(7)}' lon='${s.at[0].toFixed(7)}'>`, ...tagLines(s.tags), "  </node>");
    }
    for (const it of list) if (it.kind === "manual") {
      const s = it.s;
      out.push(`  <node id='${s.id}' action='modify' visible='true' lat='${s.at[1].toFixed(7)}' lon='${s.at[0].toFixed(7)}'>`, ...tagLines(s.tags), "  </node>");
    }
    for (const it of list) if (it.kind === "edit") {
      const nd = nodes.get(it.id), fix = [nd.tags.fixme, ...it.e.notes].filter(Boolean).join("; ");
      written.add(it.id);
      out.push(...nodeXml(nd, true, { ...it.e.tags, fixme: fix.length > 255 ? `${fix.slice(0, 254)}…` : fix, fixme_sv: streetView(it.e.view) }));
    }
    const wayXml = [];
    for (const [wid, ins] of byWay) {
      const w = ways.get(wid);
      for (const id of w.nodes) if (!written.has(id)) { written.add(id); out.push(...nodeXml(nodes.get(id), false, nodes.get(id).tags)); }
      const nds = [];
      w.nodes.forEach((id, i) => { nds.push(id); for (const s of ins.filter(s => s.a === i).sort((x, y) => x.t - y.t)) nds.push(s.id); });
      wayXml.push(`  <way id='${wid}' action='modify' visible='true' version='${w.version}'>`, ...nds.map(id => `    <nd ref='${id}' />`), ...tagLines(w.tags), "  </way>");
    }
    out.push(...wayXml, "</osm>", "");
    return out.join("\n");
  }
  const dir = path.join(__dirname, String(ward));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^stop-signs.*\.osm$/.test(f)) fs.unlinkSync(path.join(dir, f));
  log(`\n${added.length} new signs, ${edits.size} existing nodes changed or flagged, ${modifiedWays.size} ways get a new node, ${manual.length} loose signs to place by hand`);
  chunks.forEach((c, i) => {
    const list = c.flatMap(g => g.list), file = `stop-signs-${String(i + 1).padStart(2, "0")}.osm`;
    fs.writeFileSync(path.join(dir, file), buildOSM(list));
    const streets = {};
    for (const it of list) for (const k of it.kind === "edit" ? it.e.keys : [it.s.key]) for (const n of (k.p.LOCATION_DESCRIPTION || "").split(/\s*[,:]\s*/).filter(Boolean)) streets[n] = (streets[n] || 0) + 1;
    log(`  ${ward}/${file}: ${list.length} signs; ${Object.entries(streets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => titleCase(k)).join(", ")}`);
  });

  // ----- report
  log("");
  for (const [k, v] of Object.entries(report.counts).sort()) log(`  ${k}: ${v}`);
  if (report.manual.length) log(`\nIn the files as loose signs at the city's point, to place by hand:\n  ${report.manual.join("\n  ")}`);
  if (report.unmatched.length) log(`\nNot in the files, no matching OSM junction:\n  ${report.unmatched.join("\n  ")}`);
  if (report.short.length) log(`\nNot placed, approach under ${MIN_LEG} m:\n  ${report.short.join("\n  ")}`);
  if (report.junctionSigns.length) log(`\nYield signs tagged on the junction node, not touched:\n  ${report.junctionSigns.join("\n  ")}`);
  writeLastUpdate(dir, printed.slice(from));
}

async function main() {
  const args = process.argv.slice(2), i = args.indexOf("--chunk");
  const chunk = i >= 0 ? Number(args.splice(i, 2)[1]) : CHUNK;
  if (!args.length || args.some(w => !/^\d+$/.test(w)) || !(chunk > 0)) { console.error("usage: node update.js [--chunk <n>] <ward number> [<ward number> ...]"); process.exit(2); }
  for (const w of args) await runWard(w, chunk);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.stack || e.message}`);
  process.exit(1);
});
