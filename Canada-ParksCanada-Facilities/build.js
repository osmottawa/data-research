//takes previous dataset, new dataset, filters duplicates, builds OSM file with new campsite nodes

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const oldTree = rbush(),
  newTree = rbush(),
  newExtents = rbush()

//source: https://open.canada.ca/data/en/dataset/3969368d-33b5-47c8-8953-f31b15d8e007
const oldPlaces = reader('facilities_empty.geojson')   //when there is an update to dataset replace this with previous dataset version (newCampsites previous value)
const newPlaces = reader('Facilities_Installation_Point_vw_2019-10-09.geojson') //when there is an update to dataset save that file and provide the name here

oldPlaces.features.map(place => {
  const point = turf.point(place.geometry.coordinates);
  oldTree.insert(point)
});

console.log('Total features: ', newPlaces.features.length)
let i=1;
newPlaces.features.map(place => {
  const properties = {
      'source': 'Government of Canada',
  };
  const accessible = place.properties.Accessible=='Yes//Oui'?'yes':(place.properties.Accessible=='No//Non'?'no':'');
  if(accessible!=''){properties['accessible']=accessible;};
  const name_e = place.properties.name_e
  if(name_e && name_e.trim()!=''){properties['name']=name_e.trim();}
  const name_fr = place.properties.nom_f
  if(name_fr && name_fr.trim()!=''){properties['name:fr']=name_fr.trim();}
  if(accessible!=''){properties['accessible']=accessible;};

  let type = place.properties.Facility_Type_Installation;

  if(typeof type!=='undefined' && type!=null){

    if(type.indexOf('Front-Country Camping')!=-1){properties['tourism']='camp_site';type=''}
    if(type.indexOf('Backcountry Camping')!=-1){properties['tourism']='camp_site';properties['backcountry']='yes';type=''}
    if(type.indexOf('Airstrip')!=-1){properties['aeroway']='airstrip';type=''}
    if(type.indexOf('Climbing Area')!=-1){properties['natural']='cliff';properties['sport']='climbing';type=''}
    if(type.indexOf('Bridge//pont')!=-1){properties['bridge:name']=name_e;type=''}
    if(type.indexOf('Picnic / Day')!=-1){properties['tourism']='picnic_site';type=''}
    if(type.indexOf('Garbage')!=-1){properties['amenity']='waste_disposal';type=''}
    if(type.indexOf('Boat Launch')!=-1){properties['leisure']='slipway';type=''}
    if(type.indexOf('Playground')!=-1){properties['leisure']='playground';type=''}
    if(type.indexOf('Washroom')!=-1){properties['amenity']='toilets';type=''}
    if(type.indexOf('Warden')!=-1){properties['building']='cabin';type=''}
    if(type.indexOf('Visitor Centre')!=-1){properties['building']='yes';properties['tourism']='information';type=''}
    if(type.indexOf('Trailhead')!=-1){properties['highway']='trailhead';type=''}
    if(type!=''){properties['description']=place.properties.Facility_Type_Installation;};

  }

  const point = turf.point(place.geometry.coordinates, properties);
  let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 10, 'meters')).features  //check if there was an old one within 1m
  if(nearby.length){
    return;
  }


  var circle = turf.circle(point, 500, 10, 'meters');
  nearby = newExtents.search(circle).features;
  for(let area of nearby ){
    circle = turf.union(area, circle)
    newExtents.remove(area);
  }
  circle.properties['name']=name_e;
  circle.properties['places']=nearby.length;
  newExtents.insert(circle);


  newTree.insert(point)
  console.log('New place',i++, name_e)
});

console.log('Extents:',newExtents.all().features.length, 'Places:',newTree.all().features.length)

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('canada-new-facilities.osm', osm);
fs.writeFileSync('canada-new-facilities-extents.geojson', JSON.stringify(newExtents.all(), null, 4));
