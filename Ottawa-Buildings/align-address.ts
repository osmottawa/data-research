import {reader, writer} from 'geojson-writer'
import * as turf from '@turf/turf'
import * as rbush from 'rbush'
import * as cheapRuler from 'cheap-ruler'
const geojsonStream = require('geojson-stream')

interface InsertType extends rbush.BBox {
  type: string
}

const ruler = cheapRuler(45.3)
const tree = rbush<InsertType>()

console.time('require building')
const buildings = require('./ottawa-buildings.json')
console.timeEnd('require building')
console.time('require address')
const address = require('./ottawa-address.json')
console.timeEnd('require address')
console.time('require parcels')
const parcels = require('./ottawa-parcels.json')
console.timeEnd('require parcels')


// // Load Rbush
// function load(features: GeoJSON.Feature<any>[], type: string) {
//   console.time('load ' + type)
//   features.map(feature => {
//     const [west, south, east, north] = turf.bbox(feature)
//     tree.insert({
//       minX: west,
//       minY: south,
//       maxX: east,
//       maxY: north,
//       type: 'building'
//     })
//   })
//   console.timeEnd('load ' + type)
// }

// load(parcels.features, 'parcels')
// load(buildings.features, 'buildings')

