"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const pitchTree = rbush()
const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

let source = reader('sports-fields-source.json')

source.features.map(result => {

    //const name = result.properties.FIELD_NAME
    //const name_en = result.properties.FIELD_NAME
    //const name_fr = result.properties.FIELD_NA_1
    const ref = result.properties.FACILITYID
    const refpark = result.properties.PARK_ID
    const description = result.properties.FIELD_NAME
    const lit = result.properties.LIGHTS?(result.properties.LIGHTS.match(/no/ig) ? 'no' : 'yes'):"";
    const wheelchair = result.properties.ACCESSIBLE?(result.properties.ACCESSIBLE.match(/no/ig) ? 'no' : 'yes'):'no'
    let sport = result.properties.REGULAR_US.match(/multi/ig)?'multi':result.properties.REGULAR_US


    let pitch_size = result.properties.FIELD_SIZE
    const pitch_width = result.properties.WIDTH
    const pitch_length = result.properties.LENGTH
    const pitch_bleachers = result.properties.BLEACHERS?(result.properties.BLEACHERS.match(/no/ig) ? 'no' : 'yes'):"undefined";
    const pitch_players_bench = result.properties.PLAYERS_BE?(result.properties.PLAYERS_BE.match(/no/ig) ? 'no' : 'yes'):"undefined";
    const pitch_running_track = result.properties.RUNNING_TR?(result.properties.RUNNING_TR.match(/no/ig) ? 'no' : 'yes'):"undefined";
    let pitch_post_type= result.properties.POST_TYPE?(result.properties.POST_TYPE.match(/none/ig) ? 'no' : result.properties.POST_TYPE):"undefined";

    sport = sport.replace('football', 'american_football');
    sport = sport.match(/general/ig)?'multi':sport
    pitch_post_type = pitch_post_type.replace('football', 'american_football')
    pitch_post_type = pitch_post_type.match(/both/ig)?'soccer;american_football':pitch_post_type
    pitch_size = pitch_size.replace('int','intermediate')

    const properties = {
        'leisure': 'pitch',
        'sport': sport,
        //'outdoor': 'yes',
        //'seasonal': 'yes',
        'access': 'yes',
        //'name': name,
        //'name:fr': name_fr,
        'description': description,
        'surface': 'grass',
        //'wheelchair': wheelchair,
        'source': 'City of Ottawa',
        'source:date': '2018-01-05',
        'ref': ref,
        'ref:park': refpark,
        //'operator': 'City of Ottawa',
        'lit': lit,
        'pitch:size': pitch_size,
        'pitch:width': pitch_width,
        'pitch:length': pitch_length,
        'pitch:bleachers': pitch_bleachers,
        'pitch:players_bench': pitch_players_bench,
        'pitch:running_track': pitch_running_track,
        'pitch:posts': pitch_post_type
    };

    const point = turf.point(result.geometry.coordinates, properties);
    collection1.features.push(point);

    var circle = turf.circle(result.geometry.coordinates, 200, 10, 'meters');
    let nearby = pitchTree.search(circle).features
    for(let pitch of nearby ){
      circle = turf.union(pitch, circle)
      pitchTree.remove(pitch);
    }

    pitchTree.insert(circle)

    console.log("New field: ", collection1.features.length);

});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('sports-fields.osm', osm);
fs.writeFileSync('sports-fields-circles.geojson', JSON.stringify(pitchTree.all(), null, 4));

console.log("Fields: ", collection1.features.length, "Circles: ", pitchTree.all().features.length);
