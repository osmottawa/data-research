"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

const today = new Date().toISOString().slice(0,10)

let places = reader('licensed-child-care-centresshp-2019-02-28.json')

places.features.map(place => {

  const fullroad = place.properties.ADDRESS;
  let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
  let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(/,$/, '').trim() : undefined;
  let website = place.properties.LINK ? 'http://'+place.properties.LINK : '';
  let language = place.properties.LANGUAGE_O? place.properties.LANGUAGE_O.replace(',',';').toLowerCase():'';
  let phone = place.properties.PHONE?'+1-'+place.properties.PHONE : '';
  phone = phone.replace('(','').replace(')','');

  const props1 = {
      'amenity': 'kindergarten',
      'name': place.properties.NAME,
      'addr:housenumber': housenumber,
      'addr:street': street,
      'addr:postal_code': place.properties.POSTALCODE,
      'phone': phone,
      'website': website,
      'isced:level': 0,
      'school:language': language,
      'source': 'City of Ottawa',
      'source:date': today
  };



    for (let propName in props1) {
      if (props1[propName] == "" || typeof(props1[propName]) == "undefined") {
        delete props1[propName];
      }
      else{
        props1[propName] = props1[propName].replace(/\s+/g, " ").replace('&','&&');
      }
    }
    console.log(`New place ${props1.name} at ${housenumber}, ${street}`);
    const point = turf.point(place.geometry.coordinates, props1);
    collection1.features.push(point);

    //var circle = turf.circle(bin.geometry.coordinates, 100, 10, 'meters');
    //collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('ottawa-childcare.osm', osm);
//fs.writeFileSync('ottawa-gritbins-circles.geojson', JSON.stringify(collection2, null, 4));
