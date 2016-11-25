import * as fs from 'fs'
import * as helpers from 'geojson-helpers'
const csv2geojson = require('csv2geojson')

const csvString = fs.readFileSync('./GEBADR_OSMstyle_edited_2016_11_16.csv', 'utf-8')
csv2geojson.csv2geojson(csvString, {
    latfield: 'latitude',
    lonfield: 'longitude',
    delimiter: ';'
}, function(err: any, data: any) {
  helpers.writeFileSync('address-points.geojson', data)
});