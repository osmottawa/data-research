"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('skateboard-parks-source.json')

pools.features.map(result => {

    const name = result.properties.NAME;
    const name_fr = result.properties.NAME_FR;
    const ref = result.properties.FACILITYID
    const description = result.properties.DESCRIPTIO

    const fullroad = result.properties.ADDRESS;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    street = street.replace('Ave.','Avenue').replace('Rd.','Road').replace('St.','Street').replace('Dr.','Drive').replace('Blvd.','Boulevard');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }

    const properties = {
        name,
        'leisure': 'pitch',
        'sport': 'skateboard',
        'name': name,
        'name:fr': name_fr,
        'addr:street': street,
        'addr:housenumber': housenumber,
        'description': description,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2017-12-30',
        'ref': ref
    };
    console.log("New skate park: ", name);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('skateparks.osm', osm);
fs.writeFileSync('skateparks-circles.geojson', JSON.stringify(collection2, null, 4));
