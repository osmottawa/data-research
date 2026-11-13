// Finds City of Ottawa bike repair stations that are missing in OSM and writes them to an .osm file
// to review and merge manually in JOSM. Also reports what looks off in the existing OSM data.
//
//   node update.js [--new <snapshot>] [--out <file>]
//
//   --new   current city dataset; downloaded and saved as bike-repair-<today>.json if omitted
//
// Coordinates in the city dataset are unreliable (many stations share one placeholder point, others are
// rounded to ~100 m), so every station is located in several ways and matched to OSM if any of them is close
// to an existing station:
//   - coordinates of the same station in the 2017 dataset (they were precise)
//   - city coordinates, if they look precise
//   - its address and its name, geocoded with Nominatim (answers are cached in geocode.json)
// New stations are placed at the first of these that is available, so their position is approximate.
//
// No dependencies, needs Node 18+.

"use strict";
const fs = require("fs");
const path = require("path");

const OLD_DATASET = "bikerepairlocations2017shp.json";
const GEOCODE_CACHE = "geocode.json";
const OUTPUT = "ottawa-bike-repair-stations.osm";

// source: https://open.ottawa.ca/datasets/ottawa::bike-repair
const CITY_LAYER = "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Bike_Repair/FeatureServer/0";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const BBOX = { south: 44.95, west: -76.4, north: 45.6, east: -75.2 }; // Ottawa with some margin

const tags = station => ({
  amenity: "bicycle_repair_station",
  description: `${station.description} at ${station.name}`,
  operator: "City of Ottawa",
  fee: "no",
  "service:bicycle:diy": "yes",
  "service:bicycle:pump": "yes",
  start_date: station.year ? String(station.year) : undefined,
  website: "https://ottawa.ca/en/residents/transportation-and-parking/cycling/bike-parking-and-repair-stands",
});

const MATCH = 300;          // meters; a station exists in OSM if there is one this close to any of its locations
const LOOSE = 100;          // meters; matches farther than this are listed for a second look
const SAME_NAME = 0.8;     // how similar the names in the 2017 and the current dataset have to be (0..1)
const MIN_DECIMALS = 5;     // city coordinates with fewer decimals are considered rounded

// ---------------------------------------------------------------------------------------------------------

const RAD = Math.PI / 180;
// meters between two [lat, lon]
const distance = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(45.4 * RAD)) * 111195;
const decimals = x => (String(x).split(".")[1] || "").length;
const normalize = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Dice coefficient of letter pairs: 1 for the same names, ~0.5 for "Greenboro Station" / "Greenboro Library"
function similarity(a, b) {
  const pairs = s => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
  const pa = pairs(normalize(a)), pb = pairs(normalize(b));
  if (!pa.length || !pb.length) return 0;
  const left = [...pb];
  let common = 0;
  for (const p of pa) {
    const i = left.indexOf(p);
    if (i >= 0) { common++; left.splice(i, 1); }
  }
  return 2 * common / (pa.length + pb.length);
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "User-Agent": "ottawa-bike-repair-update", ...options.headers }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function downloadCity() {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: 4326, f: "geojson" });
  const city = await getJSON(`${CITY_LAYER}/query?${params}`);
  if (!city.features || city.exceededTransferLimit) throw new Error("Unexpected response from the city server");
  return city;
}

async function downloadOSM() {
  const data = `[out:json][timeout:60][bbox:${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}];nwr[amenity=bicycle_repair_station];out tags center;`;
  for (const url of OVERPASS) {
    try {
      const osm = await getJSON(url, { method: "POST", body: new URLSearchParams({ data }) });
      if (osm.remark) throw new Error(osm.remark);
      console.log(`OSM data as of ${osm.osm3s?.timestamp_osm_base} from ${new URL(url).host}`);
      return osm.elements.map(el => ({
        id: `${el.type[0]}${el.id}`, tags: el.tags || {},
        at: [el.lat ?? el.center.lat, el.lon ?? el.center.lon],
      }));
    } catch (e) {
      console.log(`  ${new URL(url).host} failed: ${e.message}`);
    }
  }
  throw new Error("Could not download OSM data, try again later");
}

// Nominatim allows one request per second, so the answers are kept in a file
function geocoder(cacheFile) {
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile)) : {};
  let last = 0;
  return async function geocode(key, params, reject) {
    if (!(key in cache)) {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, last + 1100 - Date.now())));
      const query = new URLSearchParams({
        ...params, format: "jsonv2", limit: 1, countrycodes: "ca", bounded: 1,
        viewbox: `${BBOX.west},${BBOX.north},${BBOX.east},${BBOX.south}`,
      });
      const [hit] = await getJSON(`${NOMINATIM}?${query}`);
      last = Date.now();
      cache[key] = hit ? { lat: +hit.lat, lon: +hit.lon, category: hit.category, name: hit.display_name } : null;
      fs.writeFileSync(cacheFile, `${JSON.stringify(cache, null, 1)}\n`);
    }
    const hit = cache[key];
    // a street or a neighbourhood is not a location, and neither is the same address in a neighbouring town
    if (!hit || reject.includes(hit.category) || !hit.name.includes("Ottawa")) return undefined;
    return [hit.lat, hit.lon];
  };
}

const xmlEscape = s => String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]);

