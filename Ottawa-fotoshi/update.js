// Adds Fotoshi photos to the OSM objects they show, in Ottawa and Gatineau, as image:fotoshi tags. Writes
// fotoshi-<today>-01.osm, -02.osm, ... to review and upload from JOSM, at most 50 objects each, one compact area
// each, numbered north to south. They hold:
//
//   - each OSM object Fotoshi links new photos to that has no image:fotoshi yet, with the tag added: ready to upload
//   - each photographed object Fotoshi has no OSM object for (or one deleted since, or without tags): a new node
//     at Fotoshi's point with fixme=find an object and the tag, to move onto the right object before uploading
//
//   node update.js [--user <name>] [--from <snapshot>] [--again] [--chunk <n>]
//
//   --user   only this contributor's photos (FOTOSHI_USER in .env does the same)
//   --from   the objects an earlier run saved (fotoshi-<date>.json), instead of asking Fotoshi again
//   --again  also the photos processed.json has as done
//   --chunk  objects per file at most (50)
//
// The API key is FOTOSHI_API_KEY in .env next to this script. processed.json lists every photo looked at and
// what became of it, so a rerun writes only new ones. A free key allows 1,000 photos and objects a day: a run
// that runs out writes what it has and keeps its place in processed.json, and the next run goes on from there.
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

// https://fotoshi.com/developers/api
const FOTOSHI = "https://api.fotoshi.com/v1/data";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_OSM_AGE = 48; // hours; some Overpass mirrors lag months behind, their data is refused
const BBOX = { south: 44.95, west: -76.4, north: 45.65, east: -75.2 }; // Ottawa and Gatineau with some margin
const PHOTOS = 5; // photos in a tag at most, newest first; the rest are only listed in processed.json
const PROCESSED = "processed.json";
const FIND = "find an object";
const CHUNK = 50; // objects per file at most, few enough to review in one go

const local = file => path.resolve(__dirname, file);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PHOTO_ID = /^[A-Za-z0-9_-]+$/; // anything else would break the ;-separated tag
const OSM_ID = /^[nwr][1-9]\d*$/;

// KEY=value lines; a variable already in the environment wins
function readEnv(file) {
  const env = {};
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return { ...env, ...process.env };
}

// --- Fotoshi ---------------------------------------------------------------------------------------------

class OutOfAllowance extends Error {}

async function askFotoshi(url, key) {
  for (;;) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, "User-Agent": "BikeOttawa data-research" },
      signal: AbortSignal.timeout(60000),
    });
    if (res.status === 429) {
      // a short wait is the per-minute limit; a long one, or none, the daily allowance
      const after = res.headers.get("retry-after");
      const wait = after == null ? NaN : /^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after) - Date.now();
      if (wait <= 120000) {
        console.log(`  Fotoshi asks to wait ${Math.ceil(Math.max(wait, 1000) / 1000)} s`);
        await sleep(Math.max(wait, 1000));
        continue;
      }
      throw new OutOfAllowance(`Fotoshi: out of today's allowance${after ? ` (retry after ${after})` : ""}`);
    }
    if (!res.ok) throw new Error(`Fotoshi: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

// a page's next link, kept on Fotoshi's API so the key goes nowhere else
function nextPage(page) {
  const href = page.links?.find(link => link.rel === "next")?.href;
  if (!href) return null;
  const url = new URL(href, FOTOSHI);
  if (url.origin !== new URL(FOTOSHI).origin) throw new Error(`Fotoshi's next page is on another host: ${href}`);
  return url.href;
}

const photoIds = photos => (photos || []).map(p => p.photo_id ?? p.properties?.photo_id ?? p.id).filter(id => PHOTO_ID.test(id ?? ""));

function readFeature(f) {
  const p = f.properties || {};
  return {
    fid: p.fid ?? f.id,
    name: p.name || null,
    category: p.category || null,
    osm: OSM_ID.test(p.osm_id ?? "") ? p.osm_id : null,
    at: f.geometry?.type === "Point" ? f.geometry.coordinates : null, // [lon, lat]
    count: p.matching_coverage?.photo_count ?? p.coverage?.photo_count ?? 0, // matching: a contributor's own
    photos: photoIds(f.photos), // newest first
  };
}

