// Metres. Branches follow eroded ledges around a flooded central cavern;
// they are deliberately not a rectangular dungeon grid.
export const CAVE_ENTRY={x:-42,z:43};
export const CAVE_BOSS={x:29,z:-30,r:15,height:6};
export const CAVE_ROOMS=[
  {x:-42,z:43,r:8,height:0},{x:-30,z:19,r:7,height:1},
  {x:-35,z:-18,r:9,height:3},{x:7,z:27,r:8,height:1.4},
  {x:35,z:9,r:9,height:3.2},CAVE_BOSS,
];
// x, z, elevation, half-width. Every crossing shares the same elevation.
export const CAVE_ROUTES=[
  [[-42,43,0,5],[-35,32,.4,4.3],[-30,19,1,4.7],[-35,3,1.8,4],[-35,-18,3,5],[-19,-26,4,4.3],[-4,-27,4.8,4.1],[12,-28,5.5,4.8],[29,-30,6,7]],
  [[-42,43,0,5],[-27,38,.5,4.2],[-11,32,1,4.5],[7,27,1.4,5],[24,23,2.2,4.8],[35,9,3.2,5.5],[42,-6,4.2,4],[39,-19,5.2,4.6],[29,-30,6,7]],
  [[-30,19,1,4.7],[-18,22,1.2,4],[-5,25,1.4,4],[7,27,1.4,5]],
  [[-35,3,1.8,4],[-26,-7,2.5,3.8],[-11,-11,3,4],[6,-7,3.2,3.8],[22,0,3.2,4.2],[35,9,3.2,5.5]],
];
export const CAVE_SEGMENTS=CAVE_ROUTES.flatMap(points=>points.slice(1).map((b,i)=>({a:points[i],b})));
export const CAVE_RIM=[[-60,50],[-55,20],[-62,-5],[-51,-34],[-35,-52],[-12,-48],[11,-58],[43,-54],[58,-35],[55,-4],[63,20],[48,45],[25,53],[8,47],[-15,53],[-38,58]];
export const caveRoofHeight=(x,z)=>7+.4*Math.sqrt(Math.max(0,67*67-x*x-z*z));
export function caveWaterWeight(x,z){
  let water=0;
  for(const [cx,cz,rx,rz]of [[-10,7,22,17],[1,-17,29,9],[41,28,17,10],[-9,46,35,8]]){
    const d=Math.hypot((x-cx)/rx,(z-cz)/rz)+.04*Math.sin(x*.31+z*.17),t=Math.max(0,Math.min(1,(d-.8)/.3));
    water=Math.max(water,1-t*t*(3-2*t));
  }return water;
}
export function caveSurface(x,z){
  let distance=Infinity,height=0;
  for(const {a,b} of CAVE_SEGMENTS){
    const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)-(a[3]+(b[3]-a[3])*t);
    if(d<distance){distance=d;height=a[2]+(b[2]-a[2])*t;}
  }
  for(const room of CAVE_ROOMS){const d=Math.hypot(x-room.x,z-room.z)-room.r;if(d<distance){distance=d;height=room.height;}}
  distance+=.45*Math.sin(x*.57+Math.sin(z*.19))+.28*Math.cos(z*.73+x*.13);
  return {distance,height};
}
const ids=['eroded-wall','rock-ledge','great-column','natural-arch','stalagmites','stalactite-canopy','scree-ramp','timber-brace','iron-gate-leaf','hand-winch','sluice-shutter','lift-platform','votive-lantern','hidden-pressure-stone','resurrection-altar','soul-collector-arm','faded-sacred-emblem','alchemy-workbench','apothecary-shelf','modest-cot'];
export const CAVE_ASSET_IDS=ids.map((id,i)=>`cave-${String(i+1).padStart(2,'0')}-${id}`);
export const CAVE_RAMPS=[{x:-34,z:30,scale:1.05,yaw:.35,elevation:-.3},{x:40,z:-13,scale:1.1,yaw:-.2,elevation:4.05}];
function makePlacements(){
  const out=[];let seed=291005;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const add=(n,x,z,scale=1,yaw=0,extra={})=>out.push({id:`cavern-${out.length}`,asset:typeof n==='number'?CAVE_ASSET_IDS[n-1]:n,x,z,scale,yaw,kind:n<=7?'rock':'prop',...extra});
  // Broken outer walls, with clear gaps for the entrance and the boss approach.
  for(let segment=0;segment<CAVE_RIM.length;segment++){
    const a=CAVE_RIM[segment],b=CAVE_RIM[(segment+1)%CAVE_RIM.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/8),yaw=Math.atan2(-dz,dx);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t;
      if(Math.hypot(x+47,z-48)<9)continue;
      add(1,x,z,1.65+random()*.6,yaw+random()*.15,{elevation:-3});
      add(1,x+dz/length*2.5,z-dx/length*2.5,1.8+random()*.6,yaw-.15,{elevation:4.5+random()*2.5});
      if(i%2===0){const xx=x-dz/length*3,zz=z+dx/length*3;add(6,xx,zz,1.35+random()*.4,yaw,{elevation:caveRoofHeight(xx,zz)-3});}
    }
  }
  // Natural rock shoulders under both sides of the traversable shelf.
  for(const {a,b} of CAVE_SEGMENTS){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/7);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t,r=a[3]+(b[3]-a[3])*t,h=a[2]+(b[2]-a[2])*t;
      for(const side of [-1,1]){
        const xx=x-dz/length*(r+1.4)*side,zz=z+dx/length*(r+1.4)*side;
        if(caveSurface(xx,zz).distance<-1.5)continue;
        const water=caveWaterWeight(xx,zz)>.45;
        const outward=water?0:1.6,px=xx-dz/length*side*outward,pz=zz+dx/length*side*outward;
        add(water?2:1,px,pz,.85+random()*.3,Math.atan2(-dz,dx)+random()*.18,{topElevation:water?h-.15:h+3.7+random()*.8});
        if(random()<.26)add(5,xx-dz/length*side*1.6,zz+dx/length*side*1.6,.55+random()*.5,random()*6.28,{elevation:h-.5});
      }
    }
  }
  // Massive rock islands give the cave its silhouette and hide the next turn.
  add(3,-10,7,2.75,.2,{elevation:-3,colliderRadius:8});
  add(3,-49,-14,1.1,2,{elevation:-2,colliderRadius:3.6});
  add(3,52,-22,1.3,4,{elevation:-2,colliderRadius:4.2});
  add(3,9,-48,1.1,1,{elevation:1,colliderRadius:3.8});
  add(4,-37,34,1.05,.45,{elevation:.3});
  add('forest-06-witch-cave-mouth',-47,48,1.25,-.75,{kind:'landmark',elevation:0});
  add(4,-6,-26,1.25,Math.PI/2,{elevation:4.6});
  add(4,34,13,1.3,.6,{elevation:2.8});
  for(const p of CAVE_RAMPS)add(7,p.x,p.z,p.scale,p.yaw,{elevation:p.elevation});
  // Puzzle stations are beside the through route: unfinished mechanisms never
  // trap the player. Gate leaves are visibly opened, not invisible blockers.
  for(const [x,z,yaw]of [[-35,10,.2],[-25,-24,1.3],[28,21,.8],[39,-9,0]]){
    const h=caveSurface(x,z).height;
    add(8,x-4,z,1,yaw,{elevation:h});add(9,x-3,z,1,yaw+Math.PI/2,{elevation:h});
    add(10,x+4,z-1,1,yaw,{elevation:h});add(14,x,z+.5,1,yaw,{topElevation:h+.035});
  }
  add(11,-22,-3,1.2,.15,{elevation:-2});add(12,-39,-25,1,0,{elevation:2.5});
  add(8,-39,-25,1.4,0,{elevation:2.5});
  for(const [x,z]of [[-44,38],[-30,24],[-38,-12],[-23,-27],[-3,-30],[12,25],[32,15],[42,-8],[19,-20],[36,-38]])add(13,x,z,1,random()*6.28,{elevation:caveSurface(x,z).height});
  // A former saint's dwelling occupies a spacious apse, rather than a palace.
  add(15,29,-34,1.45,0,{elevation:6,colliderRadius:3.8});
  for(const [dx,dz]of [[-4,-4],[4,-4],[-4,4],[4,4]])add(16,29+dx,-34+dz,1.1,Math.atan2(dz,-dx),{elevation:6,colliderRadius:.55,colliderOffsetX:-.74});
  add(8,29,-42,2.6,0,{elevation:6});
  add(17,29,-41.6,1,0,{topElevation:11.5});
  add(18,18,-34,1.05,.4,{elevation:6,colliderRadius:1.35});
  add(19,18,-39,1.05,.45,{elevation:6,colliderRadius:1.15});
  add(20,39,-35,1.1,-.6,{elevation:6,colliderRadius:1});
  add('crate-barrel-cluster',-44,40,.8,.3,{colliderRadius:.7});
  add('firewood',-46,43,.7,0);add('handcart',-37,45,.8,1.8,{colliderRadius:1});
  for(let i=0;i<30;i++){
    const a=random()*Math.PI*2,r=8+random()*36,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(caveSurface(x,z).distance<3)continue;
    add(i%2?'rock-02-jagged-outcrop':'rock-01-mossy-boulder',x,z,.65+random(),random()*6.28,{elevation:-3});
    if(i%3===0)add(5,x+2,z,1+random()*.8,random()*6.28,{elevation:-2.8});
  }
  return out;
}
export const CAVE_PLACEMENTS=makePlacements();
export function caveObstacles(){
  const obstacles=CAVE_PLACEMENTS.filter(p=>p.colliderRadius).map(p=>({id:p.id,x:p.x+Math.cos(p.yaw)*(p.colliderOffsetX??0)*p.scale,z:p.z-Math.sin(p.yaw)*(p.colliderOffsetX??0)*p.scale,radius:p.colliderRadius,height:p.asset.includes('column')?18:2}));
  for(const p of CAVE_PLACEMENTS){
    if(p.asset===CAVE_ASSET_IDS[3])for(const side of [-1,1]){
      const offset=side*3.25*p.scale;
      obstacles.push({id:p.id+'-post'+side,x:p.x+Math.cos(p.yaw)*offset,z:p.z-Math.sin(p.yaw)*offset,radius:.9*p.scale,height:7*p.scale});
    }
    if(p.asset===CAVE_ASSET_IDS[7])for(const side of [-1,1]){
      const offset=side*1.22*p.scale;
      obstacles.push({id:p.id+'-brace'+side,x:p.x+Math.cos(p.yaw)*offset,z:p.z-Math.sin(p.yaw)*offset,radius:.18*p.scale,height:2.46*p.scale});
    }
    if(p.asset===CAVE_ASSET_IDS[9])obstacles.push({id:p.id,x:p.x,z:p.z,radius:.65*p.scale,height:1.6*p.scale});
  }
  return obstacles;
}
