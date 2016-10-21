import * as turf from '@turf/turf'
import * as fs from 'fs'
import * as path from 'path'

const collection = turf.featureCollection([])
const data: GeoJSON.FeatureCollection<GeoJSON.Point> = require(path.join(__dirname, 'ottawa-buildings.json'))
const writer = fs.createWriteStream(path.join(__dirname, 'ottawa-buildings.geojson'))

data.features.map(feature => {
  feature.properties = {
    building: 'yes',
    source: 'City of Ottawa',
  }
  collection.features.push(feature)
})

writer.write(JSON.stringify(collection, null, 4))

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