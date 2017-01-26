"use strict";
const geojson2osm_1 = require("geojson2osm");
const lodash_1 = require("lodash");
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");
// Load source dataset
const source = require(path.join(__dirname, 'oc-transpo-stops.json'));
// Load overpass data using GeoJSON & print results using `out meta`
// http://overpass-turbo.eu/s/iuT
const overpass = require(path.join(__dirname, 'oc-transpo-stops-overpass.json'));
// Set up index of source dataset
const index = {};
source.features.map(feature => index[feature.properties.ref] = feature.properties);
// Merge existing data with new data
const container = turf.featureCollection([]);
overpass.features.map(feature => {
    feature.properties = lodash_1.merge(feature.properties, index[feature.properties.ref]);
    feature.properties['@action'] = 'modify';
    feature.properties['@id'] = feature.properties['@id'].replace(/node\//, ''); // Remove extra ID syntax created by Overpass
    delete feature.properties['@timestamp']; // Breaks geojson2osm
    container.features.push(feature);
});
// Save OSM File
fs.writeFileSync(path.join(__dirname, 'oc-transpo-stops-gtfs.osm'), geojson2osm_1.geojson2osm(container));
