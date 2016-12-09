import * as concaveman from 'concaveman'
import * as helpers from 'geojson-helpers'
import * as turf from '@turf/turf'

const data = './halifax-buildings.json'
const geojson: GeoJSON.FeatureCollection<any> = require(data)
const points: Array<Array<number>> = []
geojson.features.map(feature => {
  turf.explode(feature).features.map(point => {
    points.push(point.geometry.coordinates)
  })
})
const extent = turf.polygon([concaveman(points)])
const buffer = turf.buffer(extent, 500, 'meters')
const simple: any = turf.simplify(buffer, 0.001, false)
helpers.writeFileSync('./extent.geojson', turf.featureCollection([extent]))
helpers.writeFileSync('./buffer.geojson', turf.featureCollection([buffer]))
helpers.writeFileSync('./simple.geojson', turf.featureCollection([simple]))
