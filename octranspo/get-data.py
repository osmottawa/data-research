import requests
import os
import json
from operator import itemgetter

# Get OC Transpo Stops
r = requests.post('http://www.octranspo.com/map/map_data', data={'type': 'stops'})
stops = {
    'type': 'FeatureCollection',
    'features': []
}
for stop in r.json():
    if ('lat' in stop and 'lng' in stop):
        lat = float(stop.pop('lat'))
        lng = float(stop.pop('lng'))
        feature = {
            'type': 'Feature',
            'ref': stop['name'],
            'properties': {
                'name': stop['name'],
                'operator': 'OC Transpo',
                'source': 'OC Transpo',
                'source:ref': 'OC Transpo',
                'ref': stop['info'],
                'public_transport': 'platform',
                'highway': 'bus_stop',
                'bus': 'yes'
            },
            'geometry': {
                'type': 'Point',
                'coordinates': [lng, lat]
            }
        }
        stops['features'].append(feature)

# Sort bus stops in order
stops['features'] = sorted(stops['features'], key=lambda k: k['properties']['name']) 

# Save File
with open('oc-transpo-stops.geojson', 'w') as f:
    f.write(json.dumps(stops, indent=4))