const reader = require('geojson-writer').reader
const ruler = require('cheap-ruler')(45.41, 'meters')

const forwards = [];
const backwards = [];
const roads = reader('roadsWithSigns.json');

const findSign = function(point){

  const found = roads.features.find(function(element) {
    if(element.geometry.type != 'Point')
      return false;
    if(!['stop','give_way'].includes(element.properties['highway']))
      return false;
    if(element.geometry.coordinates[0]!=point[0]
      || element.geometry.coordinates[1]!=point[1])
      return false;

    return true;
  });

  if(typeof(found)!='undefined')
    return found.id;

  return '';
}

for(let road of roads.features){
  if(road.geometry.type == 'Point') continue;

  if(road.geometry.coordinates.length<=2) //shouldn't be
    console.log(`Line has ${road.geometry.coordinates.length} points!`);

  //take 2 points (second and second-last for simplicity) and check if one if they are signs
  const point1 = road.geometry.coordinates[1];
  const point2 = road.geometry.coordinates[road.geometry.coordinates.length - 2];

  let node1 = findSign(point1);
  let node2 = findSign(point2);
  if(node1==node2 && node1!=''){  //if 3-line way - check which side is closer to the sign
    if(ruler.distance(point1, road.geometry.coordinates[0]) > ruler.distance(point1, road.geometry.coordinates[road.geometry.coordinates.length-1]))
      node1='';
    else
      node2='';
  }
  if(node1!=''){
    //console.log(`Node ${node1} is backwards sign`);
    backwards.push(node1);
  }
  if(node2!=''){
    //console.log(`Node ${node2} is forwards sign`);
    forwards.push(node2);
  }
}

console.log(`Found ${forwards.length} forwards signs`);
console.log(`Found ${backwards.length} backwards signs`);
