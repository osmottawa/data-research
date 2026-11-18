// lit=yes / lit=no for the roads and pathways of City of Ottawa wards, worked out from the street lamps mapped in
// OSM (all ~80k city lights are in, plus ~15k more), written to <ward>/lit-NN.osm, files of at most CHUNK ways, one
// compact area each, numbered north to south, for review and upload in JOSM.
//
//   node update.js [--chunk <n>] <ward number> [<ward number> ...]
//   node update.js [--chunk <n>] all
//
// Ways: trunk ... residential, living_street, busway (and links); cycleway, footway, path, pedestrian, bridleway.
// Left out: motorways, sidewalks, crossings, traffic islands, service roads, steps, tracks, areas. A way belongs to
// the ward its midpoint is in.
// Each file also holds, unchanged so they don't upload, the street lamps the decisions looked at (within 30 m of a
// way in the file) and the things tagged lit that were checked for its dark paths, to validate against.
//
// Each way is sampled every 5 m and each sample checked for a lamp nearby. The thresholds were tuned against the
// ~10k Ottawa ways that already had a lit tag (see README.md):
//   road  yes: lamps within 30 m cover >= 60% of it (a lamp counts if it stands within 30 m of the centreline)
//         no:  they cover <= 20%, and the city's road layer says the road is city-owned. Private, federal (NCC) and
//              provincial (MTO) roads have their own lights, which aren't in the city data, so they never get lit=no.
//   path  yes: lamps standing on the path (within 4 m) light >= 60% of it within 15 m and lamps within 12 m of it
//              light >= 70% within 20 m; or, for a path of 30 m or more, lamps within 12 m light >= 80% of it.
//         no:  no more than 10% of it is within 30 m of any lamp, it's at least 20 m long, it isn't inside a school,
//              campus, hospital, commercial, retail, industrial, railway or military site (they light their own
//              grounds), it isn't mostly within 40 m of a private road (condo complexes), 25 m of a parking aisle,
//              15 m of a parking lot or 25 m of something OSM tags lit (a pitch, rink, parking lot, shelter: lights
//              the street light data doesn't have), and it isn't a tunnel, covered or indoor.
//   Everything in between is left alone and counted in the console.
// A way that already has a lit tag saying the same is skipped. One whose tag disagrees gets the computed value and
// fixme=check lit; lit=no and lit=disused count as no, every other value as yes.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// source: https://open.ottawa.ca
const WARDS = "https://maps.ottawa.ca/arcgis/rest/services/Wards/MapServer/0";
const ROAD_CLASSES = "https://maps.ottawa.ca/arcgis/rest/services/Road_Information/MapServer/3"; // OWNERSHIP field
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const UA = "BikeOttawa-data-research/1.0";
const CITY_BBOX = [44.95, -76.36, 45.54, -75.24]; // s, w, n, e
const CHUNK = 100;
const FIXME = "check lit";

const ROAD = /^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|busway)(_link)?$/; // no motorways
const PATH = /^(cycleway|footway|path|pedestrian|bridleway)$/;
const NOT_PATH = /^(sidewalk|crossing|traffic_island|access_aisle)$/;
// sites that light their own grounds: no lit=no for paths inside them
const SITES = [
  'wr["amenity"~"^(university|college|school|hospital|prison)$"]',
  'wr["landuse"~"^(retail|commercial|industrial|military|railway)$"]',
  'wr["shop"="mall"]',
  'wr["leisure"~"^(marina|stadium|sports_centre)$"]',
  'wr["aeroway"="aerodrome"]',
  'wr["tourism"~"^(zoo|theme_park|museum)$"]',
  'wr["landuse"="residential"]["access"="private"]',
];

// metres
const STEP = 5;
const MARGIN = 100;
const ROAD_LAMP = 30, ROAD_REACH = 30, ROAD_YES = 0.6, ROAD_NO = 0.2, OWNER_SNAP = 20;
const PATH_NEAR = 12, PATH_REACH = 20, PATH_ON = 4, PATH_ON_REACH = 15;
const PATH_DARK = 30, PATH_DARK_SHARE = 0.1, PATH_MIN_NO = 20, PATH_MIN_SIDE = 30;
const PRIVATE_ROAD = 40, PARKING = 25, PARKING_LOT = 15, LIT_THING = 25;

// ---------------------------------------------------------------------------------------------------------

async function get(url, options = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(600000) });
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

