//takes previous dataset, new dataset, drops old ones, builds OSM file with new benches

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const oldTree = rbush(),
  newTree = rbush(),
  newExtents = rbush()

//source: https://open.ottawa.ca/datasets/benches
const oldPlaces = reader('empty.geojson')   //when there is an update to dataset replace this with previous dataset version
const newPlaces = reader('OttawaBenches_2020-04-05.geojson') //when there is an update to dataset save that file and provide the name here

oldPlaces.features.map(place => {
  const point = turf.point(place.geometry.coordinates);
  oldTree.insert(place)
});

console.log('Total features: ', newPlaces.features.length)
let i=1;
newPlaces.features.map(place => {
  const properties = {
      'amenity': 'bench',
      'source': 'City of Ottawa',
  };
  if(place.properties["BENCH_TYPE"]=="Bench"){
      properties['backrest']='yes'
  }
  if(place.properties["BENCH_TYPE"]=="Commemorative Bench"){
      properties['backrest']='yes'
      if(place.properties["NAME"]){
        properties['description']='Commemorative bench: '+place.properties["NAME"];
      }
      else{
        properties['description']='Commemorative bench'
      }
  }
  if(place.properties["BENCH_TYPE"]=="Older Adult Plan Bench"){
      properties['backrest']='yes'
  }
  if(place.properties["BENCH_TYPE"]=="Players Bench"){
      properties['backrest']='no'
      properties['description']='Players bench'
  }
  if(place.properties["BENCH_TYPE"]=="Grandstand"){
      properties['building']='grandstand'
      properties['leisure']='bleachers'
      properties['description']='Grandstand'
      properties['operator']='City of Ottawa'
  }
  if(place.properties["BENCH_TYPE"]=="Bleachers"){
      properties['leisure']='bleachers'
      properties['description']='Bleachers'
      properties['operator']='City of Ottawa'
  }

  if(place.properties["ACCESSIBLE"]=="yes//oui"){
      properties['accessible']='yes'
  }
  if(place.properties["YEAR_INSTA"]){
      properties['start_date']=place.properties["YEAR_INSTA"]
  }
  if(place.properties["PLAQUE_TEX"]){
      properties['inscription']=place.properties["PLAQUE_TEX"].replace('\r\n', ' ');
  }

  const point = turf.point(place.geometry.coordinates, properties);
  let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 100, 'meters')).features  //check if there was an old one within 1m
  if(nearby.find(ele => ele.id==place.id)){
    return;
  }

  //combine circles into clusters for task manager
  let circle = turf.circle(point, 100, 10, 'meters');
  nearby = newExtents.search(circle).features;
  for(let area of nearby ){
    circle = turf.union(area, circle)
    newExtents.remove(area);
  }
  circle.properties['benches']=nearby.length;
  newExtents.insert(circle);

  newTree.insert(point)
  console.log('New bench',i++)
});

console.log('Clusters:',newExtents.all().features.length, 'Benches:',newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('ottawa-new-benches.osm', osm);
fs.writeFileSync('ottawa-new-benches_clusters.geojson', JSON.stringify(newExtents.all(), null, 4));
