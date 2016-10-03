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
  const writer = fs.createWriteStream(path.join(__dirname, 'buildings.json'))
  const api_url = 'http://maps.ottawa.ca/arcgis/rest/services/TopographicMapping/MapServer/3/query'
  let count = 0
  let first = false
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
      outFields: '*',
      returnGeometry: 'true',
      returnTrueCurves: 'false',
      returnIdsOnly: 'false',
      returnCountOnly: 'false',
      returnDistinctValues: 'false',
      outSR: 4326,
      f: 'pjson',
    }
    const url = `${ api_url }?${ encodeData(params)}`
    const r:InterfaceESRIResults = await rp.get(url)
      .then(data => JSON.parse(data))
    r.features.map(feature => {
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

    // Stop or Start over
    if (!r.features.length) break
    console.log(count)
    count += max

    // if (count > 1000) break
  }
  writer.write(`
  ]
}`)
}
main()
