"use strict";
const helpers = require("geojson-helpers");
const geojson = helpers.readFileSync('./GEBADR-address-points.geojson');
geojson.features = geojson.features.map(feature => {
    feature.properties.source = 'Canton Berne';
    return feature;
});
helpers.writeFileSync('./GEBADR-address-points-compact.geojson', geojson, ['addr:housenumber', 'addr:postcode', 'addr:city', 'addr:street', 'source']);
