import * as concaveman from 'concaveman'
import * as helpers from 'geojson-helpers'
import * as turf from '@turf/turf'

const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = require('./GEBADR-address-points.json')
const points = geojson.features.map(feature => feature.geometry.coordinates)
const extent = turf.polygon([concaveman(points)])
const buffer = turf.buffer(extent, 500, 'meters')
const simple: any = turf.simplify(buffer, 0.001, false)
helpers.writeFileSync('./extent.geojson', turf.featureCollection([extent]))
helpers.writeFileSync('./buffer.geojson', turf.featureCollection([buffer]))
helpers.writeFileSync('./simple.geojson', turf.featureCollection([simple]))