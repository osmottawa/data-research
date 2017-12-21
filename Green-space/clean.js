"use strict";
const turf = require("@turf/turf");
const multipolygon = require("turf-multipolygon");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);

let pools = reader('parks-source.json')

pools.features.map(result => {
    
    const name = result.properties.NAME;
    const name_fr = result.properties.NAME_FR;
    const ref = result.properties.PARK_ID;
    let dog = 'leash';
    const note = result.properties.DOG_DESI_2;
    if(result.properties.DOG_DESIGN==0){   //0=off leash; 1,4=leash; 3=no; 2=special, see notes
      dog='yes';
    }
    else if(result.properties.DOG_DESIGN==3){
      dog='no';      
    }
    else{
      dog = 'leash';
    }
    
    const fullroad = result.properties.ADDRESS;
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : 666;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : fullroad;
    street = street ? street.replace('Ave.','Avenue').replace('Rd.','Road').replace('St.','Street').replace('Dr.','Drive').replace('Blvd.','Boulevard'):undefined;
    street = street ? street.replace('E.','East').replace('N.','North').replace('W.','West').replace('S.','South'):undefined;
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }
        
    const properties = {
        name,
        'leisure': 'park',
        'name': name,
        'name:fr': name_fr,
        'addr:housenumber': housenumber,
        'addr:street': street,
        'dog': dog,
        'note': note,
        'operator': 'City of Ottawa',
        'source': 'City of Ottawa',
        'source:date': '2017-12-18',
        'ref': ref                
    };
    if(result.geometry.type=="MultiPolygon")    {
      for(let coords of result.geometry.coordinates)
      {
        const park = turf.polygon(coords, properties)
        collection1.features.push(park);
        console.log("New park ", collection1.features.length, name);
      }  
    }
    else {
      const park = turf.polygon(result.geometry.coordinates, properties)
      collection1.features.push(park);
      console.log("New park ", collection1.features.length, name);
    }
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('ottawa-parks.osm', osm);
