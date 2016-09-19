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
        const properties = {
            source: 'Lake County',
            highway: 'residential',
            ref: feature.properties['SegID'],
            'source:ref': 'Lake County',
            alt_name: feature.properties['AliasName'],
            maxspeed: `${ feature.properties['SpeedLimit'] } mph`,
            name: [name, suffix, direction].join(' ').trim()
        }
        results.features.push(lineString(coords, properties))
    })
})

fs.writeFileSync('lake-county-roads.json', JSON.stringify(results, null, 4))