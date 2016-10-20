import * as turf from '@turf/turf'
import * as fs from 'fs'

const container: GeoJSON.FeatureCollection<GeoJSON.Point> = turf.featureCollection([])
const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = require('./starbucks-yellowpages.json')

collection.features.map(feature => {
  feature.geometry.coordinates = feature.geometry.coordinates.reverse()
  feature.properties = {
    name: 'Starbucks Coffee',
    'name:en': 'Starbucks Coffee',
    'name:fr': 'Café Starbucks',
    cuisine: 'coffee_shop',
    website: 'http://www.starbucks.ca/',
    amenity: 'cafe'
  }
  container.features.push(feature)
})

fs.writeFileSync('starbucks.json', JSON.stringify(container, null, 4))

/**
tippecanoe \
  --output=starbucks.mbtiles \
  --force \
  --base-zoom 12 \
  --no-feature-limit \
  --no-tile-size-limit \
  --minimum-zoom 12 \
  --maximum-zoom 18 \
  starbucks-clean.json
 */