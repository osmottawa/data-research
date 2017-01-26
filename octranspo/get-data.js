"use strict";
const fs = require("fs");
const path = require("path");
const Baby = require("babyparse");
const turf = require("@turf/turf");
const lodash_1 = require("lodash");
const parsed = Baby.parseFiles(path.join(__dirname, 'gtfs', 'stops.txt'));
const headers = parsed.data.shift();
const features = turf.featureCollection([]);
const data = parsed.data;
function parseRef(ref) {
    if (ref) {
        if (ref.length === 4) {
            return ref;
        }
        else if (ref.length === 3) {
            //console.log('WARNING - Padded reference number', ref)
            return `0${ref}`;
        }
    }
}
function parseName(name) {
    if (name) {
        const words = [];
        name.split(/[ ]+/g).map(word => {
            word = word.replace(/DR\./, 'Drive');
            word = word.replace(/ST\./, 'Street');
            word = word.replace(/RD\./, 'Road');
            word = word.replace(/W\./, 'West');
            word = word.replace(/\\/g, '/');
            word = word.replace(/H\.S\./, 'High School');
            if (!word.match(/[\.\d]/))
                word = lodash_1.capitalize(word);
            if (word.match(/^\(/))
                word = `(${lodash_1.capitalize(word.slice(1))}`;
            words.push(word);
        });
        return words.join(' ');
    }
}
data.map(items => {
    const properties = {};
    let column = 0;
    items.map(item => {
        if (item)
            properties[headers[column]] = item;
        column++;
    });
    if (properties) {
        // Handle OSM properties
        const lat = parseFloat(properties['stop_lat']);
        const lng = parseFloat(properties['stop_lon']);
        const name = parseName(properties['stop_name']);
        const osm = {
            name,
            operator: 'OC Transpo',
            source: 'City of Ottawa',
            public_transport: 'platform',
            highway: 'bus_stop',
            bus: 'yes',
            stop_id: properties['stop_id'],
            'source:stop_id': 'gtfs'
        };
        // Handle Ref
        const ref = parseRef(properties['stop_code']);
        if (ref) {
            osm.ref = ref;
            osm['source:ref'] = 'OC Transpo';
        }
        else {
            osm.fixme = 'No reference number';
            console.log('WARNING - No Reference number:', osm.name);
        }
        // Add Feature
        const feature = turf.point([lng, lat], osm);
        if (lat & lng)
            features.features.push(feature);
    }
});
fs.writeFileSync(path.join(__dirname, 'oc-transpo-stops.json'), JSON.stringify(features, null, 4));
