"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('sledding-hills-source.json')

pools.features.map(result => {
    
    const fullroad = result.properties.ADDRESS;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    street = street.replace('Ave.','Avenue').replace('Rd.','Road').replace('St.','Street').replace('Dr.','Drive').replace('Blvd.','Boulevard');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }
    const name = result.properties.NAME
    const name_fr = result.properties.NAME_FR
    const ref = result.properties.FACILITYID
    const descr = result.properties.OBSERVATIO
    
    const properties = {
        name,
        'name': name,
        'name:fr': name_fr,
        'area': 'yes',
        'piste:type':'sled',
        'route': 'piste',
        'addr:housenumber': housenumber,
        'addr:street': street,
        'seasonal': 'winter',
        'description': descr,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2017-12-08',
        'ref': ref                
    };
    console.log("New hill #", collection1.features.length+1);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);
    
    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('sledding-hills.osm', osm);
fs.writeFileSync('sledding-hills-circles.geojson', JSON.stringify(collection2, null, 4));
