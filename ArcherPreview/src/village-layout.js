// Authored placements are shared by rendering, terrain pads and navigation.
// Reusing these 25 source assets never submits another generation request.
export const VILLAGE_ASSET_IDS = [
  'house-01-cottage','house-02-tall-home','house-03-workshop','house-04-forest-hut',
  'wall-01-straight','wall-02-corner','wall-03-breached','wood-01-palisade',
  'wood-02-cross-barricade','wood-03-plank-gate','tree-01-round-oak','tree-02-slender-pine',
  'rock-01-mossy-boulder','rock-02-jagged-outcrop','chapel','well','watchtower','rail-fence',
  'bush','market-stall','covered-wagon','handcart','garden-bed','firewood','crate-barrel-cluster',
];
export const VILLAGE_SPAWN = Object.freeze({x:0,z:6});
export const VILLAGE_RADIUS = 48;
export const isVillageRoute = (search=globalThis.location?.search??'') => new URLSearchParams(search).get('character')==='warrior-v3';
const facingCenter=(x,z)=>Math.atan2(-x,-z);
// Measured at player-height sections of the approved models, after target-height
// scaling. Foundations retain their original larger pads; collisions use bodies.
const COLLIDER_SHAPES={
  'house-01-cottage':{colliderFootprint:[4.62,5.55],colliderOffset:[-.01,.01]},
  'house-02-tall-home':{colliderFootprint:[4.76,3.96],colliderOffset:[-.42,-.06]},
  'house-03-workshop':{colliderFootprint:[5.82,3.21],colliderOffset:[0,-.56]},
  'house-04-forest-hut':{colliderFootprint:[3.69,3.69],colliderOffset:[-.04,.06]},
  chapel:{colliderFootprint:[6.42,7.86],colliderOffset:[0,-.12]},
  well:{colliderRadius:1.35,colliderFootprint:[2.7,2.7],colliderOffset:[.2,0]},
  watchtower:{colliderFootprint:[3,3.8]},
  'rail-fence':{colliderFootprint:[3.8,.38]},
  'market-stall':{colliderFootprint:[3.6,2.7]},
  'covered-wagon':{colliderFootprint:[2.7,5.48],colliderParts:[
    {x:0,z:-.69,footprint:[2.7,4.1]},
    {x:-.01,z:2.03,footprint:[.22,1.4],height:.6},
  ]},
  handcart:{colliderFootprint:[2,3.12],colliderParts:[
    {x:0,z:-.58,footprint:[2,1.95]},
    {x:-.48,z:.95,footprint:[.2,1.2],height:.6},
    {x:.48,z:.95,footprint:[.2,1.2],height:.6},
  ]},
  firewood:{colliderFootprint:[2.22,1.08],colliderHeight:1.2},
  'crate-barrel-cluster':{colliderFootprint:[1.8,1.83],colliderHeight:1.6},
  'wall-01-straight':{colliderFootprint:[4.15,.96]},
  'wall-02-corner':{colliderFootprint:[4.46,4.05],colliderParts:[
    {x:0,z:-1.48,footprint:[4.3,1.05]},
    {x:-1.65,z:0,footprint:[1,3.9]},
  ]},
  'wood-02-cross-barricade':{colliderFootprint:[2.5,.45]},
  'wood-03-plank-gate':{colliderFootprint:[4.29,.62]},
  'tree-01-round-oak':{colliderRadius:1.2,colliderOffset:[.36,-.12]},
  'rock-01-mossy-boulder':{colliderFootprint:[3.4,3.4],colliderRadius:1.7,colliderOffset:[0,.01]},
  'rock-02-jagged-outcrop':{colliderFootprint:[4.4,3.2],colliderOffset:[-.01,.01]},
};
const homes=[
  [-22,-29,0],[-9,-29,1],[4,-29,0],[17,-29,0],
  [-27,-17,2],[-27,-4,0],[-27,9,3],[-27,21,0],
  [28,-23,3],[28,-9,0],[28,5,2],[28,19,0],
  [-19,31,0],[-6,31,3],[7,31,0],[20,31,2],
  [-12,-15,0],[-13,13,2],[13,17,1],[7,-16,3],
];
const homeKeys=VILLAGE_ASSET_IDS.slice(0,4);
export const VILLAGE_HOMES=homes.map(([x,z,type],i)=>({
  id:`home-${String(i+1).padStart(2,'0')}`,asset:homeKeys[type],x,z,yaw:facingCenter(x,z),
  scale:1+(i%3-1)*.035,kind:'building',pad:true,
  footprint:type===1?[5.8,6.6]:type===2?[7.5,6]:[6,6.9],
  ...COLLIDER_SHAPES[homeKeys[type]],
}));
export const VILLAGE_RING_ROAD=[[-20,-23],[20,-23],[20,23],[-20,23],[-20,-23]];
export function homeRoadEnd(p){
  const candidates=[[0,p.z],[p.x,0]];
  for(let i=1;i<VILLAGE_RING_ROAD.length;i++){
    const a=VILLAGE_RING_ROAD[i-1],b=VILLAGE_RING_ROAD[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz)));
    candidates.push([a[0]+dx*t,a[1]+dz*t]);
  }
  return candidates.sort((a,b)=>Math.hypot(p.x-a[0],p.z-a[1])-Math.hypot(p.x-b[0],p.z-b[1]))[0];
}
const HOME_ROAD_SEGMENTS=VILLAGE_HOMES.map(p=>[[p.x,p.z],homeRoadEnd(p)]);

