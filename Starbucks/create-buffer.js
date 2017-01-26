"use strict";
const turf = require("@turf/turf");
const path = require("path");
const fs = require("fs");
const features = require(path.join(__dirname, 'starbucks.json'));
const buffer = turf.buffer(features, 250, 'meters');
fs.writeFileSync(path.join(__dirname, 'starbucks-buffer.json'), JSON.stringify(buffer, null, 4));
