import * as turf from '@turf/turf'
import {writer, reader} from 'geojson-writer'
import * as fs from 'fs'
import * as meta from '@turf/meta'

const collection: GeoJSON.Feature<GeoJSON.Polygon>[] = []
const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = reader('ottawa-buildings.geojson')

let count = 0
console.log('start')
for (let feature of data.features) {
  feature.properties = {
    building: 'yes',
    source: 'City of Ottawa',
  }
  const uniqueOuter: any = {}
  const uniqueInner: any = {}

  feature.geometry.coordinates[0].map(coord => uniqueOuter[coord.map(x => Number(x.toFixed(5))).join(',')] = true)
  if (feature.geometry.coordinates[1]) { feature.geometry.coordinates[1].map(coord => uniqueInner[coord.map(x => Number(x.toFixed(5))).join(',')] = true) }

  if (count % 1000 === 0) { console.log('processed', count, Object.keys(uniqueOuter).length, Object.keys(uniqueInner).length) }

  // Remove Inner Polygon
  if (Object.keys(uniqueInner).length === 2 || Object.keys(uniqueInner).length === 1) {
    console.log('remove inner polygon', JSON.stringify(feature, null))
    fs.writeFileSync('last-issue.geojson', JSON.stringify(feature, null, 2))
    feature.geometry.coordinates = feature.geometry.coordinates.slice(0, 1)
  }

  // Don't simplify two vertices
  if (Object.keys(uniqueOuter).length > 2) {
    feature = turf.simplify(feature, 0.000001, true)
    collection.push(feature)
  }
  count ++
}

console.log('Total:', count, collection.length)
console.log('writting')
writer('ottawa-buildings-clean.geojson', turf.featureCollection(collection))
