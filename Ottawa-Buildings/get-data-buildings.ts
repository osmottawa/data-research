import * as rp from 'request-promise'
import { keys, range } from 'lodash'
import * as mercator from 'global-mercator'
import * as turf from '@turf/turf'
import * as fs from 'fs'
import * as path from 'path'

interface InterfaceESRIFeature {
  attributes: any
  geometry: {
    rings: Array<Array<Array<number>>>
  }
}

interface InterfaceESRIResults {
 displayFieldName: string
 fieldAliases: any
 geometryType: string
 spatialReference: any
 fields: Array<any>
 features: Array<InterfaceESRIFeature>
}

function encodeData(data: any) {
    return keys(data).map(key => [key, data[key]].join("=")).join("&")
}

async function main() {
  const writer = fs.createWriteStream(path.join(__dirname, 'ottawa-buildings.geojson'))
  const api_url = 'http://maps.ottawa.ca/arcgis/rest/services/TopographicMapping/MapServer/3/query'
  let count = 0
  let first = false
  let blank = 0
  const max = 250
  const features: Array<GeoJSON.Feature<GeoJSON.Polygon>> = []

  // Write Feature Collection Header
  writer.write(`{
  "type": "FeatureCollection",
  "features": [
`)

  while (true) {
    const params = {
      objectIds: range(count, count + max).join(','),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      returnGeometry: 'true',
      returnTrueCurves: 'false',
      returnIdsOnly: 'false',
      returnCountOnly: 'false',
      returnDistinctValues: 'false',
      outSR: 4326,
      f: 'pjson',
    }
    const url = `${ api_url }?${ encodeData(params)}`
    const results:InterfaceESRIResults = await rp.get(url)
      .then(data => JSON.parse(data))
      .catch(error => console.log(error))

    // Iterate over result
    results.features.map(feature => {
      const attributes = {
        building: 'yes',
        source: 'City of Ottawa'
      }
      const poly = turf.polygon(feature.geometry.rings, attributes)
      if (!first) {
        writer.write(`    ${ JSON.stringify(poly)}`)
        first = true
      } else writer.write(`,\n    ${ JSON.stringify(poly)}`)
    })

    // Stop or Start over process
    if (!results.features.length) {
      blank ++
      console.log('blank')
    }
    if (blank > 50) {
      console.log('break')
      break
    }
    console.log(count)
    count += max
  }
  writer.write(`
  ]
}`)
}
main()