// The photographed objects in the area, each with all its photos. Starts at `start`, the page a run that ran out
// of allowance stopped at; returns where this one stopped, or null when it got through.
async function fetchFeatures(key, user, start) {
  const params = new URLSearchParams({
    bbox: [BBOX.west, BBOX.south, BBOX.east, BBOX.north].join(","),
    limit: 100,
    photo_limit: 20, // the most Fotoshi embeds; an object with more has the rest asked for below
    photo_size: "none",
  });
  if (user) params.set("username", user);
  let url = start || `${FOTOSHI}/features?${params}`;
  const features = [];
  try {
    while (url) {
      const page = await askFotoshi(url, key);
      const got = (page.features || []).map(readFeature);
      for (const f of got.filter(f => f.count > f.photos.length)) {
        const filter = new URLSearchParams({ limit: 100, photo_size: "none", ...(user && { username: user }) });
        let more = `${FOTOSHI}/features/${encodeURIComponent(f.fid)}/photos?${filter}`;
        const all = [];
        while (more) {
          const photos = await askFotoshi(more, key);
          all.push(...photoIds(photos.features));
          more = nextPage(photos);
        }
        f.photos = [...new Set([...f.photos, ...all])];
      }
      features.push(...got);
      url = nextPage(page);
      console.log(`  ${features.length} so far`);
    }
    return { features, stopped: null };
  } catch (e) {
    if (!(e instanceof OutOfAllowance)) throw e;
    console.log(`  ${e.message}; the next run goes on from here`);
    return { features, stopped: url };
  }
}

// --- OSM -------------------------------------------------------------------------------------------------

