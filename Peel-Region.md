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
    
    Farrugia, Kevin <kevin.farrugia@peelregion.ca>
    Jul 11
    
    Hi Denis,
     
    Good news – I am able to release the building footprints for the Town of Caledon.  You can find them here: http://opendata.peelregion.ca/data-categories/facilities-and-structures/caledon-building-footprints.aspx The only information with the data is the area (metres squared) and perimeter (metres) of each polygon.
     
    Some notes about the data:
    ·         In most cases the address point should be within the polygon of the main building on the property, but also be aware that the address dataset includes units so in some cases there will be many addresses to one polygon.
    
    ·         Buildings that share walls (row houses, town houses, or the ‘Main Street’ buildings) are digitized as one footprint, rather than being split at each firewall or shared wall.  This also has implications where there would be many addresses to one polygon.
    
     
    We’ll be contacting Brampton and Mississauga to see they’re able or willing to release their footprints at some point too.
     
    Of course, if members of your OSM Meetup would like to add them to OSM it would be great!  I can help out either as part of my regular work (questions, GIS-related modifications) when I can fit it in or outside of work (adding buildings/addresses, QA, etc.).
     
    Have a good day,
     
    Kevin Farrugia
    Jr. Planner/GIS Analyst
    Regional Municipality of Peel
    Information Management Division - Service Innovation, Information and Technology
    10 Peel Centre Drive, Suite A, 6th Floor
    Brampton, ON L6T 4B9
    e-mail: Kevin.Farrugia@peelregion.ca | Tel: (905) 791-7800 x. 4061
    http://opendata.peelregion.ca

### OSM Data Files
The data will be served by https://addxy.com/ as JOSM xml files via a link in the tasking manager. The data consumed by the website is available here:

[caledon-building-footprints:](https://gist.githubusercontent.com/DenisCarriere/218598adeccf51ed09313fd2c9f28350)

[caledon-address-points:](https://gist.githubusercontent.com/DenisCarriere/312775d66fc136f4d91b26e5c7b8fd65)

[caledon-building-address:](https://gist.githubusercontent.com/DenisCarriere/263312e80d9b3d17376ee2b64a0a7ff7)


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

