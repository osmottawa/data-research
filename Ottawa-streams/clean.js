"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const togpx = require('togpx');

const collection1 = turf.featureCollection([]);

let source = reader('rivers-source.json')
source.features.map(result => {

    const properties = {
        'waterway': 'stream',
        'source': 'City of Ottawa'
    };

    const stream = turf.lineString(result.geometry.coordinates, properties)
    collection1.features.push(stream);
    console.log("New stream ", collection1.features.length);
});


fs.writeFileSync('streams.osm', geojson2osm.geojson2osm(collection1));
fs.writeFileSync('streams.gpx', togpx(collection1));
