// Open central sparring circle, with multiple routes between planted borders.
export const TREE_PLACEMENTS = [
  {key:'verdant-tree',x:-5.3,z:1.0,scale:1,yaw:.4,radius:.55},
  {key:'verdant-tree',x:5.3,z:.3,scale:.95,yaw:2.1,radius:.53},
  {key:'verdant-tree',x:.6,z:6.1,scale:1.05,yaw:1.2,radius:.58},
  {key:'verdant-tree',x:-4.6,z:-5.6,scale:.9,yaw:2.7,radius:.5},
  {key:'oak-tree',x:7.7,z:6.1,scale:1,yaw:.7,radius:1},
  {key:'oak-tree',x:-8.0,z:5.4,scale:.95,yaw:2,radius:.96},
  {key:'oak-tree',x:7.5,z:-6.5,scale:.95,yaw:3.2,radius:.96},
  {key:'oak-tree',x:-8.4,z:-3.0,scale:1.05,yaw:4,radius:1.05},
  {key:'verdant-tree',x:.9,z:-9.0,scale:1.05,yaw:.2,radius:.58},
  {key:'verdant-tree',x:-3.5,z:10.2,scale:1.1,yaw:1.6,radius:.6},
  ...Array.from({length:14},(_,i)=>{const a=i*2.399963,r=14+(i%3)*2;return {key:i%3?'verdant-tree':'oak-tree',x:Math.sin(a)*r,z:Math.cos(a)*r,scale:.85+(i%4)*.1,yaw:a,radius:.65};}),
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