async function overpass(data) {
  for (const url of OVERPASS) {
    try {
      const osm = await get(url, { method: "POST", body: new URLSearchParams({ data }) });
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

// ---------------------------------------------------------------------------------------------------------
// geometry, in metres on a local plane

const KX = 111320 * Math.cos(45.3 * Math.PI / 180), KY = 110540;
const xy = (lon, lat) => [lon * KX, lat * KY];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function lineDist(p, pts) { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); return d; }
function ringHas(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(lonlat, geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let inside = false;
  for (const rings of polys) for (const ring of rings) if (ringHas(ring, lonlat)) inside = !inside;
  return inside;
}
function grid(cell) {
  const g = new Map();
  return {
    add(q, v) { const k = `${Math.floor(q[0] / cell)},${Math.floor(q[1] / cell)}`; (g.get(k) || g.set(k, []).get(k)).push(v); },
    near(q, r) {
      const out = [], cx = Math.floor(q[0] / cell), cy = Math.floor(q[1] / cell), n = Math.ceil(r / cell);
      for (let i = cx - n; i <= cx + n; i++) for (let j = cy - n; j <= cy + n; j++) { const c = g.get(`${i},${j}`); if (c) out.push(...c); }
      return out;
    },
  };
}
// segments of lines, filed under every cell they cross, to ask "which line of this kind is nearest q, within r?"
function segIndex(cell = 50) {
  const g = new Map();
  return {
    add(pts, v) {
      for (let i = 1; i < pts.length; i++) {
        const s = { a: pts[i - 1], b: pts[i], v }, n = Math.ceil(dist(s.a, s.b) / (cell / 2)), keys = new Set();
        for (let k = 0; k <= n; k++) {
          const x = s.a[0] + (s.b[0] - s.a[0]) * k / Math.max(1, n), y = s.a[1] + (s.b[1] - s.a[1]) * k / Math.max(1, n);
          keys.add(`${Math.floor(x / cell)},${Math.floor(y / cell)}`);
        }
        for (const key of keys) (g.get(key) || g.set(key, []).get(key)).push(s);
      }
    },
    nearest(q, r) {
      let best = null, bd = r;
      const cx = Math.floor(q[0] / cell), cy = Math.floor(q[1] / cell), m = Math.ceil(r / cell);
      for (let i = cx - m; i <= cx + m; i++) for (let j = cy - m; j <= cy + m; j++)
        for (const s of g.get(`${i},${j}`) || []) { const d = segDist(q, s.a, s.b); if (d <= bd) { bd = d; best = s.v; } }
      return best;
    },
    within(q, r) {
      const out = new Set(), cx = Math.floor(q[0] / cell), cy = Math.floor(q[1] / cell), m = Math.ceil(r / cell);
      for (let i = cx - m; i <= cx + m; i++) for (let j = cy - m; j <= cy + m; j++)
        for (const s of g.get(`${i},${j}`) || []) if (segDist(q, s.a, s.b) <= r) out.add(s.v);
      return out;
    },
  };
}
function lengthOf(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]); return l; }
function pointAt(pts, at) {
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (d >= at && d > 0) { const t = at / d; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
    at -= d;
  }
  return pts[pts.length - 1];
}
function samples(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.round(dist(a, b) / step));
    for (let s = 1; s <= n; s++) out.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]);
  }
  return out;
}

