import * as helpers from 'geojson-helpers'

const geojson = helpers.readFileSync('./GEBADR-address-points.geojson')
helpers.writeFileSync('./address-points.geojson', geojson)