function buildOSM(stations) {
  const xml = ["<?xml version='1.0' encoding='UTF-8'?>", "<osm version='0.6' generator='BikeOttawa/data-research'>"];
  stations.forEach((station, i) => {
    const [lat, lon] = station.locations[0].at;
    xml.push(`  <node id='${-(i + 1)}' action='modify' visible='true' lat='${lat.toFixed(7)}' lon='${lon.toFixed(7)}'>`);
    for (const [k, v] of Object.entries(tags(station))) if (v !== undefined) xml.push(`    <tag k='${xmlEscape(k)}' v='${xmlEscape(v)}' />`);
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

  let city;
  if (arg("--new")) city = JSON.parse(fs.readFileSync(arg("--new")));
  else {
    city = await downloadCity();
    const file = local(`bike-repair-${new Date().toLocaleDateString("en-CA")}.json`);
    fs.writeFileSync(file, `{"type":"FeatureCollection","features":[\n${city.features.map(f => JSON.stringify(f)).join(",\n")}\n]}\n`);
    console.log(`Saved ${path.basename(file)}`);
  }
  const old = JSON.parse(fs.readFileSync(local(OLD_DATASET))).features;
  const osm = await downloadOSM();

  // 1. locate every city station
  const geocode = geocoder(local(GEOCODE_CACHE));
  const sameSpot = {};
  for (const f of city.features) sameSpot[f.geometry.coordinates] = (sameSpot[f.geometry.coordinates] || 0) + 1;
  const stations = [];
  for (const [i, f] of city.features.entries()) {
    process.stdout.write(`\rLocating stations: ${i + 1}/${city.features.length}`);
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    const station = {
      name: p.LOCATION_EN.trim(), address: p.BUILDING_ADDRESS.trim(), description: (p.DESCRIPTION_EN || "").trim(),
      year: p.INSTALL_YR, locations: [],
    };
    const before = old.map(o => ({ o, score: similarity(o.properties.Location, station.name) })).sort((a, b) => b.score - a.score)[0];
    if (before && before.score >= SAME_NAME) {
      const [x, y] = before.o.geometry.coordinates;
      station.locations.push({ source: "2017 dataset", at: [y, x] });
    }
    if (sameSpot[f.geometry.coordinates] === 1 && Math.min(decimals(lon), decimals(lat)) >= MIN_DECIMALS)
      station.locations.push({ source: "city coordinates", at: [lat, lon] });
    const byAddress = await geocode(`address: ${station.address}`, { street: station.address, state: "Ontario" }, ["highway"]);
    if (byAddress) station.locations.push({ source: "address", at: byAddress });
    const place = station.name.replace(/\(.*?\)/g, "").trim();
    const byName = await geocode(`name: ${place}`, { q: `${place}, Ottawa` }, ["highway", "place", "boundary"]);
    if (byName) station.locations.push({ source: "name", at: byName });
    stations.push(station);
  }
  console.log();

  // 2. match them to OSM, closest pairs first, one to one
  const pairs = [];
  for (const station of stations)
    for (const node of osm) {
      const d = Math.min(Infinity, ...station.locations.map(l => distance(l.at, node.at)));
      if (d <= MATCH) pairs.push({ station, node, d });
    }
  for (const { station, node, d } of pairs.sort((a, b) => a.d - b.d)) {
    if (station.osm || node.station) continue;
    station.osm = node;
    station.distance = d;
    node.station = station;
  }

  // 3. report
  const label = s => `${s.name}, ${s.address}${s.year ? ` (${s.year})` : ""}`;
  const nearest = at => osm.map(node => ({ node, d: distance(at, node.at) })).sort((a, b) => a.d - b.d)[0];
  const missing = stations.filter(s => !s.osm && s.locations.length);
  const lost = stations.filter(s => !s.osm && !s.locations.length);
  console.log(`\nCity stations: ${stations.length}, already in OSM: ${stations.filter(s => s.osm).length}`);

  console.log(`\nMissing in OSM: ${missing.length}`);
  for (const s of missing) {
    const [lat, lon] = s.locations[0].at, near = nearest(s.locations[0].at);
    console.log(`  ${label(s)}\n      "${s.description}"; placed by ${s.locations[0].source} at ${lat.toFixed(5)},${lon.toFixed(5)}; nearest OSM station ${near.node.id} is ${Math.round(near.d)} m away`);
  }
  const loose = stations.filter(s => s.osm && s.distance > LOOSE).sort((a, b) => b.distance - a.distance);
  console.log(`\nIn OSM, but more than ${LOOSE} m from where the city data puts them (same station?): ${loose.length}`);
  for (const s of loose) console.log(`  ${label(s)}\n      "${s.description}"; ${Math.round(s.distance)} m from ${s.osm.id}${s.osm.tags.operator ? "" : ", which has no operator tag"}`);

  if (lost.length) console.log(`\nCould not be located, check manually: ${lost.length}`);
  for (const s of lost) console.log(`  ${label(s)}\n      "${s.description}"`);

  const city_ = node => /city of ottawa/i.test(`${node.tags.operator} ${node.tags.description}`);
  const extra = osm.filter(node => !node.station && city_(node));
  console.log(`\nCity of Ottawa stations in OSM that are not in the city dataset (removed, or duplicates): ${extra.length}`);
  for (const node of extra) {
    const other = osm.filter(n => n !== node).map(n => ({ n, d: distance(n.at, node.at) })).sort((a, b) => a.d - b.d)[0];
    const hint = other.d <= MATCH ? `; ${Math.round(other.d)} m from ${other.n.id}${other.n.station ? ` (${other.n.station.name})` : ""}, duplicate?` : "";
    console.log(`  ${node.id} at ${node.at.join(",")} ${node.tags.description ? `"${node.tags.description}"` : ""}${hint}`);
  }

  const out = arg("--out") || local(OUTPUT);
  fs.writeFileSync(out, buildOSM(missing));
  console.log(`\nSaved ${path.basename(out)}: ${missing.length} stations`);
}

main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
