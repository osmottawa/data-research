import * as turf from '@turf/turf'
import {writer, reader} from 'geojson-writer'

const collection = turf.featureCollection([])
const data = reader('ottawa-buildings.geojson')

data.features.map(feature => {
  feature.properties = {
    building: 'yes',
    source: 'City of Ottawa',
  }
  collection.features.push(feature)
})

writer('ottawa-buildings-clean.geojson', collection, {z: true})
