import * as turf from '@turf/helpers'
import * as helpers from 'geojson-helpers'

const data: GeoJSON.FeatureCollection<any> = require('./halifax-buildings.json')
const collection = turf.featureCollection(
  data.features.map(feature => {
    feature.properties = {building: 'yes'}
    return feature
  })
)
helpers.writeFileSync('halifax-buildings.geojson', collection)
