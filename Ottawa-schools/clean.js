"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('schools-2015.json')

pools.features.map(result => {

    const name = result.properties.NAME.replace("  "," ").trim()
    const name_fr = result.properties.NAME_FR.replace("  "," ").trim()
    const operator = result.properties.FULL_BOARD ? result.properties.FULL_BOARD : "Private"
    let isced = "Unknown"
    if(result.properties.CATEGORY=="Elementary"){isced = "1"}
    if(result.properties.CATEGORY=="Secondary"){isced = "2;3"}
    if(result.properties.CATEGORY=="Intermediate"){isced = "2"}
    if(name.match(/ High /ig)) {isced = "3"}
    const phone = "+1-"+result.properties.PHONE
    const fax = "+1-"+result.properties.FAX
    const housenumber = result.properties.NUM
    let street = result.properties.STREET
    street = street.substring(street.indexOf(" ") + 1);
    street = street.replace(' Ave',' Avenue').replace(' Rd',' Road').replace(' St',' Street').replace(' Dr',' Drive').replace(' Blvd',' Boulevard').replace(' Cr',' Crescent');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    const postal = result.properties.POSTAL


    const properties = {
        'amenity': 'school',
        'name': name,
        'name:en': name,
        'name:fr': name_fr,
        'phone': phone,
        'fax': fax,
        'isced:level': isced,
        'addr:street': street,
        'addr:housenumber': housenumber,
        'addr:postcode': postal,
        'operator': operator
    };

    //console.log(`New school: ${name} at ${housenumber}, ${street} - level ${isced}`);
    console.log(street)
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    const circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    circle.properties = properties
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('ottawa-schools.osm', osm);
fs.writeFileSync('schools-circles.geojson', JSON.stringify(collection2, null, 4));
