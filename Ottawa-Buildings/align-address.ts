import {reader, writer} from 'geojson-writer'
import * as turf from '@turf/turf'
import * as rbush from 'rbush'
import * as cheapRuler from 'cheap-ruler'

interface InsertType extends rbush.BBox {
  type: string
}

const ruler = cheapRuler(45.3)
const tree = rbush<InsertType>()

console.time('reader')
const buildings = reader('ottawa-buildings.geojson')
const parcels = reader('ottawa-parcels.geojson')
const address = reader('ottawa-address.geojson')
console.timeEnd('reader')

// Load Rbush
function load(features: GeoJSON.Feature<any>[], type: string) {
  console.time('load ' + type)
  features.map(feature => {
    const [west, south, east, north] = turf.bbox(feature)
    tree.insert({
      minX: west,
      minY: south,
      maxX: east,
      maxY: north,
      type: 'building'
    })
  })
  console.timeEnd('load ' + type)
}

load(parcels.features, 'parcels')
load(buildings.features, 'buildings')

