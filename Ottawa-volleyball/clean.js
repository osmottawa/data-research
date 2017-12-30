"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('volleyball-courts-source.json')

pools.features.map(result => {

    const name = result.properties.NAME;
    const name_fr = result.properties.NAME_FR;
    const ref = result.properties.FACILITYID
    const sport = (result.properties.NAME=="sand")?"beachvolleyball":"volleyball";
    const surface = (result.properties.SURFACE_TY)?result.properties.SURFACE_TY:"unknown";
    const courts = (result.properties.NO_COURTS)?result.properties.NO_COURTS:"unknown";
    const properties = {
        name,
        'leisure': 'pitch',
        'sport': sport,
        'surface': surface,
        'courts': courts,
        'name': name,
        'name:fr': name_fr,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2017-12-26',
        'ref': ref
    };
    console.log("New court: ", name);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('volleyball.osm', osm);
fs.writeFileSync('volleyball-circles.geojson', JSON.stringify(collection2, null, 4));
