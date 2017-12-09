"use strict";
//const turf = require("@turf/helpers");
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('pools-source.json')

pools.features.map(result => {
    
    const fullroad = result.properties.ADDRESS;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
    street = street.replace('Ave.','Avenue').replace('Rd.','Road').replace('St.','Street').replace('Dr.','Drive').replace('Blvd.','Boulevard');
    street = street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South');
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }
    const website = result.properties.LINK;
    const wheelchair = result.properties.ACCESSIBLE.match(/yes/g) ? 'yes' : 'no';
    const name = result.properties.NAME;
    const name_fr = result.properties.NAME_FR;
    
    let note = '';
    if(result.properties.MONDAY && result.properties.MONDAY.match('Closed')){note+='Monday;' }
    if(result.properties.TUESDAY && result.properties.TUESDAY.match('Closed')){note+='Tuesday;' }
    if(result.properties.WEDNESDAY && result.properties.WEDNESDAY.match('Closed')){note+='Wednesday;' }
    if(result.properties.THURSDAY && result.properties.THURSDAY.match('Closed')){note+='Thursday;' }
    if(result.properties.FRIDAY && result.properties.FRIDAY.match('Closed')){note+='Friday;' }
    if(result.properties.SATURDAY && result.properties.SATURDAY.match('Closed')){note+='Saturday;' }
    if(result.properties.SUNDAY && result.properties.SUNDAY.match('Closed')){note+='Sunday;' }
    if(note!=''){ note = 'Closed: '+note}
    
    const properties = {
        name,
        'leisure': 'swimming_pool',
        'name': name,
        'name:fr': name_fr,
        'addr:housenumber': housenumber,
        'addr:street': street,
        'wheelchair': wheelchair,
        'covered': 'no',
        'seasonal': 'summer',
        'note': note,
        'website' : website,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2017-12-08'                 
    };
    console.log("New pool: ", name);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);
    
    var circle = turf.circle(result.geometry.coordinates, 100, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('pools.osm', osm);
fs.writeFileSync('pools-circles.geojson', JSON.stringify(collection2, null, 4));
