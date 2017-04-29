#!/usr/bin/env node
const path = require('path')
const load = require('load-json-file')
const write = require('write-json-file')
const axios = require('axios')
const moment = require('moment')
const mercator = require('global-mercator')
const {VectorTile} = require('vector-tile')
const Protobuf = require('pbf')
const slippyGrid = require('slippy-grid')
const slippyTile = require('slippy-tile')
const {featureCollection} = require('@turf/helpers')
const range = require('lodash.range')

// User Input
const geojson = load.sync(path.join(__dirname, 'extents', 'ottawa.geojson'))

// Iterate over tiles
async function main () {
  const results = featureCollection([])
  console.log('tiles:', slippyGrid.count(geojson, 14, 14))
  for (let tile of slippyGrid.all(geojson, 14, 14)) {
    tile = mercator.tileToGoogle(tile)
    const [x, y, z] = tile
    console.log(tile)
    const url = slippyTile(tile, 'https://d25uarhxywzl1j.cloudfront.net/v0.1/{z}/{x}/{y}.mvt')
    const response = await axios.get(url, {
      headers: {},
      responseType: 'arraybuffer'
    }).catch(e => console.log(tile, 'not found'))

    // Store Results
    if (response && response.data) {
      const vt = new VectorTile(new Protobuf(response.data))
      const images = vt.layers['mapillary-images']

      if (images) {
        range(images.length).map(i => {
          const feature = images.feature(i).toGeoJSON(x, y, z)
          results.features.push(feature)
        })
      }
    }
  }
  const date = moment().format('YYYY-MM-DD')
  const filename = path.join(__dirname, 'mapillary', date + '.geojson')
  write.sync(filename, results)
}
main()
