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

//source: https://open.canada.ca/data/en/dataset/78af8288-d785-49e6-8773-e21a707d14ca
const oldPlaces = reader('components_empty.geojson')   //when there is an update to dataset replace this with previous dataset version (newCampsites previous value)
const newPlaces = reader('Facilities_Components_Installations_Composantes_Point_vw_2019_10_09.geojson') //when there is an update to dataset save that file and provide the name here

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
  if(accessible){properties['accessible']=accessible;};
  const name_e = place.properties.Name_e
  //if(name_e && name_e.trim()!=''){properties['name']=name_e.trim();}
  const name_fr = place.properties.Nom_f
  //if(name_fr && name_fr.trim()!=''){properties['name:fr']=name_fr.trim();}
  const ref = place.properties.OBJECTID
  if(ref){properties['ref']=ref}

  let type = place.properties.Component_Type_Composante;

  if(typeof type!=='undefined' && type!=null){
    if(type.indexOf('Fuel')!=-1){return;}
    if(type.indexOf('Footbridge')!=-1){return;}
    if(type.indexOf('Stairs')!=-1){return;}
    if(type.indexOf('Food Lockers')!=-1){return;}
    if(type.indexOf('Firewood ')!=-1){return;properties['shop']='firewood';type=''}
    if(type.indexOf('Exhibit')!=-1){return;}

    if(type.indexOf('Amphitheatre')!=-1){properties['amenity']='theatre';properties['theatre:type']='open_air'}
    if(type.indexOf('Barbeque')!=-1){properties['amenity']='bbq';type=''}
    if(type.indexOf('Bench')!=-1){properties['amenity']='bench';type=''}
    if(type.indexOf('Bike Shelter')!=-1){properties['amenity']='bike_parking';type=''}
    if(type.indexOf('Boat Launch')!=-1){properties['leisure']='slipway';type=''}
    if(type.indexOf('Boat Tie-Up')!=-1){properties['mooring']='yes';type=''}
    if(type.indexOf('Campfire')!=-1){properties['leisure']='firepit';type=''}
    if(type.indexOf('Emergency Shelter')!=-1){properties['amenity']='shelter';}
    if(type.indexOf('Drinking Water')!=-1){properties['amenity']='drinking_water';type=''}
    if(type.indexOf('Change Room')!=-1){properties['amenity']='dressing_room';type=''}
    if(type.indexOf('First Aid')!=-1){properties['amenity']='first_aid';type=''}
    if(type.indexOf('Flush Toilets')!=-1){properties['amenity']='toilets';properties['toilets:disposal']='flush';type=''}
    if(type.indexOf('Garbage (Drum Size)')!=-1){properties['amenity']='waste_basket';type=''}
    if(type.indexOf('Garbage (Dumpster)')!=-1){properties['amenity']='waste_disposal';type=''}
    if(type.indexOf('Group Campfire')!=-1){properties['leisure']='firepit';}
    if(type.indexOf('Group Camping')!=-1){properties['tourism']='camp_site';}
    if(type.indexOf('Boath Launch')!=-1){properties['leisure']='slipway';type=''}
    if(type.indexOf('Guardian')!=-1){properties['building']='cabin'}
    if(type.indexOf('Helicopter')!=-1){properties['aeroway']='helipad';type=''}
    if(type.indexOf('Indoor Theatre')!=-1){properties['amenity']='theatre';properties['building']='yes'}
    if(type.indexOf('Kiosk')!=-1){properties['building']='kiosk'}
    if(type.indexOf('Lighthouse')!=-1){properties['man_made']='lighthouse';type=''}
    if(type.indexOf('Lookout')!=-1){properties['tourism']='viewpoint';type=''}
    if(type.indexOf('Observation Tower')!=-1){properties['man_made']='tower';properties['tower:type']='observation';}
    if(type.indexOf('Telescope')!=-1){properties['man_made']='telescope';properties['telescope:type']='optical';}
    if(type.indexOf('Outhouse')!=-1){properties['amenity']='toilets';properties['toilets:disposal']='pitlatrine'}
    if(type.indexOf('Overnight Shelter')!=-1){properties['amenity']='shelter';}
    if(type.indexOf('Parking')!=-1){properties['amenity']='parking';properties['parking']='surface';type=''}
    if(type.indexOf('Kitchen Shelter')!=-1){properties['amenity']='shelter'}
    if(type.indexOf('Picnic Table')!=-1){properties['leisure']='picnic_table';type=''}
    if(type.indexOf('Recycling Bins')!=-1){properties['amenity']='recycling';type=''}
    if(type.indexOf('Service Building')!=-1){properties['building']='service'}
    if(type.indexOf('Showers')!=-1){properties['amenity']='shower';type=''}
    if(type.indexOf('Shuttle Shelter')!=-1){properties['amenity']='shelter'}
    if(type.indexOf('Store//Magasin')!=-1){properties['building']='retail';properties['shop']='yes'}
    if(type.indexOf('Swimming Pool')!=-1){properties['leisure']='swimming_pool';type=''}
    if(type.indexOf('Telephone')!=-1){properties['amenity']='telephone';type=''}
    if(type.indexOf('Tennis Court')!=-1){properties['leisure']='pitch';properties['sport']='tennis';type=''}
    if(type.indexOf('Trailhead')!=-1){properties['highway']='trailhead';type=''}
    if(type.indexOf('Tour Kiosk')!=-1){properties['building']='kiosk'}
    if(type.indexOf('Volleyball')!=-1){properties['leisure']='pitch';properties['sport']='volleyball';type=''}
    if(type.indexOf('Warden Cabin')!=-1){properties['building']='cabin'}
    if(type.indexOf('Weather station')!=-1){properties['man_made']='monitoring_station';properties['monitoring:weather']='yes'}

    if(type!=''){properties['description']=type;};
  }
  else{
    return;
  }

  const point = turf.point(place.geometry.coordinates, properties);
  let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 1, 10, 'meters')).features  //check if there was an old one within 1m
  if(nearby.length){
    return;
  }

const osm = geojson2osm.geojson2osm(newTree.all())
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
fs.writeFileSync('canada-new-park_components.osm', osm);
fs.writeFileSync('canada-new-park_components-extents.geojson', JSON.stringify(newExtents.all(), null, 4));
