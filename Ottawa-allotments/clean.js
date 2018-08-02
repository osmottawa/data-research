"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

const today = new Date().toISOString().slice(0,10)

let gardens = reader('CSS_communityGardens-2018-08-01.geojson')

gardens.features.map(garden => {


    const props1 = {
        'landuse': 'allotments',
        'name': garden.properties.GARDEN.trim(),
        'name:fr': garden.properties.JARDIN.trim(),
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': today,
        'website': garden.properties.LINK,
        'description': 'Community garden located at '+garden.properties.LEGAL_ADDR
    };



    for (let propName in props1) {
      if (props1[propName] == "") {
        delete props1[propName];
      }
    }
    console.log("New garden: ", garden.properties.GARDEN);
    const point = turf.point(garden.geometry.coordinates, props1);
    collection1.features.push(point);

    var circle = turf.circle(garden.geometry.coordinates, 100, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('ottawa-allotments.osm', osm);
fs.writeFileSync('ottawa-allotments-circles.geojson', JSON.stringify(collection2, null, 4));
