"use strict";
const fs = require("fs");
const helpers = require("geojson-helpers");
const csv2geojson = require('csv2geojson');
const csvString = fs.readFileSync('./GEBADR_OSMstyle_edited_2016_11_16.csv', 'utf-8');
csv2geojson.csv2geojson(csvString, {
    latfield: 'latitude',
    lonfield: 'longitude',
    delimiter: ';'
}, function (err, data) {
    helpers.writeFileSync('address-points.geojson', data);
});
