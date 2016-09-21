import { geojson2osm } from 'geojson2osm'
import { merge } from 'lodash'
import * as fs from 'fs'
import * as path from 'path'
import * as turf from '@turf/turf'

// Load source dataset
const source: GeoJSON.FeatureCollection<GeoJSON.Point> = require(path.join(__dirname, 'oc-transpo-stops.json'))

// Load overpass data using GeoJSON & print results using `out meta`
// http://overpass-turbo.eu/s/iuT
const overpass: GeoJSON.FeatureCollection<GeoJSON.Point> = require(path.join(__dirname, 'oc-transpo-stops-overpass.json'))

// Set up index of source dataset
const index: any = {} 
source.features.map(feature => index[feature.properties.ref] = feature.properties)

// Merge existing data with new data
const container: GeoJSON.FeatureCollection<GeoJSON.Point> = turf.featureCollection([])
overpass.features.map(feature => {
  feature.properties = merge(feature.properties, index[feature.properties.ref])
  feature.properties['@action'] = 'modify'
  feature.properties['@id'] = feature.properties['@id'].replace(/node\//, '') // Remove extra ID syntax created by Overpass
  delete feature.properties['@timestamp'] // Breaks geojson2osm
  container.features.push(feature)
})

// Save OSM File
fs.writeFileSync(path.join(__dirname, 'oc-transpo-stops-gtfs.osm'), geojson2osm(container))