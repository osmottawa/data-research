"use strict";
//const turf = require("@turf/helpers");
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const   oldTree = rbush(),
        newTree = rbush(),
        newCircles = rbush()

const oldFeatures = reader('splash-pads-source_2017-09.json')
const newFeatures = reader('splash-pads-source_2022-05.geojson')

oldFeatures.features.forEach(place => {
    const point = turf.point(place.geometry.coordinates);
    oldTree.insert(point)
});

newFeatures.features.forEach(feat => {

    const fullroad = feat.properties.ADDRESS;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    street = street.replace('Ave.','Avenue').replace('Rd.','Road').replace('St.','Street').replace('Dr.','Drive').replace('Blvd.','Boulevard');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }
    const website = feat.properties.LINK;
    const wheelchair = feat.properties.ACCESSIBLE.match(/yes/g) ? 'yes' : 'no';
    const name = feat.properties.NAME + ' - ' + feat.properties.SHORTNAME;
    const name_fr = feat.properties.NAME_FR + ' - ' + feat.properties.PARKNAME_FR;
    const ref = feat.properties.FACILITYID

    let note = '';
    if(feat.properties.MONDAY && feat.properties.MONDAY.match('Closed')){note+='Monday,' }
    if(feat.properties.TUESDAY && feat.properties.TUESDAY.match('Closed')){note+='Tuesday,' }
    if(feat.properties.WEDNESDAY && feat.properties.WEDNESDAY.match('Closed')){note+='Wednesday,' }
    if(feat.properties.THURSDAY && feat.properties.THURSDAY.match('Closed')){note+='Thursday,' }
    if(feat.properties.FRIDAY && feat.properties.FRIDAY.match('Closed')){note+='Friday,' }
    if(feat.properties.SATURDAY && feat.properties.SATURDAY.match('Closed')){note+='Saturday,' }
    if(feat.properties.SUNDAY && feat.properties.SUNDAY.match('Closed')){note+='Sunday,' }
    if(note!=''){ note = 'Closed: '+note.slice(0,-1)}

    const properties = {
        name,
        'leisure': 'playground',
        'playground': 'splash_pad',
        'name': name,
        'name:fr': name_fr,
        'addr:housenumber': housenumber,
        'addr:street': street,
        'wheelchair': wheelchair,
        'seasonal': 'summer',
        'website' : website,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2022-05-28',
        'ref': ref
    };

    const point = turf.point(feat.geometry.coordinates, properties);
    let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 10, 'meters')).features  //check if there was an old one within 1m
    if(nearby.length){
        console.log("Duplicate: ", name);
        return;
    }

    console.log("New splash pad: ", name);

    const circle = turf.circle(point, 100, 10, 'meters');
    newCircles.insert(circle);
    newTree.insert(point)
});

console.log('Circles:',newCircles.all().features.length, 'Splashpads:',newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('splashpads.osm', osm);
fs.writeFileSync('splashpads-circles.geojson', JSON.stringify(newCircles.all(), null, 4));
