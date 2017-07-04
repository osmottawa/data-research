#!/usr/bin/env node
// http://wiki.openstreetmap.org/wiki/Canada:Ontario:Ottawa/Import/Trees
const {featureCollection} = require('@turf/helpers')
const {featureEach} = require('@turf/meta')
const path = require('path')
const write = require('write-json-file')
const load = require('load-json-file')
const speciesLookup = require('./species-lookup')

const INPUT = path.join(__dirname, 'tree-inventory.geojson')
const OUTPUT = path.join(__dirname, 'tree-inventory-clean.geojson')

const trees = load.sync(INPUT)
const results = []

featureEach(trees, feature => {
  // if (feature.properties.dbh || feature.properties.diameter_trunk) {
  //   feature.properties.diameter_crown = feature.properties.dbh || feature.properties.diameter_trunk
  // }
  if (feature.id) delete feature.id
  if (feature.properties.diameter_trunk || feature.properties.dbh) {
    const dbh = feature.properties.diameter_trunk || feature.properties.dbh
    feature.properties.circumference = (dbh * Math.PI / 100).toFixed(2)
  }
  if (feature.properties.note === null) delete feature.properties.note
  if (feature.properties['species:en'] === null) delete feature.properties['species:en']
  if (feature.properties.source) delete feature.properties.source
  if (feature.properties.operator) delete feature.properties.operator
  if (feature.properties.dbh) delete feature.properties.dbh
  if (feature.properties.diameter_trunk) delete feature.properties.diameter_trunk
  if (feature.properties.dbh) delete feature.properties.dbh
  if (feature.properties.diameter_crown) delete feature.properties.diameter_crown

  // Convert species using Lookup table
  const species = feature.properties['species:en']
  if (species && speciesLookup.has(species)) {
    feature.properties['species:en'] = speciesLookup.get(species)
  }
  results.push(feature)
})

// Preview first two features
console.log(featureCollection(results).features.slice(0, 2))
write.sync(OUTPUT, featureCollection(results))
