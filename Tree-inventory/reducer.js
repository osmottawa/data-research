const {featureCollection} = require('@turf/helpers')
const {featureEach} = require('@turf/meta')
const flatten = require('@turf/flatten')
const inside = require('@turf/inside')
const rbush = require('geojson-rbush')
const pointOnLine = require('@turf/point-on-line')
const polygonToLineString = require('@turf/polygon-to-linestring')

// Distance
const distance = global.mapOptions.distance
const type = global.mapOptions.type

// QA Tile reducer script
module.exports = (sources, tile, writeData, done) => {
  // Main processing
  const results = []
  const osm = []
  const features = sources.qatiles.osm

  // Store OSM buildings
  for (var i = 0; i < features.length; i++) {
    const feature = features.feature(i)
    if (feature.type !== 3) continue // Polygon
    if (!feature.properties[type]) continue
    const geojson = feature.toGeoJSON(tile[0], tile[1], tile[2])
    osm.push(geojson)
  }

  // Create buidling index
  const index = rbush()
  index.load(featureCollection(osm))

  // Iterate over each Tree
  featureEach(sources.treeInventory.treeinventorygeojson, tree => {
    const search = index.search(tree)
    for (const feature of flatten(search).features) {
      if (inside(tree, feature)) {
        const {dist} = pointOnLine(polygonToLineString(feature), tree, 'meters').properties

        // Tree must be futher than 1 meter
        if (dist > distance) {
          results.push(tree)
          break
        }
      }
    }
  })
  done(null, results)
}
