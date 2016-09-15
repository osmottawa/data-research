OC Transpo
==========

Discussions about OC Transpo data.

### Stages

**Stage 1**: Import all bus stops locations ([Tasking Manager 31](http://tasks.osmcanada.ca/project/31))

**Stage 2**: Connect all bus routes to the bus stop locations

### OSM Tag schema

**Bus Stops**

- `name` = `<name>`
- `operator` = 'OC Transpo'
- `source` = 'OC Transpo'
- `bus` = 'yes'
- `highway` = 'bus_stop'
- `public_transport` = 'platform'
- `source:ref` = 'OC Transpo'
- `ref` = `<number>`

**Researched tags**

- `shelter` = 'yes' if the stop has a real time electronic passenger information display.
- `bench` = 'yes' if users can sit on bench at the bus stop.

### Extra Details

We should use the new transport schema:

http://wiki.openstreetmap.org/wiki/Public_transport#Buses

If you need an example look in gatineau for bus line 11:

http://www.openstreetmap.org/#map=18/45.45561/-75.75176&layers=T

Bus stops need to be tagged both on the side of the road(shelter/signs) and on the way itself(stopping position of the bus: only if you are doing the relation if are doing only bus stops they are on the side of road)

### Get Data

Using `python3` we can fetch the latest data.

```bash
$ python3 get-data.py
```