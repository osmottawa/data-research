"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);

let footways = reader('pedestrian-network-2019-02-28.json')
footways.features.map(footway => {

  if(footway.properties.WALK_TYPE == 'SIDEWALK' && footway.geometry.type!="MultiLineString")
  {

    const properties = {
        'highway': 'footway',
        'footway': 'sidewalk',
        'width': '1.5',
        'surface': 'concrete',
        'source': 'City of Ottawa'
    };

    const way = turf.lineString(footway.geometry.coordinates, properties)
    collection1.features.push(way);
    console.log("New sidewalk ", collection1.features.length);
  }
});


fs.writeFileSync('ottawa-sidewalks.osm', geojson2osm.geojson2osm(collection1));
