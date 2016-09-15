import requests
import json
import codecs
from collections import OrderedDict

# Get OC Transpo Stops
r = requests.post('http://www.octranspo.com/map/map_data', data={'type': 'stops'})
stops = OrderedDict([
    ('type', 'FeatureCollection'),
    ('features', [])
])

# Add features to stops
for stop in r.json():
    if ('lat' in stop and 'lng' in stop):
        lat = float(stop['lat'])
        lng = float(stop['lng'])

        # Remove any french characters poorly parsed by OC Transpo
        name = stop['name'].replace(u'&Atilde;&copy;', u'é').replace(u'\\', u'/').replace(u'&Atilde;&uml;', u'è').replace(u'&amp;', u'&').replace(u'&Atilde;&acute;', u'ô')
        name = name.strip()

        # Build Feature GeoJSON
        properties = OrderedDict([
            ('name', name),
            ('operator', 'OC Transpo'),
            ('source', 'City of Ottawa'),
            ('source:ref', 'OC Transpo'),
            ('ref', stop['info']),
            ('public_transport', 'platform'),
            ('highway', 'bus_stop'),
            ('bus', 'yes'),
        ])
        geometry = OrderedDict([
            ('type', 'Point'),
            ('coordinates', [lng, lat])
        ])
        feature = OrderedDict([
            ('type', 'Feature'),
            ('properties', properties),
            ('geometry', geometry)
        ])
        stops['features'].append(feature)

# Sort bus stops in order
stops['features'] = sorted(stops['features'], key=lambda k: k['properties']['name']) 

# Save File
with codecs.open('oc-transpo-stops.geojson', 'wb', 'utf-8') as f:
    f.write(json.dumps(stops, indent=4))