## License

The Regional Municipality of Peel wishes to Use this Licence as a tool to enable the
Use and re-Use of Information under a common open licence. This Licence is based upon
the UK Government's Open Government Licence for Public Sector Information and has been
adapted for use by The Regional Municipality of Peel with the permission of the
UK National Archives.

- [ODbL Compatibility](http://wiki.openstreetmap.org/wiki/Import/ODbL_Compatibility)

- [Open Data Licence for The Regional Municipality of Peel
(Version 1.0)](http://opendata.peelregion.ca/terms-of-use.aspx)

- [Open Government License (OGL)](http://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/)

## Import Plan Outline

### Goals
The goal of this import is to add building footprints as well as address data of the town of Caledon, Ontario

### Schedule
- 8 September 2016: discussion period of two weeks, starting when posted to imports@ list and talk-ca@ list
- if positive result of discussion: import after end of discussion period

### Import Data
The data used for this import are two Shapefiles one containing building outlines and the other address points.

**Data source site:** [Caledon Building Footprints](http://opendata.peelregion.ca/data-categories/facilities-and-structures/caledon-building-footprints.aspx) and [Address Points](http://opendata.peelregion.ca/data-categories/regional-geography/address-points.aspx)

**Data license:** See above with also written permission (text below)

**Permission text:**

### OSM Data Files
Not prepared yet

### Import Type
This is a one-time import, will be prepared via script and tasked via a tasking manager

## Data preperation
Data will be merged via script so that the manual process of merging address nodes and building outlines is less great. It will then be tasked via the [OSMCanada Tasking Manager](http://tasks.osmcanada.ca)

### Attributition tags

`source`=`The Regional Municipality of Peel`

## Data Workflow
### Team Approach
It's planned to be done by a few members of OSMCanada located in Ottawa

### Risks
Risks associated with this are as follows
1. Buildings have two addresses within the foot print (semis, apartments, etc)

### Mitigation
How we are going to avoid the problems related to the risks
1. Buildings that have two addresses within the foot print will be dealt with manually via the tasking manager and will not be automatically merged via the script

## QA
Quality assurance will be done by people using the tasking manager.

