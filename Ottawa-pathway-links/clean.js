"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);

let pools = reader('pathway-links-source.json')

pools.features.map(result => {

    const ref = result.properties.FACILITYID;
    const parkref = result.properties.PARK_ID;

    const properties = {
        'landuse': 'grass',
        'source': 'City of Ottawa',
        'source:date': '2018-01-03',
        'ref': ref,
        'ref:park': parkref
    };

    const link = turf.polygon(result.geometry.coordinates, properties)
    collection1.features.push(link);
    console.log("New link ", collection1.features.length);
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('pathway-links.osm', osm);
