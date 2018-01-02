"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('outdoor-rinks-source.json')

pools.features.map(result => {

    const name = result.properties.NAME
    const name_fr = result.properties.NAME_FR
    const type = result.properties.RINK_TYPE.toLowerCase().replace(/ /g,"_")
    let description = "Outdoor ice rink ("+result.properties.RINK_TYPE+") at "+ result.properties.PARKNAME
    let operator = result.properties.ICE_MAINTE ? result.properties.ICE_MAINTE : "City of Ottawa"
    operator = operator.match(/City/g) ? 'City of Ottawa' : operator
    const facility = result.properties.FACILITY.match(/none/ig) ? 'no' : result.properties.FACILITY
    const boards = result.properties.BOARDS_TYP.match(/none/ig) ? 'no' : result.properties.BOARDS_TYP.toLowerCase()
    const change_area = result.properties.PUBLIC_CHA.match(/no/ig) ? 'no' : 'yes'
    const toilets = result.properties.TOILET.match(/no/ig) ? 'no' : 'yes'
    const lit = result.properties.LIGHTS_TYP.match(/none/ig) ? 'no' : 'yes'
    const lights = result.properties.LIGHTS_TYP.match(/none/ig) ? 'no' : result.properties.LIGHTS_TYP.toLowerCase()
    const supervised = result.properties.SUPERVISIO?(result.properties.SUPERVISIO.match(/no/ig) ? 'no' : 'yes'):'no'
    const park = result.properties.PARK_ID
    const wheelchair = result.properties.ACCESSIBLE.match(/no/ig) ? 'no' : 'yes'
    if(supervised=='yes'){
      description = description+ ". Supervised time: "+result.properties.SUPERVISED
      description = description.replace(/\r\n/g, ". ").replace(/\n/g, ". ").replace(/  /g, " ").trim().substring(0,255).trim()
    }
    const rinkname = result.properties.PARKNAME?(result.properties.PARKNAME+" Ice Rink"):""



    const properties = {
        'leisure': 'ice_rink',
        'description': description,
        'seasonal': 'winter',
        'access': 'permissive',
        'ice_rink:type': type,
        'ice_rink:boards': boards,
        'ice_rink:lights': lights,
        'ice_rink:facility': facility,
        'change_area': change_area,
        'toilets': toilets,
        'operator': operator,
        'supervised': supervised,
        'source': 'City of Ottawa',
        'source:date': '2017-12-31',
        'wheelchair': wheelchair,
        'ref:park': park
    };
    if(name!="Outdoor Rink"){
      properties['name'] = name;
      properties['name:fr'] = name_fr;
    }
    else{
      if(rinkname!=""){
        properties['name'] = rinkname;
      }
    }

    console.log("New rink: ", result.properties.PARK_ID);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('outdoor-rinks.osm', osm);
fs.writeFileSync('outdoor-rinks-circles.geojson', JSON.stringify(collection2, null, 4));