// outer rings of ways and multipolygons from `out geom`, members joined end to end
function rings(e) {
  const toQ = g => g.map(p => xy(p.lon, p.lat));
  if (e.type === "way") return e.geometry ? [toQ(e.geometry)] : [];
  const parts = (e.members || []).filter(m => m.type === "way" && m.role !== "inner" && m.geometry).map(m => toQ(m.geometry));
  const out = [], same = (a, b) => dist(a, b) < 0.01;
  while (parts.length) {
    let ring = parts.shift();
    for (let grown = true; grown && !same(ring[0], ring[ring.length - 1]);) {
      grown = false;
      for (let i = 0; i < parts.length; i++) {
        const s = parts[i], end = ring[ring.length - 1];
        if (same(s[0], end)) ring = ring.concat(s.slice(1));
        else if (same(s[s.length - 1], end)) ring = ring.concat([...s].reverse().slice(1));
        else if (same(s[s.length - 1], ring[0])) ring = s.concat(ring.slice(1));
        else if (same(s[0], ring[0])) ring = [...s].reverse().concat(ring.slice(1));
        else continue;
        parts.splice(i, 1); grown = true; break;
      }
    }
    out.push(ring);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------

const isYes = v => v !== "no" && v !== "disused";

async function cityWide() {
  const bbox = CITY_BBOX.join(",");
  const lampsOsm = await overpass(`[out:json][timeout:600];node["highway"="street_lamp"](${bbox});out meta;`);
  console.log(`OSM data as of ${lampsOsm.osm3s.timestamp_osm_base}: ${lampsOsm.elements.length} street lamps`);
  const lamps = grid(50);
  for (const e of lampsOsm.elements) { const q = xy(e.lon, e.lat); lamps.add(q, { ...e, tags: e.tags || {}, q }); }

  const sitesOsm = await overpass(`[out:json][timeout:600][bbox:${bbox}];(${SITES.join(";")};);out geom;`);
  const sites = grid(500);
  let n = 0;
  for (const e of sitesOsm.elements) for (const ring of rings(e)) {
    if (ring.length < 4) continue;
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const site = { ring, bb };
    for (let x = Math.floor(bb[0] / 500); x <= Math.floor(bb[2] / 500); x++) for (let y = Math.floor(bb[1] / 500); y <= Math.floor(bb[3] / 500); y++) sites.add([x * 500 + 1, y * 500 + 1], site);
    n++;
  }
  console.log(`Sites with their own lighting (schools, campuses, malls, ...): ${n}`);
  const inSite = q => sites.near(q, 0).some(s => q[0] >= s.bb[0] && q[0] <= s.bb[2] && q[1] >= s.bb[1] && q[1] <= s.bb[3] && ringHas(s.ring, q));

  // things OSM already says are lit (pitches, rinks, parking lots, shelters, ...), and surface parking lots
  const litOsm = await overpass(`[out:json][timeout:600][bbox:${bbox}];(nwr["lit"]["lit"!="no"][!"highway"];nwr["amenity"="parking"]["parking"!~"underground|multi-storey|rooftop"];);out geom;`);
  const litThings = areaIndex(), parkingLots = areaIndex();
  for (const e of litOsm.elements) {
    if (e.tags?.lit && e.tags.lit !== "no") litThings.add(e);
    if (e.tags?.amenity === "parking") parkingLots.add(e);
  }
  console.log(`Lit things (pitches, rinks, ...) and parking lots: ${litOsm.elements.length}`);
  return { lamps, inSite, litThings, parkingLots };
}

// outlines (and points) of OSM objects from `out geom`, to ask "which ones is q inside or within r of?"
function areaIndex() {
  const edges = segIndex(), polys = grid(300);
  return {
    add(e) {
      const lines = e.type === "node" ? [[xy(e.lon, e.lat), xy(e.lon, e.lat)]]
        : e.type === "way" ? [e.geometry.map(p => xy(p.lon, p.lat))]
        : (e.members || []).filter(m => m.geometry).map(m => m.geometry.map(p => xy(p.lon, p.lat)));
      for (const pts of lines) edges.add(pts, e);
      for (const ring of e.type === "node" ? [] : rings(e)) {
        if (ring.length < 4) continue;
        const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        for (let x = Math.floor(bb[0] / 300); x <= Math.floor(bb[2] / 300); x++) for (let y = Math.floor(bb[1] / 300); y <= Math.floor(bb[3] / 300); y++) polys.add([x * 300 + 1, y * 300 + 1], { ring, bb, e });
      }
    },
    near(q, r) {
      const found = new Set(edges.within(q, r));
      for (const p of polys.near(q, 0)) if (q[0] >= p.bb[0] && q[0] <= p.bb[2] && q[1] >= p.bb[1] && q[1] <= p.bb[3] && ringHas(p.ring, q)) found.add(p.e);
      return [...found];
    },
  };
}

async function runWard(wardFeature, chunk, city) {
  const ward = wardFeature.properties.WARD_NUM, wardName = wardFeature.properties.WARD_NAME_EN;
  console.log(`\n=== Ward ${ward}, ${wardName}`);
  const coords = [];
  (function walk(c) { if (typeof c[0] === "number") coords.push(c); else c.forEach(walk); })(wardFeature.geometry.coordinates);
  const mLon = MARGIN / KX, mLat = MARGIN / KY;
  const bbox = [Math.min(...coords.map(c => c[1])) - mLat, Math.min(...coords.map(c => c[0])) - mLon, Math.max(...coords.map(c => c[1])) + mLat, Math.max(...coords.map(c => c[0])) + mLon];

  // ----- OSM highways in and around the ward, with their nodes
  const osm = await overpass(`[out:json][timeout:600];way["highway"](${bbox.join(",")})->.w;.w out meta;node(w.w);out meta;`);
  console.log(`OSM data as of ${osm.osm3s.timestamp_osm_base}`);
  const nodes = new Map(), ways = [];
  for (const e of osm.elements) {
    if (e.type === "node") nodes.set(e.id, { ...e, tags: e.tags || {}, q: xy(e.lon, e.lat) });
    else if (e.type === "way") ways.push({ ...e, tags: e.tags || {} });
  }
  for (const w of ways) { w.pts = w.nodes.map(id => nodes.get(id).q); w.len = lengthOf(w.pts); }

  // ----- city road ownership; private and parking roads from both sources
  const roads = await cityQuery(ROAD_CLASSES, {
    where: "1=1", outFields: "OWNERSHIP", geometry: [bbox[1] - mLon, bbox[0] - mLat, bbox[3] + mLon, bbox[2] + mLat].join(","),
    geometryType: "esriGeometryEnvelope", inSR: 4326, spatialRel: "esriSpatialRelIntersects",
  });
  const owner = segIndex(), privateRoads = segIndex(), parking = segIndex();
  for (const f of roads) {
    if (!f.geometry) continue;
    for (const line of f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates) {
      const pts = line.map(c => xy(c[0], c[1]));
      owner.add(pts, f.properties.OWNERSHIP);
      if (f.properties.OWNERSHIP === "Private") privateRoads.add(pts, true);
    }
  }
  for (const w of ways) {
    const t = w.tags;
    if (/^(residential|service|living_street|unclassified)$/.test(t.highway) && (/^(private|customers|destination|permit)$/.test(t.access || "") || / (Private|Priv|Pvt)$/i.test(t.name || ""))) privateRoads.add(w.pts, true);
    if (t.highway === "service" && /^(parking_aisle|drive-through)$/.test(t.service || "")) parking.add(w.pts, true);
  }

  // ----- decide each way
  const isCandidate = w => w.tags.area !== "yes" && w.len > 0 &&
    (ROAD.test(w.tags.highway) || (PATH.test(w.tags.highway) && !NOT_PATH.test(w.tags.footway || w.tags.path || w.tags.cycleway || "")));
  const counts = {}, count = k => { counts[k] = (counts[k] || 0) + 1; };
  const changes = [];
  for (const w of ways) {
    if (!isCandidate(w)) continue;
    const mid = pointAt(w.pts, w.len / 2);
    if (!inPolygon([mid[0] / KX, mid[1] / KY], wardFeature.geometry)) continue;
    const isRoad = ROAD.test(w.tags.highway), kind = isRoad ? "road" : "path";
    const sm = samples(w.pts, STEP);
    const lamps = city.lamps.near(mid, w.len / 2 + 80).map(l => ({ l, q: l.q, d: lineDist(l.q, w.pts) })).filter(l => l.d <= 30);
    const litSeen = new Set(); // lit things checked for a dark path
    const share = (maxD, reach) => { const ls = lamps.filter(l => l.d <= maxD); return sm.filter(p => ls.some(l => dist(p, l.q) <= reach)).length / sm.length; };
    let value = null, why;
    if (isRoad) {
      const cover = share(ROAD_LAMP, ROAD_REACH);
      if (cover >= ROAD_YES) value = "yes";
      else if (cover > ROAD_NO) why = "partly lit";
      else {
        const votes = {};
        for (const p of sm) { const o = owner.nearest(p, OWNER_SNAP) || "not in city data"; votes[o] = (votes[o] || 0) + 1; }
        const own = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
        if (own === "Public") value = "no"; else why = `dark, ${own.toLowerCase()} road`;
      }
    } else {
      const near = share(PATH_NEAR, PATH_REACH), on = share(PATH_ON, PATH_ON_REACH);
      if ((near >= 0.7 && on >= 0.6) || (near >= 0.8 && w.len >= PATH_MIN_SIDE)) value = "yes";
      else if (near >= 0.7) why = `lit by street lamps but under ${PATH_MIN_SIDE} m`;
      else if (share(PATH_DARK, PATH_DARK) > PATH_DARK_SHARE) why = "partly lit";
      else if (w.len < PATH_MIN_NO) why = `dark but under ${PATH_MIN_NO} m`;
      else if (w.tags.tunnel || w.tags.covered === "yes" || w.tags.indoor === "yes") why = "dark, tunnel or indoor";
      else if (city.inSite(mid)) why = "dark, in a school, campus, mall or similar site";
      else {
        const sm10 = samples(w.pts, 10);
        const mostly = test => sm10.filter(test).length / sm10.length >= 0.5;
        const byLit = p => { const found = city.litThings.near(p, LIT_THING); for (const e of found) litSeen.add(e); return found.length > 0; };
        if (mostly(p => privateRoads.nearest(p, PRIVATE_ROAD))) why = "dark, by a private road";
        else if (mostly(p => parking.nearest(p, PARKING) || city.parkingLots.near(p, PARKING_LOT).length)) why = "dark, by a parking lot";
        else if (mostly(byLit)) why = "dark, by something tagged lit (pitch, rink, parking, ...)";
        else value = "no";
      }
    }
    const old = w.tags.lit;
    if (value === null) { count(`${kind} skipped: ${why}${old !== undefined ? " (has lit)" : ""}`); continue; }
    if (old !== undefined && isYes(old) === (value === "yes")) { count(`${kind} already lit=${value}`); continue; }
    const tags = { ...w.tags, lit: value };
    if (old !== undefined) {
      tags.fixme = w.tags.fixme ? `${w.tags.fixme}; ${FIXME}` : FIXME;
      count(`${kind} lit=${old} -> ${value}, ${FIXME}`);
    } else count(`${kind} new lit=${value}`);
    changes.push({ w, tags, q: mid, check: old !== undefined, lamps: lamps.map(x => x.l), lit: [...litSeen] });
  }

  // ----- compact areas of at most `chunk` ways
  function split(items, parts) {
    if (items.length < 2 || parts <= 1) return [items];
    const span = i => Math.max(...items.map(t => t.q[i])) - Math.min(...items.map(t => t.q[i]));
    const axis = span(0) >= span(1) ? 0 : 1, sorted = [...items].sort((a, b) => a.q[axis] - b.q[axis]);
    const left = Math.floor(parts / 2), cut = Math.round(items.length * left / parts);
    return [...split(sorted.slice(0, cut), left), ...split(sorted.slice(cut), parts - left)];
  }
  let chunks = [];
  if (changes.length) for (let parts = Math.ceil(changes.length / chunk); ; parts++) {
    chunks = split(changes, parts);
    if (chunks.every(c => c.length <= chunk)) break;
  }
  // north to south, then west to east, so the file numbers run across the ward in reading order
  const centre = c => [c.reduce((a, t) => a + t.q[0], 0) / c.length, c.reduce((a, t) => a + t.q[1], 0) / c.length];
  chunks.sort((x, y) => Math.round((centre(y)[1] - centre(x)[1]) / 1500) || centre(x)[0] - centre(y)[0]);

  // ----- the lit things checked for the dark paths, in full (their nodes, member ways), to put in the files
  const litIds = { node: new Set(), way: new Set(), relation: new Set() };
  for (const c of changes) for (const e of c.lit) litIds[e.type].add(e.id);
  const full = new Map(); // "n123" -> element
  if (litIds.node.size + litIds.way.size + litIds.relation.size) {
    const sel = Object.entries(litIds).filter(([, s]) => s.size).map(([t, s]) => `${t === "relation" ? "rel" : t}(id:${[...s].join(",")});`).join("");
    for (const e of (await overpass(`[out:json][timeout:300];(${sel});(._;>;);out meta;`)).elements) full.set(e.type[0] + e.id, { ...e, tags: e.tags || {} });
  }

  // ----- write: the changed ways and their nodes, then, unchanged for reference, the street lamps the decision
  // looked at (within 30 m of a way) and the lit things checked for the dark paths
  const xmlEscape = s => String(s).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[ch]);
  const tagLines = tags => Object.entries(tags).filter(([, v]) => v != null && v !== "").map(([k, v]) => `    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
  const nodeXml = nd => {
    const t = tagLines(nd.tags), head = `  <node id='${nd.id}' visible='true' version='${nd.version}' lat='${nd.lat}' lon='${nd.lon}'`;
    return t.length ? [`${head}>`, ...t, "  </node>"] : [`${head} />`];
  };
  function buildOSM(list) {
    const nodeOut = [], wayOut = [], relOut = [], written = new Set();
    const once = key => !written.has(key) && written.add(key);
    for (const { w } of list) for (const id of w.nodes) if (once(`n${id}`)) nodeOut.push(...nodeXml(nodes.get(id)));
    for (const { w, tags } of list) {
      written.add(`w${w.id}`);
      wayOut.push(`  <way id='${w.id}' action='modify' visible='true' version='${w.version}'>`, ...w.nodes.map(id => `    <nd ref='${id}' />`), ...tagLines(tags), "  </way>");
    }
    let lampCount = 0, litCount = 0;
    for (const { lamps } of list) for (const l of lamps) if (once(`n${l.id}`)) { nodeOut.push(...nodeXml(l)); lampCount++; }
    const addFull = key => {
      const e = full.get(key);
      if (!e || !once(key)) return;
      if (e.type === "node") nodeOut.push(...nodeXml(e));
      else if (e.type === "way") {
        for (const id of e.nodes) addFull(`n${id}`);
        wayOut.push(`  <way id='${e.id}' visible='true' version='${e.version}'>`, ...e.nodes.map(id => `    <nd ref='${id}' />`), ...tagLines(e.tags), "  </way>");
      } else {
        for (const m of e.members) addFull(m.type[0] + m.ref);
        relOut.push(`  <relation id='${e.id}' visible='true' version='${e.version}'>`, ...e.members.map(m => `    <member type='${m.type}' ref='${m.ref}' role='${xmlEscape(m.role)}' />`), ...tagLines(e.tags), "  </relation>");
      }
    };
    for (const { lit } of list) for (const e of lit) if (!written.has(e.type[0] + e.id)) { addFull(e.type[0] + e.id); litCount++; }
    const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research Ottawa-lit'>", ...nodeOut, ...wayOut, ...relOut, "</osm>", ""].join("\n");
    return { xml, lampCount, litCount };
  }
  const dir = path.join(__dirname, String(ward));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^lit-.*\.osm$/.test(f)) fs.unlinkSync(path.join(dir, f));
  console.log("");
  const files = chunks.map((list, i) => {
    const file = `lit-${String(i + 1).padStart(2, "0")}.osm`;
    const { xml, lampCount, litCount } = buildOSM(list);
    fs.writeFileSync(path.join(dir, file), xml);
    const streets = {};
    for (const { w } of list) if (w.tags.name) streets[w.tags.name] = (streets[w.tags.name] || 0) + w.len;
    const top = Object.entries(streets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    const yes = list.filter(c => c.tags.lit === "yes").length, check = list.filter(c => c.check).length;
    console.log(`  ${ward}/${file}: ${list.length} ways (${yes} yes, ${list.length - yes} no${check ? `, ${check} ${FIXME}` : ""}), ${lampCount} lamps, ${litCount} lit things; ${top.join(", ")}`);
    return { file, n: list.length, yes, check, top, lampCount, litCount };
  });

  console.log("");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);
  const yes = changes.filter(c => c.tags.lit === "yes").length, check = changes.filter(c => c.check).length;
  return { ward, wardName, files, ways: changes.length, yes, no: changes.length - yes, check, counts };
}

async function main() {
  const args = process.argv.slice(2), i = args.indexOf("--chunk");
  const chunk = i >= 0 ? Number(args.splice(i, 2)[1]) : CHUNK;
  if (!args.length || !(chunk > 0) || !(args.length === 1 && args[0] === "all" || args.every(w => /^\d+$/.test(w)))) {
    console.error("usage: node update.js [--chunk <n>] <ward number> [<ward number> ...] | all");
    process.exit(2);
  }
  const wards = (await cityQuery(WARDS, { where: "1=1" })).sort((a, b) => a.properties.WARD_NUM - b.properties.WARD_NUM);
  const wanted = args[0] === "all" ? wards : args.map(n => wards.find(f => f.properties.WARD_NUM === n) || (() => { throw new Error(`No ward ${n} in the city's Wards layer`); })());
  const city = await cityWide();
  const results = [], failed = [];
  for (const f of wanted) {
    try {
      results.push(await runWard(f, chunk, city));
    } catch (e) {
      console.log(`\nWard ${f.properties.WARD_NUM} failed: ${e.message}`);
      failed.push(f.properties.WARD_NUM);
    }
  }
  if (results.length > 1) {
    console.log("\n| Ward | Files | Ways | lit=yes | lit=no | check lit |\n|---|---|---|---|---|---|");
    for (const r of results) console.log(`| ${r.ward} ${r.wardName} | ${r.files.length} | ${r.ways} | ${r.yes} | ${r.no} | ${r.check} |`);
  }
  if (failed.length) { console.log(`\nFailed, run again: node update.js ${failed.join(" ")}`); process.exitCode = 1; }
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.stack || e.message}`);
  process.exit(1);
});
