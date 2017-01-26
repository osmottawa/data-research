"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const rp = require("request-promise");
const lodash_1 = require("lodash");
const turf = require("@turf/turf");
const fs = require("fs");
const path = require("path");
function encodeData(data) {
    return lodash_1.keys(data).map(key => [key, data[key]].join("=")).join("&");
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const writer = fs.createWriteStream(path.join(__dirname, 'ottawa-buildings.geojson'));
        const api_url = 'http://maps.ottawa.ca/arcgis/rest/services/TopographicMapping/MapServer/3/query';
        let count = 0;
        let first = false;
        let blank = 0;
        const max = 250;
        const features = [];
        // Write Feature Collection Header
        writer.write(`{
  "type": "FeatureCollection",
  "features": [
`);
        while (true) {
            const params = {
                objectIds: lodash_1.range(count, count + max).join(','),
                geometryType: 'esriGeometryEnvelope',
                spatialRel: 'esriSpatialRelIntersects',
                returnGeometry: 'true',
                returnTrueCurves: 'false',
                returnIdsOnly: 'false',
                returnCountOnly: 'false',
                returnDistinctValues: 'false',
                outSR: 4326,
                f: 'pjson',
            };
            const url = `${api_url}?${encodeData(params)}`;
            const results = yield rp.get(url)
                .then(data => JSON.parse(data))
                .catch(error => console.log(error));
            // Iterate over result
            results.features.map(feature => {
                const attributes = {
                    building: 'yes',
                    source: 'City of Ottawa'
                };
                const poly = turf.polygon(feature.geometry.rings, attributes);
                if (!first) {
                    writer.write(`    ${JSON.stringify(poly)}`);
                    first = true;
                }
                else
                    writer.write(`,\n    ${JSON.stringify(poly)}`);
            });
            // Stop or Start over process
            if (!results.features.length) {
                blank++;
                console.log('blank');
            }
            if (blank > 50) {
                console.log('break');
                break;
            }
            console.log(count);
            count += max;
        }
        writer.write(`
  ]
}`);
    });
}
main();