function perimeterPoints(count){
  const curve=[],distances=[0];
  for(let i=0;i<=1024;i++){
    const a=i/1024*Math.PI*2,s=Math.sin(a),c=Math.cos(a);
    curve.push([Math.sign(s)*Math.sqrt(Math.abs(s))*38,Math.sign(c)*Math.sqrt(Math.abs(c))*42]);
    if(i)distances.push(distances[i-1]+Math.hypot(curve[i][0]-curve[i-1][0],curve[i][1]-curve[i-1][1]));
  }
  const total=distances.at(-1),points=[];let segment=0;
  for(let i=0;i<count;i++){
    const d=i/count*total;while(distances[segment+1]<d)segment++;
    const t=(d-distances[segment])/(distances[segment+1]-distances[segment]);
    points.push(curve[segment].map((n,j)=>n+(curve[segment+1][j]-n)*t));
  }
  return points;
}

function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function makePlacements(){
  const out=[...VILLAGE_HOMES];
  const add=(asset,x,z,yaw=0,extra={})=>out.push({id:`${asset}-${out.length}`,asset,x,z,yaw,scale:1,...extra,...COLLIDER_SHAPES[asset]});
  add('chapel',12,-6,-Math.PI/2,{kind:'building',pad:true,footprint:[8.8,10]});
  add('well',0,0,0,{kind:'landmark',footprint:[2.8,2.8],pad:true});
  add('market-stall',-6,-5,facingCenter(-6,-5),{kind:'prop',footprint:[3.6,2.5]});
  add('market-stall',-7,4,facingCenter(-7,4),{kind:'prop',footprint:[3.6,2.5]});
  add('covered-wagon',12,36,-Math.PI/2,{kind:'prop',footprint:[2.7,5]});
  add('handcart',-8,37,1.4,{kind:'prop',footprint:[1.6,2.7]});
  add('watchtower',31,31,facingCenter(31,31),{kind:'tower',footprint:[3.8,3.8],pad:true});
  add('watchtower',37,18,facingCenter(37,18),{kind:'tower',footprint:[3.8,3.8],pad:true});
  // The southern entrance is genuinely open: no closed gate model across the road.
  add('wood-03-plank-gate',0,-42,0,{kind:'wall',footprint:[5.5,.8]});
  const wallCount=72,perimeter=perimeterPoints(wallCount);
  for(let i=0;i<wallCount;i++){
    const [x,z]=perimeter[i],before=perimeter[(i+wallCount-1)%wallCount],after=perimeter[(i+1)%wallCount];
    if((z>38&&Math.abs(x)<4.8)||(z< -38&&Math.abs(x)<3.3))continue;
    const asset=i%13===5?'wall-03-breached':i%9===2?'wood-01-palisade':'wall-01-straight';
    const yaw=Math.atan2(-(after[1]-before[1]),after[0]-before[0]);
    add(asset,x,z,yaw+(asset==='wood-01-palisade'?Math.PI:0),{kind:'wall',length:4.15,footprint:[4.15,.7]});
  }
  for(const [x,z,yaw] of [[-5.7,41,.15],[5.7,41,-.15],[-36,17,1.6],[36,10,1.2]]){
    add('wall-02-corner',x,z,yaw,{kind:'wall',footprint:[2.4,2.4]});
  }
  for(const [x,z,yaw] of [[-7,44,.45],[8,44,-.45],[-35,-29,1.1],[37,22,.2]]){
    add('wood-02-cross-barricade',x,z,yaw,{kind:'wall',footprint:[3.3,1.3]});
  }
  for(const [i,house] of VILLAGE_HOMES.entries()){
    const dx=Math.sin(house.yaw),dz=Math.cos(house.yaw),sx=Math.cos(house.yaw),sz=-Math.sin(house.yaw);
    const x=house.x+dx*4.9,z=house.z+dz*4.9;
    if(i%2===0){
      // Side gardens leave the shared circulation street open for large enemies.
      for(const side of [1,-1]){
        const fx=house.x+sx*5.1*side+dx*.5,fz=house.z+sz*5.1*side+dz*.5;
        if([-1.9,0,1.9].some(t=>villageRoadDistance(fx+dx*t,fz+dz*t)<1.6))continue;
        add('garden-bed',fx-sx*.8*side,fz-sz*.8*side,house.yaw,{kind:'garden',scale:1.1});
        add('rail-fence',fx,fz,house.yaw+Math.PI/2,{kind:'fence',length:3.8,footprint:[3.8,.22]});
        break;
      }
    }
    const stack=i%3?'firewood':'crate-barrel-cluster',stackSize=COLLIDER_SHAPES[stack].colliderFootprint,stackHalf=stackSize[0]*.85*.5;
    const [hx,hz]=house.colliderOffset??[0,0],bodyHalf=house.colliderFootprint[0]*house.scale*.5;
    let side=hx*house.scale-bodyHalf-stackHalf-.12,along=hz*house.scale;
    if(villageRoadDistance(house.x+sx*side+dx*along,house.z+sz*side+dz*along)<2.2){
      side=hx*house.scale+bodyHalf+stackHalf+.12;
      along-=Math.min(1.6,house.colliderFootprint[1]*house.scale*.5-stackSize[1]*.85*.5-.12);
    }
    add(stack,house.x+sx*side+dx*along,house.z+sz*side+dz*along,house.yaw,{kind:'prop',scale:.85});
    if(i%4===1)add('handcart',house.x+sx*4.8+dx*.7,house.z+sz*4.8+dz*.7,house.yaw+.25,{kind:'prop',scale:.85,footprint:[1.4,2.3]});
  }
  const random=seeded(20261028);
  for(const [x,z,scale]of [[-17,3,.75],[23,11,.8],[-18,-26,.68],[-9,-7,.66],[-8,8,.7],[9,7,.74],[5,-6,.62],[-15,26,.7],[16,26,.66],[-31,15,.72]])add('tree-01-round-oak',x,z,facingCenter(x,z)+Math.sin(x*3.7+z)*.18,{kind:'tree',scale});
  // A ragged forest edge leaves the gate road and skyline valleys legible.
  for(let ring=0;ring<4;ring++)for(let i=0;i<36+ring*8;i++){
    const angle=(i+random()*.5)/(36+ring*8)*Math.PI*2;
    const radius=48+ring*8+random()*6;
    const x=Math.sin(angle)*radius,z=Math.cos(angle)*radius;
    if(z>39&&Math.abs(x)<6)continue;
    const pine=(i+ring)%3===0,turn=random();
    add(pine?'tree-02-slender-pine':'tree-01-round-oak',x,z,pine?turn*Math.PI*2:facingCenter(x,z)+(turn-.5)*Math.PI/4,{kind:'tree',scale:.8+random()*.42});
    if(i%3===0)add('bush',x+(random()-.5)*5,z+(random()-.5)*5,random()*6,{kind:'shrub',scale:.8+random()*.5});
  }
  for(const [x,z,scale] of [[-31,30,.85],[-33,-25,.85],[34,29,.8],[33,-30,.8],[-42,8,1.1],[43,-13,1.1],[-16,46,1],[21,-46,1.1]]){
    add('rock-01-mossy-boulder',x,z,x*.3,{kind:'rock',scale,footprint:[2.5,2.2]});
    add('rock-02-jagged-outcrop',x-2,z+1,z*.2,{kind:'rock',scale:scale*.7,footprint:[3.4,2.3]});
  }
  for(const [x,z] of [[-35,12],[-34,-10],[34,12],[18,-35],[-17,36],[6,37],[-20,-34],[33,-17]])add('bush',x,z,x*.7,{kind:'shrub',scale:1.1});
  return out;
}
export const VILLAGE_PLACEMENTS=makePlacements();
export const VILLAGE_PADS=VILLAGE_PLACEMENTS.filter(p=>p.pad).map(p=>({...p,radius:Math.hypot(...p.footprint)*.56}));

