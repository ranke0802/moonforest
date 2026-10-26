const tree=(kind,x,z,scale,yaw)=>({key:`${kind}-tree`,x,z,scale,yaw,radius:(kind==='oak'?1:.55)*scale});

// Even overall coverage with irregular spacing, scale and rotation. The open
// center is preserved, and trees continue beyond the playable edge toward the
// foothills. These 42 fixed best-candidate samples have >6 m between trunks;
// shared models and distance LODs keep the outer trees inexpensive.
export const TREE_PLACEMENTS = [
  tree('oak',9.8,-13.8,0.96,2.17),
  tree('verdant',-12.9,29.1,0.93,5.66),
  tree('verdant',-30,-6.5,1.05,3.47),
  tree('verdant',19.7,19.3,0.93,5.04),
  tree('oak',-13.1,-22.9,0.89,0.01),
  tree('verdant',29.6,1.3,1.07,3.27),
  tree('verdant',-14.7,9.3,1.07,1.96),
  tree('verdant',3.7,12.4,0.9,0.64),
  tree('oak',3.7,28.5,0.87,5.38),
  tree('verdant',5.4,-28.8,0.85,6.12),
  tree('verdant',-7,-10.4,1.01,1.26),
  tree('verdant',24.9,-15.4,0.86,4.63),
  tree('oak',16.4,6.2,0.91,5.54),
  tree('verdant',-28.1,6.7,1,6.25),
  tree('verdant',-25.4,-18.2,1.06,0.04),
  tree('verdant',16.1,-24.3,0.94,2.12),
  tree('oak',-5.7,20,0.88,2.39),
  tree('verdant',-21.4,20.9,0.88,4.89),
  tree('verdant',16.8,-4.9,1.02,0.54),
  tree('verdant',-18,-2.1,1.03,1.38),
  tree('oak',10.1,21.4,1,4.66),
  tree('verdant',-2.6,-21.7,0.99,5.1),
  tree('verdant',25.8,11.1,0.93,5.63),
  tree('verdant',-15.8,-12.2,0.84,1.47),
  tree('oak',-4.6,28.2,0.89,1.47),
  tree('verdant',0.6,-13.6,0.91,1.65),
  tree('verdant',25.4,-7.4,0.98,3.65),
  tree('verdant',-22.9,13.2,0.85,1.17),
  tree('oak',-13.3,17.6,0.91,5.54),
  tree('verdant',17.2,-14.7,0.94,5.73),
  tree('verdant',-6,11.4,0.85,3.91),
  tree('verdant',12.5,12.9,1.03,5.1),
  tree('oak',-5.9,-28.6,0.96,2.48),
  tree('verdant',4.1,-20,0.99,4.26),
  tree('verdant',-25.4,-0.2,1.04,3.48),
  tree('verdant',-23.9,-10.8,0.96,2.02),
  tree('oak',1.7,21.4,0.86,1.05),
  tree('verdant',-18.2,-19,0.84,4.29),
  tree('verdant',22.7,3.8,1.05,4.59),
  tree('verdant',-9.9,-17,0.96,3.14),
  tree('oak',21.8,-20.7,0.85,2.04),
  tree('verdant',10.5,-20.3,0.97,5.56),
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
