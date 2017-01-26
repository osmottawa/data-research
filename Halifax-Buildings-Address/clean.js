"use strict";
const turf = require("@turf/helpers");
const helpers = require("geojson-helpers");
const data = require('./halifax-buildings.json');
const collection = turf.featureCollection(data.features.map(feature => {
    feature.properties = { building: 'yes' };
    return feature;
}));
helpers.writeFileSync('halifax-buildings.geojson', collection);
