const fs = require('fs')
const JSONStream = require('JSONStream')
const es = require('event-stream')
const reader = require('geojson-writer').reader
const booleanWithin = require('@turf/boolean-within').default
const geojson2osm = require('geojson2osm');

const turf = require("@turf/turf");
const collection = turf.featureCollection([]);

//geojson containing area that should include resulting buildings
//const boundary = reader('data_in/OntarioEast-rural.geojson').features[0];
const boundary = reader('data_in/NovaScotia-rural.geojson').features[0];

var getStream = function () {
    var jsonData = 'data_in/NovaScotia.geojson',    //geojson with all buildings for province
        stream = fs.createReadStream(jsonData, {encoding: 'utf8'}),
        parser = JSONStream.parse('features.*');
        return stream.pipe(parser);
};

let i=0
getStream()
.pipe(es.mapSync(function (data) {
  if(booleanWithin(data, boundary)){
      data.properties['building']='yes'
      data.properties['source']='Microsoft'
      collection.features.push(data)
      console.log(i++)
  }
  else {
  }
}))
.on('close', function () {
  const osm = geojson2osm.geojson2osm(collection)
  fs.writeFileSync('data_out/data.osm', osm);
  console.log('Features written:', collection.features.length)
});
