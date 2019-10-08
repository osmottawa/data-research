//takes previous dataset, new dataset, filters duplicates, builds OSM file with new campsite nodes

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const oldTree = rbush(),
  newTree = rbush(),
  collection1 = turf.featureCollection([]);

const oldCampsites = reader('campsites_empty.geojson')
const newCampsites = reader('campsites_sites_camping_vw_2019-10-07.geojson')

oldCampsites.features.map(camp => {
  const point = turf.point(camp.geometry.coordinates);
  oldTree.insert(point)
});

newCampsites.features.map(camp => {


  const properties = {
      'tourism': 'camp_pitch',
      'source': 'Government of Canada',
      'ref': camp.properties.site_num_site
  };
  const name_e = camp.properties.name_e
  if(name_e && name_e.trim()!=''){properties['name']=name_e;properties['name:en']=name_e;}
  const name_fr = camp.properties.nom_f
  if(name_fr && name_fr.trim()!=''){properties['name:fr']=name_fr;}

  const point = turf.point(camp.geometry.coordinates, properties);
  let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 10, 10, 'meters')).features  //check if there was one within 10m
  if(nearby.length){
    return;
  }
  nearby = newTree.search(turf.circle(point.geometry.coordinates, 10, 10, 'meters')).features  //check if there was one within 10m
  if(nearby.length){
    return;
  }

  newTree.insert(point)
  console.log('New camp: ', name_e)
});

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('canada-new-campsites.osm', osm);
