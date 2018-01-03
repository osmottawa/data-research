"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('tennis-courts-source.json')

pools.features.map(result => {

    if(result.properties.OUTDOOR_CO=="0"){return}

    const name = result.properties.CLUB
    const name_fr = result.properties.CLUB_FR
    const ref = result.properties.FACILITYID
    const refpark = result.properties.PARK_ID
    const description = result.properties.COURT_TYPE
    const courts = result.properties.OUTDOOR_CO
    const lit = result.properties.LIGHTS?(result.properties.LIGHTS.match(/no/ig) ? 'no' : 'yes'):"";
    const wheelchair = result.properties.ACCESSIBLE.match(/no/ig) ? 'no' : 'yes'
    const tennis_benches = result.properties.BENCHES?(result.properties.BENCHES.match(/no/ig) ? 'no' : 'yes'):"";
    const tennis_clubhouse = result.properties.CLUBHOUSE?(result.properties.CLUBHOUSE.match(/no/ig) ? 'no' : 'yes'):"";
    const tennis_fence = result.properties.FENCE?(result.properties.FENCE.match(/no/ig) ? 'no' : 'yes'):"";
    const tennis_backwall = result.properties.BACKWALL?(result.properties.BACKWALL.match(/no/ig) ? 'no' : 'yes'):"";
    const tennis_indoor_courts = result.properties.INDOOR_COU!="0"?'yes':'';
    let access = ''
    let operator = ''
    if(result.properties.COURT_TYPE.match(/member/ig)){
      access='customers'
    }
    else if(result.properties.COURT_TYPE.match(/public/ig)){
      access='permissive'
      operator="City of Ottawa"
    }
    else if(result.properties.COURT_TYPE.match(/private/ig)){
      access='private';
      operator="Private Club"
    }
    else if(result.properties.COURT_TYPE.match(/school/ig)){
      access='customers';
      operator="School Board"
    }
    let surface = result.properties.SURFACE_CO
    if(result.properties.SURFACE_CO.match(/argile/ig)){
      surface='clay'
    }
    else if(result.properties.SURFACE_CO.match(/acryl/ig)){
      surface='acrylic'
    }
    else if(result.properties.SURFACE_CO.match(/asphalt/ig)){
      surface='asphalt'
    }


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
        'sport': 'tennis',
        'outdoor': 'yes',
        'seasonal': 'yes',
        'name': name,
        'name:fr': name_fr,
        'addr:street': street,
        'addr:housenumber': housenumber,
        'description': description,
        'courts': courts,
        'surface': surface,
        'wheelchair': wheelchair,
        'source': 'City of Ottawa',
        'source:date': '2018-01-02',
        'ref': ref
    };
    if(tennis_benches!=""){
        properties['tennis:benches'] = tennis_benches;
    }
    if(tennis_fence!=""){
        properties['tennis:fence'] = tennis_fence;
    }
    if(tennis_backwall!=""){
        properties['tennis:backwall'] = tennis_backwall;
    }
    if(tennis_clubhouse!=""){
        properties['tennis:clubhouse'] = tennis_clubhouse;
    }
    if(tennis_indoor_courts!=""){
        properties['tennis:indoor_courts'] = tennis_indoor_courts;
    }
    if(lit!=""){
        properties['lit'] = lit;
    }
    if(operator!=""){
        properties['operator'] = operator;
    }
    if(access!=""){
        properties['access'] = access;
    }
    if(refpark!="0"){
        properties['ref:park'] = refpark;
    }

    console.log("New court: ", name);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('tennis-outdoor.osm', osm);
fs.writeFileSync('tennis-outdoor-circles.geojson', JSON.stringify(collection2, null, 4));
