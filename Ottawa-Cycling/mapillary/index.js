const path = require('path')
const load = require('load-json-file')
const write = require('write-json-file')
const moment = require('moment')
const tileReduce = require('tile-reduce')
const {featureCollection} = require('@turf/helpers')

// Tile Reduce Options
const options = {
  geojson: load.sync(path.join(__dirname, 'extents', 'ottawa.geojson')),
  zoom: 14,
  map: path.join(__dirname, 'reduce.js'),
  sources: [{
    name: 'mapillary',
    url: 'https://d25uarhxywzl1j.cloudfront.net/v0.1/{z}/{x}/{y}.mvt'
  }]
}

// Save Results
const results = featureCollection([])
tileReduce(options)
  .on('reduce', (features, tile) => {
    features.forEach(feature => {
      results.features.push(feature)
    })
  })
  .on('end', () => {
    const date = moment().format('YYYY-MM-DD')
    write.sync(path.join(__dirname, 'mapillary', date + '.geojson'), results)
  })
