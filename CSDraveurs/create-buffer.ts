import * as turf from '@turf/turf'
import * as path from 'path'
import * as fs from 'fs'

const features = require(path.join(__dirname, 'CSD-schools.json'))
const buffer = turf.buffer(features, 500, 'meters')
fs.writeFileSync(path.join(__dirname, 'buffer.json'), JSON.stringify(buffer, null, 4))