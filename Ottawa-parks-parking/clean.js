"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const   oldTree = rbush(),
        newTree = rbush(),
        newCircles = rbush()

const oldFeatures = reader('parking-city-parks-source_2017-12.json')
const newFeatures = reader('parking-city-parks-source_2022-05.geojson')

oldFeatures.features.forEach(place => {
    const point = turf.point(place.geometry.coordinates);
    oldTree.insert(point)
});


newFeatures.features.forEach(place => {

    console.log(`Processing #${place.properties.FACILITYID}`)
    if(!place.geometry) return;
    const fullroad = place.properties.ADDRESS;
    const housenumber = fullroad?.match(/^\d[\d\-a-zA-Z]*/)[0] ?? undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    street = street?.replace(/ ave /ig,' Avenue, ').replace(/ rd /ig,' Road, ').replace(/ st /ig,' Street, ').replace(/ dr /ig,' Drive, ').replace(/ ave /ig,' Boulevard, ').replace(/ crt /ig,' Crescent, ').replace(/ lane /ig,' Lane, ').replace(/ cres /ig,' Crescent, ').replace(/ drive /ig,' Drive, ').replace(/ avenue /ig,' Avenue, ').replace(/ pl /ig,' Place, ').replace(/ way /ig,' Way, ').replace(/ crescent /ig,' Crescent, ').replace(/ road /ig,' Road, ').replace(/ blvd /ig,' Boulevard, ').replace(/ ter /ig,' Terrace, ').replace(/ PKWY /ig,' Parkway, ').replace(/ HWY 174 /ig,' Highway 174, ');
    street = street?.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street?.match(',')) {
        street = street.split(',')[0];
    }

    //capitalize 1st letter of each word
    street = street?.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});

    const ref = place.properties.FACILITYID
    const capacity = place.properties.CAPACITY
    const disabled = place.properties.ACCESSIBLE_PARKING_CAPACITY ?? ''
    const lit = place.properties.LIGHTING?(place.properties.LIGHTING.match(/yes/g) ? 'yes' : 'no'):'no';
    const fee = place.properties.PAID_PARKI?(place.properties.PAID_PARKI.match(/yes/g) ? 'yes' : 'no'):'no';
    const surface = place.properties.SURFACE

    const properties = {
        ref,
        'amenity': 'parking',
        'parking': 'surface',
        'access': 'permissive',
        'addr:housenumber': housenumber ?? '',
        'addr:street': street ?? '',
        'capacity': capacity,
        'capacity:disabled': disabled,
        'opening_hours': '06:00-23:00',
        'lit': lit,
        'surface': surface,
        'supervised': 'no',
        'fee': fee,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2022-05-28',
        'ref': ref
    };
    const point = turf.point(place.geometry.coordinates, properties);
    let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 10, 'meters')).features  //check if there was an old one within 1m
    if(nearby.length){
        console.log(`Duplicate @ ${housenumber}, ${street}`);
        return;
    }

    console.log(`New Feature @ ${housenumber}, ${street}`,);

    const circle = turf.circle(point, 100, 10, 'meters');
    newCircles.insert(circle);
    newTree.insert(point)
});

console.log('Circles: ',newCircles.all().features.length, 'Features: ',newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('parks-parking.osm', osm);
fs.writeFileSync('parks-parking-circles.geojson', JSON.stringify(newCircles.all(), null, 4));
