//take geojson with nodes and blow them up into circles for OSM task manager

"use strict";
//const turf = require("@turf/helpers");
const turf = require("@turf/turf");
const fs = require("fs");
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);

const features = reader('Other_Park_Features_nobridges.geojson')

features.features.map(result => {

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    circle.properties = result.properties
    collection1.features.push(circle)
});

fs.writeFileSync('circles.geojson', JSON.stringify(collection1, null, 4));
