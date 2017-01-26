const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const fs = require('fs')

// Load parcels
const parcels = reader('ottawa-parcels.geojson').features
console.time('Time')
console.log('Parcels:', parcels.length)

// Create writting stream
const stream = fs.createWriteStream('ottawa-parcels-buffer.geojson')
stream.write(`{
"type": "FeatureCollection",
"features": [
`)


let count = 0
// Create 3 meter buffer for parcels
for (const feature of parcels) {
  const buffer = turf.buffer(feature, 3, 'meters')
  stream.write(JSON.stringify(buffer))

  count++
  if (count !== parcels.length) { stream.write(',\n') }
  if (count % 1000 === 0) { console.log(count) }
}
stream.write(`
]
}
`)
console.timeEnd('Time')
