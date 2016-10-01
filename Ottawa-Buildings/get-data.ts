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
  const max = 250
  const features: Array<GeoJSON.Feature<GeoJSON.Polygon>> = []

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
        ref: feature.attributes.OBJECTID,
        building: 'yes',
        source: 'City of Ottawa',
        'source:ref': 'City of Ottawa'
      }
      const poly = turf.polygon(feature.geometry.rings, attributes)
      features.push(poly)
    })

    // Stop or Start over
    if (!r.features.length) break
    console.log(features.length)
    count += max
    //if (count > 200000) break
  }
  writer.write(JSON.stringify(turf.featureCollection(features), null, 4))
}
main()
