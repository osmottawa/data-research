"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const meow = require("meow");
const path = require("path");
const lodash_1 = require("lodash");
const execa = require('execa');
const cli = meow(`
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
});
// Required input
if (cli.input.length === 0) {
    throw new Error('<source> is required');
}
const source = cli.input[0];
// Default Options
const minzoom = cli.flags.min || 12;
const maxzoom = cli.flags.max || 17;
const verbose = cli.flags.verbose;
const name = path.parse(source).name;
const ext = path.parse(source).ext;
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const zoom of lodash_1.range(minzoom, maxzoom)) {
            const mbtilesZoom = `${name}-z${zoom}.mbtiles`;
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
            ];
            if (verbose) {
                console.log('Args', args);
            }
            if (verbose) {
                console.log('Starting zoom', zoom);
            }
            yield execa('tippecanoe', args);
            if (verbose) {
                console.log('Finished zoom', zoom);
            }
            yield execa.shell(`sqlite3 ${mbtilesZoom} .dump >> ${name}.dump`);
            if (verbose) {
                console.log('Dumped', mbtilesZoom);
            }
            yield execa.shell(`rm ${mbtilesZoom}`);
            if (verbose) {
                console.log('Removed', mbtilesZoom);
            }
        }
        // Clean
        yield execa.shell(`sqlite3 ${name}.mbtiles < ${name}.dump`);
        if (verbose) {
            console.log('Merge dump');
        }
        yield execa.shell(`rm -f ${name}.dump`);
        if (verbose) {
            console.log('Removed dump');
        }
        console.log('All Done! :)');
    });
}
main();
