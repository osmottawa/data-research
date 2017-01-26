import * as turf from '@turf/turf'
import {writer, reader} from 'geojson-writer'
import * as meta from '@turf/meta'
import * as _ from 'lodash'

const collection: GeoJSON.Feature<GeoJSON.Polygon>[] = []
const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = reader('ottawa-parcels.geojson')

let count = 0

console.log('start')
for (let feature of data.features) {
  const road: string = feature.properties['ROAD_NAME']
  const suffix: string = feature.properties['SUFFIX']
  const street = (road && suffix) ? road + ' ' + suffix : road
  const housenumber = feature.properties['ADDRESS_NU']

  feature.properties = {
    'addr:housenumber': housenumber,
    'addr:street': street,
    ref: feature.properties['PI_PARCEL_'],
    source: 'City of Ottawa'
  }

  const unique: any = {}
  meta.coordEach(feature, coord => unique[coord.join(',')] = true)
  if (Object.keys(unique).length > 2) {
    feature = turf.simplify(feature, 0.000001, true)
    collection.push(feature)
  }
  count ++
  if (count % 1000 === 0) { console.log('processed', count, feature.geometry.coordinates[0].length) }
}

console.log('writting')
writer('ottawa-parcels-simplify.geojson', turf.featureCollection(collection))
