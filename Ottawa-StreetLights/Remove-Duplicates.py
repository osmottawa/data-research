import json

with open('StreetLights.geojson') as f:
    data = json.load(f)

l = {}
features = []
for feature in data['features']:
    if l.get(tuple(feature['geometry']['coordinates'])) is None:
        l[tuple(feature['geometry']['coordinates'])] = feature
    elif int(l[tuple(feature['geometry']['coordinates'])]['properties']['source:ref']) < int(feature['properties']['source:ref']):
        l[tuple(feature['geometry']['coordinates'])] = feature

for key,feature in l.items():
    features.append(feature)

data['features'] = features

with open('StreetLights_final.geojson','w',encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
