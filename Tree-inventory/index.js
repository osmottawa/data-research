const meta = require('@turf/meta')
const path = require('path')
const write = require('write-json-file')
const load = require('load-json-file')

trees = load.sync(path.join(__dirname, 'tree-inventory.geojson'))

meta.featureEach(trees, feature => {
  console.log(feature)
})
