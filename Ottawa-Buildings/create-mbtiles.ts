import * as meow from 'meow'
import * as path from 'path'
import {range}  from 'lodash'
const execa = require('execa')

interface CLI extends meow.Result {
  flags: {
    min?: number
    max?: number
    verbose?: boolean
  }
}

const cli: CLI = meow(`
    Usage
      $ node create-mbtiles.js <source>.geojson

    Options
      --min-zoom Minimum Zoom Level
      --max-zoom Maximum Zoom Level
      --verbose Print output
`, {
    alias: {
        min: 'min-zoom',
        max: 'max-zoom'
    },
    boolean: ['verbose']
})
// Required input
if (cli.input.length === 0) { throw new Error('<source> is required') }
const source = cli.input[0]

// Default Options
const minzoom = cli.flags.min || 12
const maxzoom = cli.flags.max || 17
const verbose = cli.flags.verbose
const name = path.parse(source).name
const ext = path.parse(source).ext

async function main() {
  for (const zoom of range(minzoom, maxzoom + 1)) {
    const mbtilesZoom = `${name}-z${zoom}.mbtiles`
    const args = [
      '--output=' + mbtilesZoom,
      '--force',
      '--minimum-zoom=' + zoom,
      '--maximum-zoom=' + zoom,
      '--full-detail=' + (16 - zoom + 16),
      '--no-line-simplification',
      '--no-feature-limit',
      '--no-tile-size-limit',
      '--no-polygon-splitting',
      '--no-clipping',
      '--no-duplication',
      name + ext
    ]
    if (verbose) { console.log('Args', args) }
    if (verbose) { console.log('Starting zoom', zoom) }
    await execa('tippecanoe', args)
    if (verbose) { console.log('Finished zoom', zoom) }
    await execa.shell(`sqlite3 ${mbtilesZoom} .dump >> ${name}.dump`)
    if (verbose) { console.log('Dumped', mbtilesZoom) }
    await execa.shell(`rm ${mbtilesZoom}`)
    if (verbose) { console.log('Removed', mbtilesZoom) }
  }
  // Clean
  await execa.shell(`sqlite3 ${name}.mbtiles < ${name}.dump`)
  if (verbose) { console.log('Merge dump') }
  await execa.shell(`rm -f ${name}.dump`)
  if (verbose) { console.log('Removed dump') }
  console.log('All Done! :)')
}
main()
