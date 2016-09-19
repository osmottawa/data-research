import * as fs from 'fs'
import * as changeCase from 'change-case'
import * as path from 'path'
import { isUndefined } from 'lodash'
import { featureCollection, lineString } from '@turf/turf'

const features: GeoJSON.FeatureCollection<GeoJSON.MultiLineString> = require(path.join(__dirname, 'source', 'lake-county-roads.json'))
const results: GeoJSON.FeatureCollection<GeoJSON.LineString> = featureCollection([])
const suffixLookup: any = require('./suffix.json')
const directionsLookup: any = require('./directions.json')

features.features.map(feature => {
    feature.geometry.coordinates.map(coords => {
        const name = changeCase.title(feature.properties['BaseStreet'])
        const suffix = suffixLookup[feature.properties['SuffixType']]
        const direction = directionsLookup[feature.properties['PrefixDire']]
        const ref = feature.properties['SegID']
        const properties: any = {
            source: 'Lake County',
            highway: 'residential',            
            alt_name: feature.properties['AliasName'] ? feature.properties['AliasName'] : undefined,
            maxspeed: feature.properties['SpeedLimit'] ? `${ feature.properties['SpeedLimit'] } mph` : undefined,
            name: [name, suffix, direction].join(' ').trim()
        }
        if (ref) {
            properties.ref = ref
            properties['source:ref'] = 'Lake County'
        }
        results.features.push(lineString(coords, properties))
    })
})

fs.writeFileSync('lake-county-roads.json', JSON.stringify(results, null, 4))