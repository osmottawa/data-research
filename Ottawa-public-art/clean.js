const csv2geojson = require('csv2geojson')
const fs = require("fs");
const turf = require("@turf/turf");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);
const collection2 = turf.featureCollection([]);

const csvString = fs.readFileSync('./publicart180322.csv', 'utf-8')
const today = new Date().toISOString().slice(0,10)

csv2geojson.csv2geojson(csvString, {
    latfield: 'LAT',
    lonfield: 'LONG',
    delimiter: ','
}, function(err, data/*: GeoJSON.FeatureCollection<GeoJSON.Point>*/) {


  data.features.map(art => {

      //don't clutter with bike racks
      if(art.properties.ARTWORK.indexOf("Bicycle Racks")!=-1)
        return;

      let type = ''
      if(art.properties.TEXT.indexOf('mural')!=-1) type = 'mural'
      if(art.properties.TEXT.indexOf('sculpture')!=-1) type = 'sculpture'

      const props1 = {
          'tourism': 'artwork',
          'name': art.properties.ARTWORK.trim(),
          'name:fr': art.properties.ARTWORK_FR,
          'artist_name': art.properties.ARTISTS,
          'image': art.properties.IMAGE,
          'start_date': art.properties.YEAR,
          'material': art.properties.MATERIAL,
          'source': 'City of Ottawa',
          'source:date': today,
          'description': art.properties.LOCATION,
          'inscription': art.properties.TEXT,
          'inscription:fr': art.properties.TEXT_FR,
          'artwork_type': type
      };

      const props2 = {
          'tourism': 'artwork',
          'name': art.properties.ARTWORK.trim(),
          'artist_name': art.properties.ARTISTS,
          'image': art.properties.IMAGE,
          'description': art.properties.LOCATION,
          'inscription': art.properties.TEXT,
          'artwork_type': type
      };


      for (let propName in props1) {
        if (props1[propName] == "") {
          delete props1[propName];
        }
      }

      console.log("New art: ", art.properties.ARTWORK.trim());

      const point = turf.point(art.geometry.coordinates, props1);
      collection1.features.push(point)

      var circle = turf.circle(art.geometry.coordinates, 100, 10, 'meters');
      circle.properties = props2
      collection2.features.push(circle)

  });

  fs.writeFileSync('publicart.geojson', JSON.stringify(collection1, null, 4))

  const osm = geojson2osm.geojson2osm(collection1)
  fs.writeFileSync('ottawa-public-art.osm', osm);
  fs.writeFileSync('ottawa-public-art-circles.geojson', JSON.stringify(collection2, null, 4));

});
