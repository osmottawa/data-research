# Kingston

**Buildings**

```bash
$ aws s3 cp s3://data.osmcanada.ca/kingston-buildings.geojson kingston-buildings.geojson
$ esri2geojson --verbose http://maps.cityofkingston.ca/ArcGIS/rest/services/Parcel_Dynamic/MapServer/3 kingston-buildings.geojson
```

**Address(es)**

```bash
$ aws s3 cp s3://data.osmcanada.ca/kingston-address.geojson kingston-address.geojson
$ wget https://s3.amazonaws.com/data.openaddresses.io/runs/141931/ca/on/city_of_kingston.zip
$ esri2geojson --verbose http://maps.cityofkingston.ca/ArcGIS/rest/services/Parcel_Dynamic/MapServer/0 kingston-address.geojson
```


**Parcel**

```bash
$ aws s3 cp s3://data.osmcanada.ca/kingston-parcels.geojson kingston-parcels.geojson
$ esri2geojson --verbose http://maps.cityofkingston.ca/ArcGIS/rest/services/Parcel_Dynamic/MapServer/10 kingston-parcels.geojson
```