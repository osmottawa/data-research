import * as fs from 'fs'
import * as path from 'path'
import * as Baby from 'babyparse'
import * as turf from '@turf/turf'
import * as yml from 'js-yaml'
import { range, capitalize, keys } from 'lodash'

const parsed = Baby.parseFiles(path.join(__dirname, 'gtfs', 'stops.txt'))
const headers = parsed.data.shift()
const features: GeoJSON.FeatureCollection<GeoJSON.Point> = turf.featureCollection([])
const data: string[][] = parsed.data

function parseRef(ref: string) {
    if (ref) {
        if (ref.length === 4) { return ref }
        else if (ref.length === 3) {
            //console.log('WARNING - Padded reference number', ref)
            return `0${ ref }`
        }
    }
}

function parseName(name: string) {
    if (name) {
        const words: string[] = []
        name.split(/[ ]+/g).map(word => {
            word = word.replace(/DR\./, 'Drive')
            word = word.replace(/ST\./, 'Street')
            word = word.replace(/RD\./, 'Road')
            word = word.replace(/W\./, 'West')
            word = word.replace(/\\/g, '/')
            word = word.replace(/H\.S\./, 'High School')
            if (!word.match(/[\.\d]/)) word = capitalize(word)
            if (word.match(/^\(/)) word = `(${ capitalize(word.slice(1))}`
            words.push(word)
        })
        return words.join(' ')
    }
}

data.map(items => {
    const properties: any = {}
    let column = 0
    items.map(item => {
        if (item) properties[headers[column]] = item
        column ++
    })
    if (properties) {
        // Handle OSM properties
        const lat = parseFloat(properties['stop_lat'])
        const lng = parseFloat(properties['stop_lon'])
        const name = parseName(properties['stop_name'])
        const osm: any = {
            name,
            operator: 'OC Transpo',
            source: 'City of Ottawa',
            public_transport: 'platform',
            highway: 'bus_stop',
            bus: 'yes'
        }
        // Handle Ref
        const ref = parseRef(properties['stop_code'])
        if (ref) {
            osm.ref = ref
            osm['source:ref'] = 'OC Transpo'
        } else {
            osm.fixme = 'No reference number'
            console.log('WARNING - No Reference number:', osm.name)
        }
        // Add Feature
        const feature = turf.point([lng, lat], osm)
        if (lat & lng) features.features.push(feature)
    }
})

fs.writeFileSync('oc-transpo-stops.json', JSON.stringify(features, null, 4))
