//takes previous dataset, new dataset, filters duplicates, builds OSM file with new campsite nodes

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const oldTree = rbush(),
  newTree = rbush(),
  newCircles = rbush()

//source: https://open.canada.ca/data/en/dataset/3969368d-33b5-47c8-8953-f31b15d8e007
const oldPlaces = reader('ottawa-pxo_empty.geojson')   //when there is an update to dataset replace this with previous dataset version (newCampsites previous value)
const newPlaces = reader('ottawa-pxo_2020-02-20.geojson') //when there is an update to dataset save that file and provide the name here

oldPlaces.features.map(place => {
  const point = turf.point(place.geometry.coordinates);
  oldTree.insert(point)
});

console.log('Total features: ', newPlaces.features.length)
let i=1;
newPlaces.features.map(place => {
  const properties = {
      'highway': 'crossing',
      'crossing': 'uncontrolled',
      'crossing_ref': 'pxo',
      'segregated': 'no',
      'flashing_lights': 'button',
      'source': 'City of Ottawa',
  };


  const point = turf.point(place.geometry.coordinates, properties);
  let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 10, 'meters')).features  //check if there was an old one within 1m
  if(nearby.length){
    return;
  }


  var circle = turf.circle(point, 100, 10, 'meters');
  newCircles.insert(circle);
  newTree.insert(point)
  console.log('New pxo',i++)
});

console.log('Circles:',newCircles.all().features.length, 'PXO:',newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('ottawa-new-pxo.osm', osm);
fs.writeFileSync('ottawa-new-pxo_circles.geojson', JSON.stringify(newCircles.all(), null, 4));
