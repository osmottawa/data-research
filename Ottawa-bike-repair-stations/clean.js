"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let pools = reader('bikerepairlocations2017shp.json')

pools.features.map(result => {

    let description = result.properties.Descriptio+ " at "+ result.properties.Location




    const properties = {
        'amenity': 'bicycle_repair_station',
        'description': description,
        'service:bicycle:pump': 'yes',
        'service:bicycle:chain_tool': 'yes',
        'operator': 'City of Ottawa',
        'website': 'https://ottawa.ca/en/residents/transportation-and-parking/road-safety/cycling-safety#locations-bike-repair-stations-city-ottawa'
    };

    console.log("New station: ", description);
    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 100, 10, 'meters');
    collection2.features.push(circle)
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('ottawa-bike-repair-stations.osm', osm);
fs.writeFileSync('ottawa-bike-repair-stations-circles.geojson', JSON.stringify(collection2, null, 4));
