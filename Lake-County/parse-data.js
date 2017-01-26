"use strict";
const fs = require("fs");
const changeCase = require("change-case");
const path = require("path");
const turf_1 = require("@turf/turf");
const features = require(path.join(__dirname, 'source', 'lake-county-roads.json'));
const results = turf_1.featureCollection([]);
const suffixLookup = require('./suffix.json');
const directionsLookup = require('./directions.json');
features.features.map(feature => {
    feature.geometry.coordinates.map(coords => {
        const name = changeCase.title(feature.properties['BaseStreet']);
        const suffix = suffixLookup[feature.properties['SuffixType']];
        const direction = directionsLookup[feature.properties['PrefixDire']];
        const ref = feature.properties['SegID'];
        const properties = {
            source: 'Lake County',
            highway: 'residential',
            maxspeed: feature.properties['SpeedLimit'] ? `${feature.properties['SpeedLimit']} mph` : undefined,
            name: [name, suffix, direction].join(' ').trim()
        };
        if (ref) {
            properties.ref = ref;
            properties['source:ref'] = 'Lake County';
        }
        results.features.push(turf_1.lineString(coords, properties));
    });
});
fs.writeFileSync('lake-county-roads.json', JSON.stringify(results, null, 4));
