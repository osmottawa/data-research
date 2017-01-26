const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const ruler = require('cheap-ruler')(45.34, 'feet')
const rbush = require('rbush')
const fs = require('fs')

// Variables
const minSqft = 700
const addressPath = 'ottawa-address.geojson'
const buildingsPath = 'ottawa-buildings.geojson'
const parcelsPath = 'ottawa-parcels.geojson'
const output = 'ottawa-address-align.geojson'
const outputLines = 'ottawa-address-align-lines.geojson'

// Spatial Index Rbush
const tree = {
  buildings: rbush(),
  parcels: rbush()
}
console.time('Time')

// Load buildings
const buildings = reader(buildingsPath).features
console.log('Buildings:', buildings.length)
for (const feature of buildings) {
  const bbox = turf.bbox(feature)
  const area = ruler.area(feature.geometry.coordinates)
  feature.properties.area = area
  if (area > minSqft) {
    tree.buildings.insert({
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      feature: feature
    })
  }
}

// Load parcels
const parcels = reader(parcelsPath).features
console.log('Parcels:', parcels.length)
for (let feature of parcels) {
  const bbox = turf.bbox(feature)
  tree.parcels.insert({
    minX: bbox[0],
    minY: bbox[1],
    maxX: bbox[2],
    maxY: bbox[3],
    feature: feature
  })
}

const collection = []
const lines = []
let count = 0
// Process address
const addresses = reader(addressPath).features
console.log('Addresses:', addresses.length)
for (let address of addresses) {
  // Find parcels with Center coordinate of address
  let parcels = tree.parcels.search({
    minX: address.geometry.coordinates[0],
    minY: address.geometry.coordinates[1],
    maxX: address.geometry.coordinates[0],
    maxY: address.geometry.coordinates[1]
  }).filter(parcel => turf.inside(address, parcel.feature))

  // Only include parcels that match "addr:housenumber"
  parcels = parcels.filter(result => {
    return result.feature.properties['addr:housenumber'] === address.properties['addr:housenumber']
  })

  // Find parcels only inside point
  if (parcels.length) {
    const parcel = parcels[0].feature
    const parcelBBox = turf.bbox(parcel)
    let parcelBuffer = turf.buffer(parcel, 3, 'meters')

    // Find All buildings within parcel
    let buildings = tree.buildings.search({
      minX: parcelBBox[0],
      minY: parcelBBox[1],
      maxX: parcelBBox[2],
      maxY: parcelBBox[3]
    })
    // Filter by all points of building being inside parcel
    buildings = buildings.filter(result => {
      for (const point of turf.explode(result.feature).features) {
        const inside = turf.inside(point, parcel)
        if (inside) { return true }
      }
    })
    // Find by partial vertices from all the buildings inside BUFFER parcel
    buildings = buildings.filter(result => {
      let partials = 0
      for (const point of turf.explode(result.feature).features) {
        const inside = turf.inside(point, parcelBuffer)
        if (!inside) { partials++ }
      }
      return partials <= 1
    })
    // QA
    // 19.1/45.403/-75.687
    // 19.69/45.39918/-75.70051
    // -75.6625028,45.3903393
    // 19.5/45.39225/-75.72918 (Shed bigger than 450 sqft)
    // 18.63/45.40379/-75.70047/-20.8/4 (Duplex with large shed +450)
    // 149094 more then
    // 157328 less than

    // If only two buildings, remove smallest one
    if (buildings.length === 2) {
      const building0 = ruler.area(buildings[0].feature.geometry.coordinates)
      const building1 = ruler.area(buildings[1].feature.geometry.coordinates)
      if (building0 > building1) {
        buildings = [buildings[0]]
      } else {
        buildings = [buildings[1]]
      }
    }

    // Only center if one building was found
    if (buildings.length === 1) {
      const building = buildings[0].feature

      // Create Center of building
      const center = turf.center(building)
      const distance = ruler.distance(address.geometry.coordinates, center.geometry.coordinates)
      const line = turf.lineString([address.geometry.coordinates, center.geometry.coordinates])
      line.properties.distance = distance
      lines.push(line)

      // Swap geometry of Address with center
      address.geometry.coordinates = center.geometry.coordinates
      count++
      if (count % 1000 === 0) { console.log(count) }
      collection.push(address)
    } else {
      collection.push(address)
    }
  } else { collection.push(address) }
}

// Save
console.log('Features:', collection.length)
console.log('Processed:', count)

writer(output, turf.featureCollection(collection))
writer(outputLines, turf.featureCollection(lines))
console.timeEnd('Time')
