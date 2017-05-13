const fs = require('fs')
const bbox = require('@turf/bbox');
const bboxPolygon = require('@turf/bbox-polygon');
const load = require('load-json-file')
const write = require('write-json-file')
const buffer = require('@turf/buffer')
const inside = require('@turf/inside')
const dissolve = require('@turf/dissolve')
const truncate = require('@turf/truncate')
const {featureEach} = require('@turf/meta')

// Load GeoJSON
console.time('load')
let geojson = load.sync('gas-clean.geojson')
console.timeEnd('load')

// Filter by Extent
console.time('filter by extent')
const extent = load.sync('extent.geojson')
console.log(geojson.features.length)
geojson.features = geojson.features.filter(point => inside(point, extent))
console.log(geojson.features.length)
console.timeEnd('filter by extent')

// Apply Buffer to Points
console.time('buffer')
geojson = buffer(geojson, 2000, 'meters', 8)
console.timeEnd('buffer')

// Make buffers bbox polygons
console.time('bbox-polygons')
featureEach(geojson, (feature, index) => {
  geojson.features[index] = bboxPolygon(bbox(feature))
})
console.timeEnd('bbox-polygons')

// Truncate coordinate precision to 6
console.time('truncate')
geojson = truncate(geojson)
console.timeEnd('truncate')

// Dissolve Polygons
console.time('dissolve')
geojson = dissolve(geojson)
console.timeEnd('dissolve')

// Save GeoJSON with stream
console.time('writer')
const stream = fs.createWriteStream('buffer-points-results.geojson')
stream.write('{\n')
stream.write('"type": "FeatureCollection",\n')
stream.write('"features": [\n')
featureEach(geojson, (feature, index) => {
  feature.properties = {}
  stream.write(JSON.stringify(feature))
  if (index + 1 !== geojson.features.length) {
    stream.write(',\n')
  } else { stream.write('\n') }
})
stream.write(']\n}')
console.timeEnd('writer')