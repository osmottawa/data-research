"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('parking-city-parks-source.json')

pools.features.map(result => {

    const fullroad = result.properties.ADDRESS;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    street = street.replace(/ ave /ig,' Avenue, ').replace(/ rd /ig,' Road, ').replace(/ st /ig,' Street, ').replace(/ dr /ig,' Drive, ').replace(/ ave /ig,' Boulevard, ').replace(/ crt /ig,' Crescent, ').replace(/ lane /ig,' Lane, ').replace(/ cres /ig,' Crescent, ').replace(/ drive /ig,' Drive, ').replace(/ avenue /ig,' Avenue, ').replace(/ pl /ig,' Place, ').replace(/ way /ig,' Way, ').replace(/ crescent /ig,' Crescent, ').replace(/ road /ig,' Road, ').replace(/ blvd /ig,' Boulevard, ').replace(/ ter /ig,' Terrace, ').replace(/ PKWY /ig,' Parkway, ').replace(/ HWY 174 /ig,' Highway 174, ');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }

    //capitalize 1st letter of each word
    street = street.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});

    const ref = result.properties.FACILITYID
    const capacity = result.properties.CAPACITY
    const disabled = result.properties.ACCESSIBLE
    const lit = result.properties.LIGHTING?(result.properties.LIGHTING.match(/yes/g) ? 'yes' : 'no'):'no';
    const fee = result.properties.PAID_PARKI?(result.properties.PAID_PARKI.match(/yes/g) ? 'yes' : 'no'):'no';
    const surface = result.properties.SURFACE

    const properties = {
        ref,
        'name': 'Parking Lot',
        'amenity': 'parking',
        'parking': 'surface',
        'access': 'permissive',
        'addr:housenumber': housenumber,
        'addr:street': street,
        'capacity': capacity,
        'capacity:disabled': disabled,
        'opening_hours': '06:00-23:00',
        'lit': lit,
        'surface': surface,
        'supervised': 'no',
        'fee': fee,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2017-12-28',
        'ref': ref
    };
    console.log("Parking #", collection1.features.length+1, '@', housenumber, street);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('parks-parking.osm', osm);
fs.writeFileSync('parks-parking-circles.geojson', JSON.stringify(collection2, null, 4));