export function villageObstacles(placements=VILLAGE_PLACEMENTS){
  const obstacles=[];
  for(const p of placements){
    const scale=p.scale??1,cos=Math.cos(p.yaw),sin=Math.sin(p.yaw),offset=p.colliderOffset??[0,0];
    const center=(x,z)=>({x:p.x+(x*cos+z*sin)*scale,z:p.z+(-x*sin+z*cos)*scale});
    if(p.kind==='tree'||p.colliderRadius){
      if(p.kind==='tree'&&Math.hypot(p.x,p.z)>=50)continue;
      obstacles.push({id:p.id,...center(...offset),radius:(p.colliderRadius??.4)*scale,height:p.kind==='tree'?8:p.kind==='rock'?3:1.5});
      continue;
    }
    const footprint=p.colliderFootprint??p.footprint;
    if(!footprint)continue;
    if(!['building','landmark','tower','wall','fence','prop','rock'].includes(p.kind))continue;
    const parts=p.colliderParts??[{x:offset[0],z:offset[1],footprint}];
    for(const [i,part]of parts.entries()){
      const [width,depth]=part.footprint.map(n=>n*scale);
      obstacles.push({id:`${p.id}-${i}`,...center(part.x,part.z),shape:'box',halfWidth:width*.5,halfDepth:depth*.5,yaw:p.yaw+(part.yaw??0),radius:Math.hypot(width,depth)*.5,height:(part.height??p.colliderHeight??(p.kind==='building'?4:1.5))*scale});
    }
  }
  return obstacles;
}

export function pointSegmentDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function villageRoadDistance(x,z){
  let distance=Math.min(Math.abs(x),Math.abs(z));
  for(let i=1;i<VILLAGE_RING_ROAD.length;i++)distance=Math.min(distance,pointSegmentDistance(x,z,VILLAGE_RING_ROAD[i-1],VILLAGE_RING_ROAD[i]));
  for(const [a,b]of HOME_ROAD_SEGMENTS)distance=Math.min(distance,pointSegmentDistance(x,z,a,b));
  return distance;
}
