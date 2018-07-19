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

      const properties = {
          'tourism': 'artwork',
          'name': art.properties.ARTWORK.trim(),
          'name:fr': art.properties.ARTWORK_FR,
          'artist_name': art.properties.ARTISTS,
          'image': art.properties.IMAGE,
          'start_date': art.properties.YEAR,
          'material': art.properties.MATERIAL,
          'source': 'City of Ottawa',
          'source:date': today,
      };
      
      if(art.properties.LOCATION!='') properties['description'] = art.properties.LOCATION
      if(art.properties.TEXT!='') properties['inscription'] = art.properties.TEXT
      if(art.properties.TEXT_FR!='') properties['inscription:fr'] = art.properties.TEXT_FR

      console.log("New art: ", art.properties.ARTWORK.trim());
      const point = turf.point(art.geometry.coordinates, properties);
      collection1.features.push(point);

      var circle = turf.circle(art.geometry.coordinates, 100, 10, 'meters');
      collection2.features.push(circle)
  });

  fs.writeFileSync('publicart.geojson', JSON.stringify(collection1, null, 4))

  const osm = geojson2osm.geojson2osm(collection1)
  fs.writeFileSync('ottawa-public-art.osm', osm);
  fs.writeFileSync('ottawa-public-art-circles.geojson', JSON.stringify(collection2, null, 4));

});