async function overpass(query) {
  for (let attempt = 0; attempt < 2 * OVERPASS.length; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": "BikeOttawa data-research" },
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const osm = await res.json();
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

const osmKey = el => `${el.type[0]}${el.id}`;

// the Fotoshi photos already in OSM in the area: photo id -> the object that has it
async function photosInOSM() {
  const { south, west, north, east } = BBOX;
  const osm = await overpass(`[out:json][timeout:120];nwr["image:fotoshi"](${south},${west},${north},${east});out tags;`);
  const has = new Map();
  for (const el of osm.elements) for (const id of el.tags["image:fotoshi"].split(";")) has.set(id.trim(), osmKey(el));
  return has;
}

// the current version of these OSM objects (n123, w123, r123), and the nodes of the ways among them
async function osmObjects(ids) {
  const of = type => ids.filter(id => id[0] === type).map(id => id.slice(1));
  const sets = [["node", "n"], ["way", "w"], ["rel", "r"]].filter(([, t]) => of(t).length).map(([q, t]) => `${q}(id:${of(t).join(",")});`);
  const osm = await overpass(`[out:json][timeout:120];(${sets.join("")})->.hit;(.hit;node(w.hit););out meta;`);
  return new Map(osm.elements.map(el => [osmKey(el), el]));
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function elementXml(el, tags, modify) {
  const head = `id='${el.id}'${modify ? " action='modify'" : ""} visible='true'${el.version ? ` version='${el.version}'` : ""}`;
  const open = el.type === "node" ? `  <node ${head} lat='${el.lat}' lon='${el.lon}'` : `  <${el.type} ${head}`;
  const body = [
    ...(el.nodes || []).map(n => `    <nd ref='${n}' />`),
    ...(el.members || []).map(m => `    <member type='${m.type}' ref='${m.ref}' role='${xmlEscape(m.role)}' />`),
    ...Object.entries(tags || {}).map(([k, v]) => `    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`),
  ];
  return body.length ? [`${open}>`, ...body, `  </${el.type}>`] : [`${open} />`];
}

// Changed objects keep their ids and versions, so they upload as modifications, and JOSM reports a conflict if one
// was edited in the meantime. The nodes of changed ways come along unchanged, so JOSM can draw the ways; a changed
// relation's members are left out, and JOSM shows them as incomplete.
function buildOSM(tagged, find, objects) {
  const changed = new Map(tagged.map(t => [osmKey(t.el), { ...t.el.tags, "image:fotoshi": t.photos.join(";") }]));
  const nodes = new Map();
  for (const t of tagged) {
    if (t.el.type === "node") nodes.set(t.el.id, t.el);
    for (const n of t.el.nodes || []) if (!nodes.has(n) && objects.has(`n${n}`)) nodes.set(n, objects.get(`n${n}`));
  }
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research Ottawa-fotoshi'>"];
  find.forEach((f, i) => {
    const el = { type: "node", id: -(i + 1), lon: f.at[0].toFixed(7), lat: f.at[1].toFixed(7) };
    xml.push(...elementXml(el, { fixme: FIND, "image:fotoshi": f.photos.join(";") }, true));
  });
  for (const el of nodes.values()) xml.push(...elementXml(el, changed.get(osmKey(el)) || el.tags, changed.has(osmKey(el))));
  for (const type of ["way", "relation"])
    for (const t of tagged.filter(t => t.el.type === type)) xml.push(...elementXml(t.el, changed.get(osmKey(t.el)), true));
  xml.push("</osm>", "");
  return xml.join("\n");
}

// --- run -------------------------------------------------------------------------------------------------

// a file name not taken yet: fotoshi-<today>.osm, then fotoshi-<today>-2.osm, ...
function freeName(base, ext) {
  for (let n = 1; ; n++) {
    const name = `${base}${n > 1 ? `-${n}` : ""}${ext}`;
    if (!fs.existsSync(local(name))) return name;
  }
}

// one photo per line, sorted, so the file diffs well
function saveProcessed(state) {
  const ids = Object.keys(state.photos).sort();
  const lines = ids.map((id, i) => `    ${JSON.stringify(id)}: ${JSON.stringify(state.photos[id])}${i < ids.length - 1 ? "," : ""}`);
  const text = ["{", `  "resume": ${JSON.stringify(state.resume)},`, `  "photos": {`, ...lines, "  }", "}", ""].join("\n");
  fs.writeFileSync(local(PROCESSED), text);
}

let saved = null; // this run's snapshot, for the hint when OSM fails

// Where an object is, for grouping: Fotoshi's point, or the node, or the middle of the way's nodes.
function where(t, objects) {
  const at = t.features.find(f => f.at)?.at;
  if (at) return at;
  const nodes = t.el.type === "node" ? [t.el] : (t.el.nodes || []).map(n => objects.get(`n${n}`)).filter(Boolean);
  const mean = key => nodes.reduce((sum, n) => sum + n[key], 0) / nodes.length;
  return nodes.length ? [mean("lon"), mean("lat")] : [BBOX.west, BBOX.south];
}

// Splits items ({ at: [lon, lat] }) into groups of at most `size`, each a compact area: halves them across their
// longer side, the halves sized so that the groups come out about equal.
function split(items, size) {
  if (items.length <= size) return [items];
  const parts = Math.ceil(items.length / size);
  const span = i => Math.max(...items.map(x => x.at[i])) - Math.min(...items.map(x => x.at[i]));
  const axis = span(0) * Math.cos((45.4 * Math.PI) / 180) > span(1) ? 0 : 1;
  const sorted = [...items].sort((a, b) => a.at[axis] - b.at[axis]);
  const cut = Math.round((sorted.length * Math.ceil(parts / 2)) / parts);
  return [...split(sorted.slice(0, cut), size), ...split(sorted.slice(cut), size)];
}

const label = f => [f.name && `"${f.name}"`, f.category && `(${f.category})`].filter(Boolean).join(" ") || f.fid;
const MAIN = ["amenity", "shop", "craft", "office", "tourism", "leisure", "healthcare", "building", "highway", "man_made", "historic"];
const osmLabel = tags => tags.name ? `"${tags.name}"` : (key => key ? `${key}=${tags[key]}` : "")(MAIN.find(key => tags[key]));

async function main() {
  const args = process.argv.slice(2);
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const env = readEnv(local(".env"));
  const user = arg("--user") || env.FOTOSHI_USER || null;
  const chunk = Number(arg("--chunk")) || CHUNK;
  const today = new Date().toLocaleDateString("en-CA");
  const state = fs.existsSync(local(PROCESSED))
    ? { resume: null, photos: {}, ...JSON.parse(fs.readFileSync(local(PROCESSED), "utf8")) }
    : { resume: null, photos: {} };

  let features, snapshot;
  if (arg("--from")) {
    snapshot = arg("--from");
    features = JSON.parse(fs.readFileSync(snapshot, "utf8"));
    console.log(`Read ${features.length} photographed objects from ${snapshot}`);
  } else {
    const key = env.FOTOSHI_API_KEY;
    if (!key) throw new Error("No FOTOSHI_API_KEY: put it in .env next to update.js (see .env.example)");
    const start = state.resume && state.resume.user === user ? state.resume.next : null;
    console.log(`Asking Fotoshi for photographed objects${user ? ` with ${user}'s photos` : ""}${start ? ", going on from where the last run stopped" : ""} ...`);
    const got = await fetchFeatures(key, user, start);
    features = got.features;
    snapshot = freeName(`fotoshi-${today}`, ".json");
    fs.writeFileSync(local(snapshot), `[\n${features.map(f => JSON.stringify(f)).join(",\n")}\n]\n`);
    saved = snapshot;
    // kept at once, so a failure below doesn't cost the allowance again: rerun with --from
    state.resume = got.stopped && { user, next: got.stopped };
    saveProcessed(state);
    console.log(`Saved ${snapshot}: ${features.length} objects, ${features.reduce((n, f) => n + f.photos.length, 0)} photos`);
  }

  const done = args.includes("--again") ? new Set() : new Set(Object.keys(state.photos));
  const results = new Map(); // photo id -> what became of it
  const note = (ids, text) => { for (const id of ids) if (!results.has(id)) results.set(id, text); };

  const withNew = features.filter(f => f.photos.some(id => !done.has(id)));
  if (!withNew.length) {
    console.log(`\nFotoshi: ${features.length} photographed objects, no new photos`);
    return;
  }
  console.log("\nLooking for Fotoshi photos already in OSM ...");
  const inOSM = await photosInOSM();

  // an object's photos stay together: one already in OSM means the object is done
  const todo = [], already = [];
  for (const f of withNew) {
    const fresh = f.photos.filter(id => !done.has(id));
    const on = f.photos.map(id => inOSM.get(id)).find(Boolean);
    if (on) {
      already.push({ f, on });
      note(fresh, `${today}: already in OSM on ${on}`);
    } else todo.push({ ...f, photos: fresh });
  }

  console.log("Downloading the OSM objects Fotoshi links to ...");
  const ids = [...new Set(todo.map(f => f.osm).filter(Boolean))];
  const objects = ids.length ? await osmObjects(ids) : new Map();

  const byObject = new Map(), find = [], hadTag = [], nowhere = [];
  for (const f of todo) {
    const el = f.osm && objects.get(f.osm);
    const untagged = el && !Object.keys(el.tags || {}).length; // e.g. a building's outline in a relation
    if (el?.tags?.["image:fotoshi"]) {
      hadTag.push(f);
      note(f.photos, `${today}: ${f.osm} had image:fotoshi`);
    } else if (el && !untagged) {
      const t = byObject.get(f.osm) || { el, photos: [], features: [] };
      t.photos.push(...f.photos.filter(id => !t.photos.includes(id)));
      t.features.push(f);
      byObject.set(f.osm, t);
    } else if (f.at) {
      find.push({ ...f, photos: f.photos.slice(0, PHOTOS) });
      note(f.photos.slice(PHOTOS), `${today}: over ${PHOTOS} photos, left out`);
    } else {
      nowhere.push(f);
      note(f.photos, `${today}: no OSM object and no location`);
    }
  }
  const tagged = [...byObject.values()];
  for (const t of tagged) {
    note(t.photos.slice(PHOTOS), `${today}: over ${PHOTOS} photos, left out`);
    t.photos = t.photos.slice(0, PHOTOS);
  }

  // files of at most `chunk` objects, each a compact area, numbered north to south after today's earlier ones
  const items = [...tagged.map(t => ({ t, at: where(t, objects) })), ...find.map(f => ({ f, at: f.at }))];
  const north = group => group.reduce((sum, x) => sum + x.at[1], 0) / group.length;
  const groups = items.length ? split(items, chunk).sort((a, b) => north(b) - north(a)) : [];
  const numbered = new RegExp(`^fotoshi-${today}-(\\d+)\\.osm$`);
  const first = Math.max(0, ...fs.readdirSync(__dirname).map(name => Number(name.match(numbered)?.[1] ?? 0))) + 1;
  const files = groups.map((group, i) => ({
    name: `fotoshi-${today}-${String(first + i).padStart(2, "0")}.osm`,
    tagged: group.filter(x => x.t).map(x => x.t),
    find: group.filter(x => x.f).map(x => x.f),
  }));
  for (const file of files) {
    for (const t of file.tagged) note(t.photos, `${today}: added to ${osmKey(t.el)} (${file.name})`);
    for (const f of file.find) note(f.photos, `${today}: ${FIND} (${file.name})`);
  }

  // report
  const photoCount = list => list.reduce((n, f) => n + f.photos.length, 0);
  console.log(`\nFotoshi: ${features.length} photographed objects, ${photoCount(features)} photos; new: ${results.size} photos`);
  console.log(`\nAdded to OSM objects: ${tagged.length}`);
  for (const t of tagged) console.log(`  ${osmKey(t.el)} ${osmLabel(t.el.tags) || label(t.features[0])}: ${t.photos.length} photo${t.photos.length > 1 ? "s" : ""}`);
  console.log(`\nNew nodes with fixme=${FIND}: ${find.length}`);
  for (const f of find) console.log(`  ${f.at[1].toFixed(5)},${f.at[0].toFixed(5)} ${label(f)}${f.osm ? `, Fotoshi has ${f.osm}, ${objects.has(f.osm) ? "which has no tags" : "gone from OSM"}` : ""}: https://fotoshi.com/photo/${f.photos[0]}`);
  console.log(`\nLeft alone, the OSM object has image:fotoshi already: ${hadTag.length}`);
  for (const f of hadTag) console.log(`  ${f.osm} ${label(f)}: ${f.photos.map(id => `https://fotoshi.com/photo/${id}`).join(" ")}`);
  console.log(`\nLeft alone, a photo of the object is in OSM already: ${already.length}`);
  for (const { f, on } of already) console.log(`  ${on} ${label(f)}${f.osm && f.osm !== on ? ` (Fotoshi has ${f.osm})` : ""}`);
  if (nowhere.length) {
    console.log(`\nLeft out, no OSM object and no location: ${nowhere.length}`);
    for (const f of nowhere) console.log(`  ${f.fid} ${label(f)}`);
  }

  console.log(files.length ? "" : "\nNothing new to write");
  for (const file of files) {
    fs.writeFileSync(local(file.name), buildOSM(file.tagged, file.find, objects));
    const names = [...file.tagged.map(t => t.el.tags.name), ...file.find.map(f => f.name)].filter(Boolean);
    console.log(`Saved ${file.name}: ${file.tagged.length} tagged, ${file.find.length} to find (${names.slice(0, 3).join(", ")}${names.length > 3 ? ", ..." : ""})`);
  }
  for (const [id, text] of results) state.photos[id] = text;
  saveProcessed(state);
  console.log(`Saved ${PROCESSED}: ${Object.keys(state.photos).length} photos${state.resume ? "; the next run goes on where this one stopped" : ""}`);
}

if (require.main === module) main().catch(e => {
  console.error(`\n${e.message}`);
  if (saved) console.error(`Rerun with --from ${saved}, so as not to ask Fotoshi again`);
  process.exit(1);
});

module.exports = { readFeature, fetchFeatures, buildOSM, readEnv };
