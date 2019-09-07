"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const lampTree = rbush()

const collection1 = turf.featureCollection([]);

let lamps = reader('Street_Lights-2019-09-05.geojson')

lamps.features.map(lamp => {

    const ref = lamp.properties.OBJECTID;
    let type = '';
    if(lamp.properties.LIGHT_SOUR=='HPS'){type='high_pressure_sodium'}
    if(lamp.properties.LIGHT_SOUR=='LED'){type='led'}
    if(lamp.properties.LIGHT_SOUR=='LPS'){type='low_pressure_sodium'}
    if(lamp.properties.LIGHT_SOUR=='MH'){type='metal-halide'}
    if(lamp.properties.LIGHT_SOUR=='MV'){type='mercury'}
    if(lamp.properties.LIGHT_SOUR=='LIGHT BULB'){type='electric'}

    let count = parseInt(lamp.properties.LIGHTS_NUM);
    let pole = '';
    let material='';
    if(lamp.properties.HEAD_STYLE.indexOf('WALL')!=-1){pole='wall'}
    if(lamp.properties.HEAD_STYLE.indexOf('COBRA')!=-1){pole='bent_mast'}
    if(lamp.properties.HEAD_STYLE.indexOf('LANTERN')!=-1){pole='straight_mast'}
    if(lamp.properties.HEAD_STYLE.indexOf('POST TOP')!=-1){pole='straight_mast'}
    if(lamp.properties.HEAD_STYLE.indexOf('CLDM')!=-1){pole='bent_mast'}
    if(lamp.properties.HEAD_STYLE.indexOf('CLSM')!=-1){pole='bent_mast'; count=2;}
    if(lamp.properties.POLE_TYPE.indexOf('ALUM')!=-1){material='metal'}
    if(lamp.properties.POLE_TYPE.indexOf('WOOD')!=-1){material='wood'}
    if(lamp.properties.POLE_TYPE.indexOf('METAL')!=-1){material='metal'}
    if(lamp.properties.POLE_TYPE.indexOf('STEEL')!=-1){material='metal'}
    if(lamp.properties.POLE_TYPE.indexOf('CONCRETE')!=-1){material='concrete'}
    if(lamp.properties.POLE_TYPE.indexOf('HAMPT')!=-1){material='concrete'}

    let height = parseInt(lamp.properties.POLE_HEIGH);
    if(height>40){height=0};

    if(lamp.properties.HEAD_STYLE=='RECEPTACLE'){return};

    const properties = {
        'highway': 'street_lamp',
        'source': 'City of Ottawa',
        'lamp_ref': parseInt(ref),
    };
    if(type!=''){properties['lamp_type']=type};
    if(pole!=''){properties['lamp_mount']=pole};
    if(material!=''){properties['material']=material};
    if(count>0){properties['lamp_flames']=count};
    if(height>1){properties['height']=height};

    const point = turf.point(lamp.geometry.coordinates, properties);
    let nearby = lampTree.search(turf.circle(point.geometry.coordinates, 2, 10, 'meters')).features
    //let nearby = lampTree.search(point).features

    let removed=false
    for(let l of nearby ){
      if(l.properties['lamp_ref']<point.properties['lamp_ref']){
        lampTree.remove(l);
        removed=true
        console.log("Removed lamp")
      }
    }
    if(removed || nearby.length==0){
      lampTree.insert(point)
      console.log("Added lamp")
    }

  });

const osm = geojson2osm.geojson2osm(lampTree.all())
fs.writeFileSync('ottawa-street-lights.osm', osm);
