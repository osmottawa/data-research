"use strict";
const turf = require("@turf/helpers");
const fs = require("fs");
const source = require('./source');
const collection = turf.featureCollection([]);
const exceptions = {
    'Le Mail Cavendish, 5800 boulevard Cavendish, 5800 boulevard Cavendish, Cote Saint-Luc, QC, H4W 2T5': {
        housenumber: '5800',
        street: 'boulevard Cavendish'
    },
    'Pickering Towne Centre, 1355 Kingston Road, 1355 Kingston Rd., Pickering, ON, L1V 1B8': {
        housenumber: '1355',
        street: 'Kingston Road',
    },
    'Scarborough Town Centre, 300 Borough Drive, Scarborough, ON, M1P 4P5': {
        housenumber: '300',
        street: 'Borough Drive',
    },
    'Highway 93, RR2, Box2, Midland, ON, L4R 4K4': {
        housenumber: '9226',
        street: 'Highway 93',
    },
    'Shops at Don Mills, 12 Marie Labatte Road, Unit B7, Toronto, ON, M3C 0H9': {
        housenumber: '12',
        unit: 'B7',
        street: 'Marie Labatte Road',
    },
    'Yorkdale Shopping Centre, 3401 Dufferin Street , c/o Yorkdale Shopping Centre, Toronto, ON, M6A 2T9': {
        housenumber: '3401',
        street: 'Dufferin Street',
    },
    'Fairgrounds Shopping Centre, 85 Fifth Avenue, 85 Fifth Ave., Orangeville, ON, L9W 5B7': {
        housenumber: '85',
        street: 'Fifth Avenue',
    },
    "Bayer's Lake, 190 Chain Lake Drive, Halifax, NS, B3S 1C5": {
        housenumber: '190',
        street: 'Chain Lake Drive',
    },
    "Avalon Mall, 48 Kenmount Road, St. John's, NL, A1B 1W3": {
        housenumber: '48',
        street: 'Kenmount Road',
    },
    'Eau Claire Market, 200 Barclay Parade SW, 200 Barclay Parade S.W., Calgary, AB, T2P 4R5': {
        housenumber: '200',
        street: 'Barclay Parade SW',
    },
    'The Junction Plaza, 32555 London Avenue, Mission, BC, V2V 6M7': {
        housenumber: '32555',
        street: 'London Avenue',
    },
    '1000 Island Mall, 2399 Parkedale Avenue, Brockville, ON, K6V 2G9': {
        housenumber: '2399',
        street: 'Parkedale Avenue'
    },
    '179 Enterprise Blvd., Suite 169, Markham, ON, L6G 0E7': {
        housenumber: '179',
        street: 'Enterprise Boulevard',
        unit: '169'
    },
    '200 West Esplanade, N. Vancouver, BC, V7M 1A4': {
        phone: undefined,
    },
    '170 Schoolhouse Street, Coquitlam, BC, V3K 4X9': {
        phone: undefined,
    }
};
source.results.collection1.map(result => {
    // Address
    const postcode = result.address.match(/[A-Z]\d[A-Z] \d[A-Z]\d/)[0];
    const addr = result.address.match(/[a-zA-Zéôàèùâêîûçëïü\d \.'\-]+/g);
    const province = addr.slice(-2, -1)[0].trim();
    const city = addr.slice(-3, -2)[0].trim();
    const fullroad = addr.slice(0, -3).join(',');
    let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined;
    let unit = fullroad.match(/Unit ([\da-zA-Z]+)/) ? fullroad.match(/Unit ([\da-zA-Z]+)/)[1] : undefined;
    let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(`Unit ${unit}`, '').trim().replace(/,$/, '').trim() : undefined;
    if (street && street.match(',')) {
        street = street.split(',')[0];
    }
    // Phone
    const phoneMatch = result.phone.text && result.phone.text.match(/\((\d+)\) (\d+)-(\d+)/);
    let phone = `+1-${phoneMatch && phoneMatch.slice(1, 4).join('-')}`;
    const website = result.theatreInfo.href;
    // Exceptions
    const exception = exceptions[result.address];
    if (exception) {
        if (exception.street) {
            street = exception.street;
        }
        if (exception.housenumber) {
            housenumber = exception.housenumber;
        }
        if (exception.phone) {
            phone = exception.phone;
        }
        if (exception.unit) {
            unit = exception.unit;
        }
    }
    // Map
    const name = result.map.alt;
    const center = result.map.src.match(/center=([\d\.,\-]+)/)[1];
    const [lat, lng] = center.split(',').map(i => Number(i));
    // GeoJSON
    const properties = {
        name,
        'amenity': 'cinema',
        'operator': 'Cineplex',
        'addr:housenumber': housenumber,
        'addr:street': street,
        'addr:postcode': postcode,
        'addr:unit': unit,
        'addr:city': city,
        'phone': phone,
        'website': website,
    };
    const point = turf.point([lng, lat], properties);
    collection.features.push(point);
});
fs.writeFileSync('cineplex.geojson', JSON.stringify(collection, null, 4));
