// http://wiki.openstreetmap.org/wiki/Canada:Ontario:Ottawa/Import/Trees
const {featureCollection} = require('@turf/helpers')
const {featureEach} = require('@turf/meta')
const path = require('path')
const write = require('write-json-file')
const load = require('load-json-file')

const INPUT = path.join(__dirname, 'tree-inventory.geojson')
const OUTPUT = path.join(__dirname, 'tree-inventory.geojson')

const trees = load.sync(INPUT)
const results = []
featureEach(trees, feature => {
  if (feature.id) delete feature.id
  if (feature.properties.source) delete feature.properties.source
  if (feature.properties.operator) delete feature.properties.operator
  if (feature.properties.dbh) {
    feature.properties.diameter_trunk = feature.properties.dbh
    delete feature.properties.dbh
  }
  results.push(feature)
})

write.sync(OUTPUT, featureCollection(results))
