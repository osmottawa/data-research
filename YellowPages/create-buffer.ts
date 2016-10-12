import * as turf from '@turf/turf'
import * as path from 'path'
import * as fs from 'fs'

const features = require(path.join(__dirname, 'starbucks.json'))
const buffer = turf.buffer(features, 250, 'meters')
fs.writeFileSync(path.join(__dirname, 'starbucks-buffer.json'), JSON.stringify(buffer, null, 4))