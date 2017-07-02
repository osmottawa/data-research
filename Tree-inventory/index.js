const path = require('path')
const tileReduce = require('tile-reduce')
const load = require('load-json-file')
const write = require('write-json-file')
const {featureCollection} = require('@turf/helpers')
const turfBBox = require('@turf/bbox')

// Get BBox
// const bbox = turfBBox(load.sync(path.join(__dirname, 'tree-inventory.geojson')))
const bbox = [ -76.3249473, 45.0506963, -75.3419623, 45.5173001 ]

// Tile Reduce options
const mbtiles = path.join(__dirname, 'canada.mbtiles')
const treeInventory = path.join(__dirname, 'tree-inventory.mbtiles')
const OUTPUT = path.join(__dirname, 'tree-inventory-building-conflicts.geojson')
const options = {
  zoom: 12,
  bbox,
  map: path.join(__dirname, 'reducer.js'),
  sources: [
    {name: 'qatiles', mbtiles, raw: true},
    {name: 'treeInventory', mbtiles: treeInventory, raw: false}],
  mapOptions: {
    treeInventory
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
  write.sync(OUTPUT, featureCollection(results))
  console.log('done', results.length)
})
