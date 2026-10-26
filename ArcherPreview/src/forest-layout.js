const tree=(kind,x,z,scale,yaw)=>({key:`${kind}-tree`,x,z,scale,yaw,radius:(kind==='oak'?1:.55)*scale});

// A broad clearing with uneven groves and open approaches between them.
// Authored positions stay fixed across reloads; no evenly spaced radial rows.
// Keep the existing 24 trees / species mix and derive collision from placement.
export const TREE_PLACEMENTS = [
  // Northwest: a broad, staggered grove.
  tree('verdant',-11.6,8.6,1.08,.4),
  tree('oak',-14.8,8.2,.94,2.1),
  tree('verdant',-12.9,12.4,.86,4.7),
  tree('verdant',-16.4,12.0,1.13,1.2),
  tree('oak',-18.1,8.1,.92,3.8),
  // Northeast: set farther back, leaving a wider northern opening.
  tree('verdant',8.4,12.5,1.04,2.7),
  tree('oak',11.8,14.3,1.04,.7),
  tree('verdant',15.2,12.1,.9,5.4),
  tree('oak',13.0,16.8,.9,3.2),
  // East: a small grove that projects slightly toward the clearing.
  tree('verdant',12.1,1.9,.94,1.8),
  tree('oak',15.1,-.1,1,4.1),
  tree('verdant',17.9,3.1,1.1,.2),
  tree('verdant',14.9,5.6,.85,5.8),
  // Southeast: a loose diagonal group, separated from the eastern grove.
  tree('verdant',9.4,-10.5,1.02,3.4),
  tree('oak',13.1,-11.8,.93,1.1),
  tree('verdant',9.8,-14.9,.88,4.6),
  tree('oak',14.1,-15.4,.9,2.6),
  // Southwest: a denser cluster with an irregular edge.
  tree('verdant',-7.9,-11.8,1,.9),
  tree('oak',-11.4,-10.5,1.03,5.2),
  tree('verdant',-12.4,-14.2,.9,2.2),
  tree('verdant',-16,-12.8,1.08,4),
  tree('verdant',-8.1,-16.1,.93,5.9),
  // Two solitary trees break up the gaps without closing off the routes.
  tree('oak',-14.2,-2.6,.9,1.6),
  tree('verdant',1.4,-18.1,1.08,3.9),
];
export const GRASS_BEDS = [
  {x:3.9,z:-3.8,radius:.72},{x:-5.3,z:-1.3,radius:.65},{x:2.2,z:-6.5,radius:.7},
  {x:5.7,z:3.4,radius:.65},{x:-2.9,z:6.4,radius:.7},{x:2.7,z:7.6,radius:.8},
  {x:-6.7,z:6.9,radius:.8},{x:7.5,z:-3.1,radius:.8},{x:-7.2,z:-6.8,radius:.8},
  {x:4.5,z:-8.7,radius:.8},{x:-2.2,z:-8.0,radius:.65},{x:9.1,z:1.6,radius:.75},
];
export const FOREST_OBSTACLES = [
  ...TREE_PLACEMENTS.map((p,i)=>({id:`tree-${i}`,x:p.x,z:p.z,radius:p.radius,height:6})),
];
export const TRAINING_OBSTACLES = [
  {id:'dummy-south',x:-1,z:-4,radius:.3,height:1.85},
];
