const turf = require("@turf/turf");
const reader = require('geojson-writer').reader

const forwards = [];
const backwards = [];
const roads = reader('roadsWithSigns.json');

const findSign = function(point){

  const found = roads.features.find(function(element) {
    if(element.geometry.type != 'Point')
      return false;
    if(!['stop','give_way'].includes(element.properties['highway']))
      return false;
    if(element.geometry.coordinates[0]!=point)
      return false;
      
    return true;
  });

  if(typeof(found)!='undefined')
    return found.id;

  return '';
}

for(let road of roads.features){
  if(road.geometry.type == 'Point') continue;

  //take 2 points - second and second-last and check if one if they are signs
  const point1 = road.geometry.coordinates[1];
  const point2 = road.geometry.coordinates[road.geometry.coordinates.length - 2];

  const node1 = findSign(point1);
  if(node1!=''){
    console.log(`Node ${node1} is backwards sign`);
    backwards.push(node1);
  }
  const node2 = findSign(point1);
  if(node2!=''){
    console.log(`Node ${node2} is forwards sign`);
    forwards.push(node2);
  }
}

console.log(`Found ${forwards.length} forwards signs`);

console.log(`Found ${backwards.length} backwards signs`);
