import * as turf from '@turf/turf'
import * as fs from 'fs'
import * as path from 'path'

const collection = turf.featureCollection([])
const address: GeoJSON.FeatureCollection<GeoJSON.Point> = require(path.join(__dirname, 'ottawa-address.json'))

address.features.map(feature => {
  delete feature.properties['addr:city']
  delete feature.properties['survey:date']
  collection.features.push(feature)
})

fs.writeFileSync(path.join(__dirname, 'ottawa-address-clean.geojson'), JSON.stringify(collection, null, 4))

/**
tippecanoe \
    --output=ottawa-address.mbtiles \
    --force \
    --base-zoom 13 \
    --no-feature-limit \
    --no-tile-size-limit \
    --minimum-zoom 13 \
    --maximum-zoom 15 \
    ottawa-address-clean.geojson
 */