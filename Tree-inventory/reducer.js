const {featureCollection, lineString} = require('@turf/helpers')
const {featureEach} = require('@turf/meta')
const flatten = require('@turf/flatten')
const inside = require('@turf/inside')
const rbush = require('geojson-rbush')
const pointOnLine = require('@turf/point-on-line')
const polygonToLineString = require('@turf/polygon-to-linestring')

// Distance
const distance = global.mapOptions.distance
const inverse = global.mapOptions.inverse
const closestLine = global.mapOptions.closestLine
const closestFeature = global.mapOptions.closestFeature

// QA Tile reducer script
module.exports = (sources, tile, writeData, done) => {
  // Main processing
  const results = []
  const buildings = []
  const highways = []
  const features = sources.qatiles.osm

  // Store OSM buildings
  for (var i = 0; i < features.length; i++) {
    const feature = features.feature(i)

    // Buildings
    if (feature.type === 3 && feature.properties.building) {
      const building = feature.toGeoJSON(tile[0], tile[1], tile[2])
      buildings.push(building)
    // Highways
    } else if (feature.type === 2 && feature.properties.highway) {
      const highway = feature.toGeoJSON(tile[0], tile[1], tile[2])
      highways.push(highway)
    }
  }

  // Create indexes
  const buildingIndex = rbush()
  buildingIndex.load(featureCollection(buildings))

  // Iterate over each Tree
  featureEach(sources.treeInventory['tree-inventory'], tree => {
    let match = false
    const search = buildingIndex.search(tree)
    for (const building of flatten(search).features) {
      if (inside(tree, building)) {
        const closest = pointOnLine(polygonToLineString(building), tree, 'meters')
        const {dist} = closest.properties
        // Tree must be futher than distance in meters
        if (dist > distance) {
          match = true
          if (inverse === false) {
            if (closestFeature) {
              results.push(building)
            } else if (closestLine) {
              // Draw closest lines
              results.push(lineString([closest.geometry.coordinates, tree.geometry.coordinates], closest.properties))
            } else {
              results.push(tree)
            }
            break
          }
        }
      }
    }
    if (inverse === true && match === false) results.push(tree)
  })
  done(null, results)
}
