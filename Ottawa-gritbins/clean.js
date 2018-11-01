"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

const today = new Date().toISOString().slice(0,10)

let bins = reader('pwgritbox-2018-08-02.json')

bins.features.map(bin => {


    const props1 = {
        'amenity': 'grit_bin',
        'access': 'yes',
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'ref': bin.properties.ID,
        'source:date': today,
        'description': 'Grit box located near '+bin.properties.LOCATION
    };



    for (let propName in props1) {
      if (props1[propName] == "") {
        delete props1[propName];
      }
    }
    console.log("New bin: ", bin.properties.LOCATION);
    const point = turf.point(bin.geometry.coordinates, props1);
    collection1.features.push(point);

    var circle = turf.circle(bin.geometry.coordinates, 100, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('ottawa-gritbins.osm', osm);
fs.writeFileSync('ottawa-gritbins-circles.geojson', JSON.stringify(collection2, null, 4));
