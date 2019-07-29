//prepare for import in task manager - take GeoJSON with data and blow up circles around each point used for task creation

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);

const cams = reader('redlightcameralocations20181126.geojson')

cams.features.map(cam => {
    var circle = turf.circle(cam.geometry.coordinates, 100, 10, 'meters');
    collection1.features.push(circle)
});

fs.writeFileSync('ottawa-redcams-circles.geojson', JSON.stringify(collection1, null, 4));
