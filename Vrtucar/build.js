
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader

const collection1 = turf.featureCollection([]);


//https://www.reservauto.net/Scripts/Client/Ajax/PublicCall/Select_ListStations.asp?CityID=93
const badJson = fs.readFileSync("2018-11-26-ottawa.json", 'utf8');
const correctJson = badJson.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ');
const json = JSON.parse(correctJson);

json.Stations.map(station => {

    const description = station.StationName;
    const name = "Vrtucar #"+station.StationNo;
    const ref = station.StationID;

    const found = collection1.features.findIndex(function(element) {
      return element.properties.ref == ref;
    });
    if(found!=-1) return;

    const properties = {
        'amenity': 'car_sharing',
        'name': name,
        'description': description,
        'operator': 'Vrtucar',
        'website': 'https://www.vrtucar.com',
        'ref': ref
    };
    console.log("New station: ", name);
    const point = turf.point([station.Longitude, station.Latitude], properties);
    collection1.features.push(point);
});

const osm = geojson2osm.geojson2osm(collection1)
fs.writeFileSync('vrtucar.osm', osm);
console.log(`Success! Added ${collection1.features.length} stations`)
