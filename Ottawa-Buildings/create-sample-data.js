const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const rbush = require('rbush')

const tree = rbush()
const name = 'ottawa-buildings.geojson'
const input = reader(name)
const search = [-75.752147, 45.338150, -75.745725, 45.346129]

for (const feature of input.features) {
  const bbox = turf.bbox(feature)
  tree.insert({
    minX: bbox[0],
    minY: bbox[1],
    maxX: bbox[2],
    maxY: bbox[3],
    feature: feature
  })
}

const results = tree.search({
  minX: search[0],
  minY: search[1],
  maxX: search[2],
  maxY: search[3]
})

const collection = turf.featureCollection(results.map(result => result.feature))
writer('sample-' + name, collection)
