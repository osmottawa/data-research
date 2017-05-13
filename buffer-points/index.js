const fs = require('fs')
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
geojson = buffer(geojson, 500, 'meters', 8)
console.timeEnd('buffer')

// Reduce Coordinate precision to 3 decimals
console.time('truncate')
truncate(geojson, 3, 2, true)
console.timeEnd('truncate')

// // Dissolve Polygons
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