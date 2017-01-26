"use strict";
const turf = require("@turf/turf");
const path = require("path");
const fs = require("fs");
const features = require(path.join(__dirname, 'CSD-schools.json'));
const buffer = turf.buffer(features, 500, 'meters');
fs.writeFileSync(path.join(__dirname, 'buffer.json'), JSON.stringify(buffer, null, 4));
