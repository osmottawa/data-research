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
        try:
            ref = int(stop['info'])
        except:
            ref = 0
        feature = {
            'type': 'Feature',
            'ref': ref,
            'properties': {
                'name': stop['name'],
                'operator': 'OC Transpo',
                'source': 'OC Transpo',
                'source:ref': 'OC Transpo',
                'ref': stop['info'],
                'public_transport': 'platform',
                'highway': 'bus_stop'
            },
            'geometry': {
                'type': 'Point',
                'coordinates': [lng, lat]
            }
        }
        stops['features'].append(feature)

# Sort bus stops in order of Refs
stops['features'] = sorted(stops['features'], key=itemgetter('ref'), reverse=False)

# Save File
with open('oc-transpo-stops.geojson', 'w') as f:
    f.write(json.dumps(stops, indent=4))