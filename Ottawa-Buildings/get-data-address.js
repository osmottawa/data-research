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
        const writer = fs.createWriteStream(path.join(__dirname, 'address.json'));
        const api_url = 'http://maps.ottawa.ca/arcgis/rest/services/Property_Parcels/MapServer/0/query';
        let count = 0;
        let first = false;
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
                outFields: '*',
                returnGeometry: 'true',
                returnTrueCurves: 'false',
                returnIdsOnly: 'false',
                returnCountOnly: 'false',
                returnDistinctValues: 'false',
                outSR: 4326,
                f: 'pjson',
            };
            const url = `${api_url}?${encodeData(params)}`;
            const r = yield rp.get(url)
                .then(data => JSON.parse(data));
            r.features.map(feature => {
                const attributes = {
                    source: 'City of Ottawa'
                };
                const point = turf.point([feature.geometry.x, feature.geometry.y], feature.attributes);
                if (!first) {
                    writer.write(`    ${JSON.stringify(point)}`);
                    first = true;
                }
                else
                    writer.write(`,\n    ${JSON.stringify(point)}`);
            });
            // Stop or Start over
            if (!r.features.length)
                break;
            console.log(count);
            count += max;
        }
        writer.write(`
  ]
}`);
    });
}
main();
