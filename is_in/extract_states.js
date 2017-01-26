"use strict";
const fs = require("fs");
function writeHeader(stream) {
    stream.write('{\n');
    stream.write('"type": "FeatureCollection",\n');
    stream.write('"features": [\n');
}
function writeFooter(stream) {
    stream.write(']\n}\n');
}
function writeFeatureEnd(stream, index, array) {
    if (index + 1 !== array.length)
        stream.write(',\n');
    else
        stream.write('\n');
}
function readGeoJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}
function toFix(array) {
    return array.map(value => {
        if (typeof (value) === 'object')
            return toFix(value);
        return Number(value.toFixed(6));
    });
}
function pick(object, keys) {
    const properties = {};
    Object.keys(object).map(key => {
        if (keys.indexOf(key) !== -1) {
            properties[key] = object[key];
        }
    });
    return properties;
}
function writeFeature(stream, feature, index, array) {
    stream.write(JSON.stringify(feature));
    writeFeatureEnd(stream, index, array);
}
function writeGeoJSON(filepath, geojson, properties) {
    const stream = fs.createWriteStream(filepath);
    writeHeader(stream);
    geojson.features.map((feature, index, array) => {
        if (pick) {
            feature.properties = pick(feature.properties, properties);
        }
        feature.geometry.coordinates = toFix(feature.geometry.coordinates);
        writeFeature(stream, feature, index, array);
    });
    writeFooter(stream);
}
/**
 * # Application
 *
 * ## Pre-Processing
 *
 * $ osmtogeojson overpass-query.osm > overpass-query.geojson
 */
const states = readGeoJSON('overpass-query.geojson');
states.features = states.features.filter(feature => {
    return (feature.properties.boundary === 'administrative' &&
        feature.properties.admin_level === '4' &&
        feature.properties.id.match(/relation/));
});
writeGeoJSON('ca-states.geojson', states, ['name:en', 'boundary', 'admin_level', 'name', 'ISO3166-2', 'ref', 'wikidata', 'wikipedia', 'state_code', 'is_in:country', 'is_in:country_code', 'is_in:continent']);
console.log(states.features.length);
