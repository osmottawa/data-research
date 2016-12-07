import * as helpers from 'geojson-helpers'
import * as turf from '@turf/helpers'
import * as fs from 'fs'

interface Source {
  name: string
  count: number
  version: number
  newdata: boolean
  lastrunstatus: string
  thisversionstatus: string
  thisversionrun: string
  results: {
    collection1: Array<Result>
  }
}

interface Result {
  address: string
  phone: {
    href: string
    text: string
  }
  map: {
    alt: string
    src: string
    text: string
  }
  cinema: {
    alt: string
    src: string
    text: string
  }
  theatreInfo: {
    href: string
    text: string
  }
}
const source: Source = require('./source')

const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = turf.featureCollection([])

interface Exceptions {
  [key: string] : {
    housenumber?: string
    street?: string
    phone?: string
  }
}

const exceptions: Exceptions = {
  'Le Mail Cavendish, 5800 boulevard Cavendish, 5800 boulevard Cavendish': {
    housenumber: '5800',
    street: 'boulevard Cavendish'
  },
  'Pickering Towne Centre, 1355 Kingston Road, 1355 Kingston Rd.': {
    housenumber: '1355',
    street: 'Kingston Road',
  },
  'Scarborough Town Centre, 300 Borough Drive': {
    housenumber: '300',
    street: 'Borough Drive',
  },
  'Highway 93, RR2, Box2': {
    housenumber: '9226',
    street: 'Highway 93',
  },
  'Shops at Don Mills, 12 Marie Labatte Road, Unit B7': {
    housenumber: '12',
    street: 'Marie Labatte Road',
  },
  'Yorkdale Shopping Centre, 3401 Dufferin Street , c,o Yorkdale Shopping Centre': {
    housenumber: '3401',
    street: 'Dufferin Street',
  },
  'Fairgrounds Shopping Centre, 85 Fifth Avenue, 85 Fifth Ave.': {
    housenumber: '85',
    street: 'Fifth Avenue',
  },
  "Bayer's Lake, 190 Chain Lake Drive": {
    housenumber: '190',
    street: 'Chain Lake Drive',
  },
  'Avalon Mall, 48 Kenmount Road': {
    housenumber: '48',
    street: 'Kenmount Road',
  },
  'Eau Claire Market, 200 Barclay Parade SW, 200 Barclay Parade S.W.': {
    housenumber: '200',
    street: 'Barclay Parade SW',
  },
  'The Junction Plaza, 32555 London Avenue': {
    housenumber: '32555',
    street: 'London Avenue',
  },
  '200 West Esplanade' : {
    phone: undefined,
  },
  '170 Schoolhouse Street': {
    phone: undefined,
  }
}

source.results.collection1.map(result => {
  // Address
  const postal_code = result.address.match(/[A-Z]\d[A-Z] \d[A-Z]\d/)[0]
  const addr = result.address.match(/[a-zA-Zé\d \.'\-]+/g)
  const province = addr.slice(-2, -1)[0].trim()
  const city = addr.slice(-3, -2)[0].trim()
  const fullroad = addr.slice(0, -3).join(',')
  let housenumber = fullroad.match(/^\d[\d\-a-zA-Z]*/) ? fullroad.match(/^\d[\d\-a-zA-Z]*/)[0] : undefined
  const unit = fullroad.match(/Unit ([\da-zA-Z]+)/) ? fullroad.match(/Unit ([\da-zA-Z]+)/)[1] : undefined
  let street = housenumber ? fullroad.replace(housenumber, '').trim().replace(/^,/, '').trim().replace(`Unit ${ unit }`, '').trim().replace(/,$/, '').trim() : undefined 

  // Phone
  const phoneMatch = result.phone.text && result.phone.text.match(/\((\d+)\) (\d+)-(\d+)/)
  let phone = phoneMatch && phoneMatch.slice(1, 4).join('-')
  const website = result.theatreInfo.href

  // Exceptions
  const exception = exceptions[fullroad]
  if (exception) {
    street = exception.street
    housenumber = exception.housenumber
    phone = exception.phone
  }

  // Map
  const name = result.map.alt
  const center = result.map.src.match(/center=([\d\.,\-]+)/)[1]
  const [lat, lng] = center.split(',').map(i => Number(i))

  // GeoJSON
  const properties = {
    name,
    'amenity': 'cinema',
    'operator': 'Cineplex',
    'addr:housenumber': housenumber,
    'addr:street': street,
    'addr:postal_code': postal_code,
    'addr:unit': unit,
    'addr:city': city,
    'phone': phone,
    'website': website,
    // 'fixme': (housenumber) ? undefined : 'No housenumber',
    // 'is_in:iso_3166_2': `CA-${province}`,
    // 'is_in:state_code': province,
    // 'is_in:country': 'CA'
  }
  const point = turf.point([lng, lat], properties)
  collection.features.push(point)
})

fs.writeFileSync('cineplex.geojson', JSON.stringify(collection, null, 4))