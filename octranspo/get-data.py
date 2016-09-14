import requests
import os
import json

# Get Stops
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
            'properties': {
                'name': stop['name'],
                'operator': 'OC Transpo',
                'source': 'OC Transpo',
                'source:ref': 'OC Transpo',
                'ref': stop['info']
            },
            'geometry': {
                'type': 'Point',
                'coordinates': [lng, lat]
            }
        }
        stops['features'].append(feature)

with open('stops.geojson', 'w') as f:
    f.write(json.dumps(stops, indent=4))