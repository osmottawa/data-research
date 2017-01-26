"use strict";
const concaveman = require("concaveman");
const helpers = require("geojson-helpers");
const turf = require("@turf/turf");
const data = './halifax-buildings.json';
const geojson = require(data);
const points = [];
geojson.features.map(feature => {
    turf.explode(feature).features.map(point => {
        points.push(point.geometry.coordinates);
    });
});
const extent = turf.polygon([concaveman(points)]);
const buffer = turf.buffer(extent, 500, 'meters');
const simple = turf.simplify(buffer, 0.001, false);
helpers.writeFileSync('./extent.geojson', turf.featureCollection([extent]));
helpers.writeFileSync('./buffer.geojson', turf.featureCollection([buffer]));
helpers.writeFileSync('./simple.geojson', turf.featureCollection([simple]));
