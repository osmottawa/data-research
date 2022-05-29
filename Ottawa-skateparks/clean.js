"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const   oldTree = rbush(),
        newTree = rbush(),
        newCircles = rbush()

const slug = "skateboard-parks"
const oldFeatures = reader(`${slug}-source_2017-12.json`)
const newFeatures = reader(`${slug}-source_2022-05.geojson`)

oldFeatures.features.forEach(place => {
    const point = turf.point(place.geometry.coordinates);
    oldTree.insert(point)
});

newFeatures.features.map(place => {

    const name = place.properties.NAME;
    const name_fr = place.properties.NAME_FR;
    const ref = place.properties.FACILITYID
    const description = place.properties.DESCRIPTION
    const description_fr = place.properties.DESCRIPTION_FR

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
    const wheelchair = place.properties.ACCESSIBLE.match(/yes/g) ? 'yes' : 'no';

    const properties = {
        'name': name ?? '',
        'leisure': 'pitch',
        'sport': 'skateboard',
        'wheelchair': wheelchair,
        'name': name ?? '',
        'name:en': name ?? '',
        'name:fr': name_fr ?? '',
        'addr:street': street ?? '',
        'addr:housenumber': housenumber ?? '',
        'description': description ?? '',
        'description:en': description ?? '',
        'description:fr': description_fr ?? '',
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
fs.writeFileSync(`${slug}.osm`, osm);
fs.writeFileSync(`${slug}-circles.geojson`, JSON.stringify(newCircles.all(), null, 4));
