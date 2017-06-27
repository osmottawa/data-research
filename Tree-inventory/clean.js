const {featureCollection} = require('@turf/helpers')
const {featureEach} = require('@turf/meta')
const path = require('path')
const write = require('write-json-file')
const load = require('load-json-file')

const INPUT = path.join(__dirname, 'tree-inventory.geojson')
const OUTPUT = path.join(__dirname, 'tree-inventory-clean.geojson')

trees = load.sync(INPUT)
const results = []
featureEach(trees, feature => {
  if (feature.id) delete feature.id
  results.push(feature)
})

write.sync(OUTPUT, featureCollection(results))
