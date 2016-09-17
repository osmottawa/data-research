import * as turf from '@turf/turf'
import * as fs from 'fs'

const stops: GeoJSON.FeatureCollection<GeoJSON.Point> = require('./oc-transpo-stops.json')
const features: GeoJSON.Feature<any>[] = []

stops.features.map(stop => {
    const ref: string = stop.properties.ref
    if (ref.length === 4) {}
    else if (ref.length === 3) {
        stop.properties.ref = `0${ ref }`
        console.log('WARNING - Padded reference number:', stop.properties.name)
    } else {
        stop.properties.ref = null
        stop.properties['source:ref'] = null
        stop.properties.fixme = 'No reference number'
        console.log('WARNING - No Reference number:', stop.properties.name)
    }
    features.push(stop)
})

fs.writeFileSync('oc-transpo-stops.json', JSON.stringify(turf.featureCollection(features), null, 4))