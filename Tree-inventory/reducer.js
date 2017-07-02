const {featureCollection} = require('@turf/helpers')
const {featureEach} = require('@turf/meta')
const inside = require('@turf/inside')
const rbush = require('geojson-rbush')

// QA Tile reducer script
module.exports = (sources, tile, writeData, done) => {
  // Main processing
  const results = []
  const buildings = []
  const features = sources.qatiles.osm

  // Store OSM buildings
  for (var i = 0; i < features.length; i++) {
    const feature = features.feature(i)
    if (feature.type !== 3) continue // Polygon
    if (!feature.properties.building) continue
    const geojson = feature.toGeoJSON(tile[0], tile[1], tile[2])
    buildings.push(geojson)
  }

  // Create buidling index
  const index = rbush()
  index.load(featureCollection(buildings))

  // Iterate over each Tree
  featureEach(sources.treeInventory.treeinventorygeojson, feature => {
    const search = index.search(feature)
    for (const building of search.features) {
      if (inside(feature, building)) {
        results.push(feature)
        break
      }
    }
  })
  done(null, results)
}
