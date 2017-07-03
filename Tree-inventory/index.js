const path = require('path')
const tileReduce = require('tile-reduce')
const write = require('write-json-file')
const {featureCollection} = require('@turf/helpers')

// User Options
// http://wiki.openstreetmap.org/wiki/Canada:Ontario:Ottawa/Import/Trees
const bbox = [ -76.3249473, 45.0506963, -75.3419623, 45.5173001 ]
const distance = 0
const type = 'building'
const output = path.join(__dirname, `tree-inventory-${type}-conflicts-${distance}-meters.geojson`)

// Tile Reduce options
const mbtiles = path.join(__dirname, 'canada.mbtiles')
const treeInventory = path.join(__dirname, 'tree-inventory.mbtiles')
const options = {
  zoom: 12,
  bbox,
  map: path.join(__dirname, 'reducer.js'),
  sources: [
    {name: 'qatiles', mbtiles, raw: true},
    {name: 'treeInventory', mbtiles: treeInventory, raw: false}],
  mapOptions: {
    distance,
    type
  }
}
const ee = tileReduce(options)

// Store Results
const results = []

// Execute the following after each tile is completed
ee.on('reduce', (result, tile) => {
  results.push(...result)
})

ee.on('end', () => {
  write.sync(output, featureCollection(results))
  console.log('done', results.length)
})
