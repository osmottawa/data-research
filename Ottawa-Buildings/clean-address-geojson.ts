import * as turf from '@turf/turf'
import {writer, reader} from 'geojson-writer'

const collection = turf.featureCollection([])
const data = reader('ottawa-address.geojson')

data.features.map(feature => {
  feature.properties.source = 'City of Ottawa'
  if (feature.properties['survey:date']) { delete feature.properties['survey:date'] }
  collection.features.push(feature)
})

console.log('writing', collection.features.length)
writer('ottawa-address-clean.geojson', collection)
