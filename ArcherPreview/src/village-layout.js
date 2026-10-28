// Authored placements are shared by rendering, terrain pads and navigation.
// Reusing these 25 source assets never submits another generation request.
import { obstacleClearance } from './village-collision.js';
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
    const stack=i%3?'firewood':'crate-barrel-cluster',stackSize=COLLIDER_SHAPES[stack].colliderFootprint,stackHalf=stackSize[0]*.85*.5;
    const [hx,hz]=house.colliderOffset??[0,0],bodyHalf=house.colliderFootprint[0]*house.scale*.5;
    let side=hx*house.scale-bodyHalf-stackHalf-.12,along=hz*house.scale;
    if(villageRoadDistance(house.x+sx*side+dx*along,house.z+sz*side+dz*along)<2.2){
      side=hx*house.scale+bodyHalf+stackHalf+.12;
      along-=Math.min(1.6,house.colliderFootprint[1]*house.scale*.5-stackSize[1]*.85*.5-.12);
    }
    add(stack,house.x+sx*side+dx*along,house.z+sz*side+dz*along,house.yaw,{kind:'prop',scale:.85,owner:house.id});
  }
  const random=seeded(20261028);
  for(const [x,z,scale]of [[-17,3,.75],[23,11,.8],[-18,-26,.68],[-9,-7,.66],[-8,8,.7],[9,7,.74],[5,-6,.62],[-15,26,.7],[16,26,.66],[-31,15,.72]])add('tree-01-round-oak',x,z,facingCenter(x,z)+Math.sin(x*3.7+z)*.18,{kind:'tree',scale:scale*.88});
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
  // Dress inhabited plots in related groups: fences, vegetable beds, a work
  // corner and planting. Candidate footprints protect the existing wide routes.
  const dressRandom=seeded(728104), dressing=[];
  const visualFootprints={'garden-bed':[2.03,1.61],bush:[1.82,1.49],'tree-01-round-oak':[3.5,3.5],'tree-02-slender-pine':[2.2,2.2]};
  let solids=villageObstacles(out,{refinedTrees:false});
  const place=(asset,x,z,yaw,extra={})=>{
    const p={asset,x,z,yaw,scale:1,...extra,...COLLIDER_SHAPES[asset]},scale=p.scale;
    const footprint=visualFootprints[asset]??p.colliderFootprint??[1,1];
    const [w,d]=footprint.map(v=>v*scale),c=Math.cos(yaw),s=Math.sin(yaw);
    if(Math.abs(x)>36.2||Math.abs(z)>39.2||Math.hypot(x,z)<3.2)return false;
    // Sample the full footprint, not only its center: a fence cannot quietly
    // close the road or overlap an adjacent doorway with one of its ends.
    for(let a=0;a<=Math.ceil(w/.45);a++)for(let b=0;b<=Math.ceil(d/.45);b++){
      const lx=-w/2+a*w/Math.ceil(w/.45),lz=-d/2+b*d/Math.ceil(d/.45);
      const q={x:x+lx*c+lz*s,z:z-lx*s+lz*c};
      if(villageRoadDistance(q.x,q.z)<1.05||solids.some(o=>obstacleClearance(q,o)<.12))return false;
    }
    if(dressing.some(q=>Math.hypot(q.x-x,q.z-z)<(q.dressRadius+Math.min(w,d)*.32)))return false;
    add(asset,x,z,yaw,{...extra,dressed:true});
    const placed=out.at(-1);dressing.push({...placed,dressRadius:Math.min(w,d)*.32});
    solids.push(...villageObstacles([placed],{refinedTrees:false}));return true;
  };
  for(const [i,h]of VILLAGE_HOMES.entries()){
    const c=Math.cos(h.yaw),s=Math.sin(h.yaw),half=h.colliderFootprint[0]*h.scale*.5;
    const at=(asset,x,z,angle,extra={})=>place(asset,h.x+x*c+z*s,h.z-x*s+z*c,h.yaw+angle,{owner:h.id,...extra});
    // Different open L/U shapes provide boundaries without sealing people in.
    for(const side of i%2?[1,-1]:[-1,1]){
      const outer=side*(half+3.5),middle=side*(half+1.9);
      at('rail-fence',outer,-.6,Math.PI/2,{kind:'fence',length:3.8});
      at('rail-fence',middle,-2.7,0,{kind:'fence',length:3.8});
      if(i%3!==0)at('rail-fence',middle,3.2,.035*side,{kind:'fence',length:3.8});
      at('garden-bed',middle,-1.1,.03*side,{kind:'garden',scale:.92});
      if(i%3!==1)at('garden-bed',middle,1,.03*side,{kind:'garden',scale:.88});
      at('bush',side*(half+.65),-3.2,i*.63,{kind:'shrub',scale:.55+(.12*(i%3))});
      at('bush',outer+.25*side,2.4,i*.94,{kind:'shrub',scale:.7});
    }
    // A second smaller load beside the house breaks the repeated single-stack
    // pattern; workshops get carts and storage, cottages get garden supplies.
    for(const [side,along]of [[1,-1.4],[-1,1.5],[1,2.5],[-1,-2.5]]){
      if(at(i%4===2?'handcart':'crate-barrel-cluster',side*(half+1.05),along,(i%3-1)*.13,{kind:'prop',scale:i%4===2?.65:.58}))break;
    }
    // Fruit trees belong at plot corners, varied in size, with shrubs below.
    if(i%3!==1)for(const side of [i%2?1:-1,i%2?-1:1]){
      if(at('tree-01-round-oak',side*(half+3.4),-4.2,(i%5-2)*.19,{kind:'tree',scale:.43+(i%4)*.045}))break;
    }
  }
  // A working churchyard and market apron flank the central route.
  for(const [asset,x,z,yaw,scale]of [
    ['crate-barrel-cluster',-8.8,-6.5,.3,.72],['handcart',-9.5,3.1,-.9,.7],
    ['crate-barrel-cluster',-5,5.6,-.3,.65],['covered-wagon',24,29,1.75,.86],
    ['rail-fence',17.2,-5.8,Math.PI/2,1],['rail-fence',17.2,-9.6,Math.PI/2,1],
    ['rail-fence',13.5,-11.3,0,1],['bush',10,-11.5,1,.85],['bush',15.8,-11.2,2,.7],
    ['crate-barrel-cluster',2.9,-3.4,.6,.58],['crate-barrel-cluster',-4.4,5.7,-.3,.58],
    ['handcart',-3.5,9.2,-.4,.65],
  ])place(asset,x,z,yaw,{scale,kind:asset==='rail-fence'?'fence':asset==='bush'?'shrub':'prop'});
  for(const [x,z,scale]of [[4.6,11.4,.5],[-4.4,-10.5,.48],[5.7,-10.5,.43],[-6,15,.47]]){
    place('tree-01-round-oak',x,z,facingCenter(x,z)+.2,{kind:'tree',scale});
    for(const [ox,oz,s]of [[1.3,.6,.6],[-1.3,-.8,.52],[.6,1.8,.42]])place('bush',x+ox,z+oz,ox+z,{kind:'shrub',scale:s});
  }
  // Two shared kitchen gardens use the remaining lawn between the main lanes.
  for(const [cx,cz]of [[6.5,19],[-13,-7]]){
    for(const x of [-1.15,1.15])for(const z of [-1.05,1.05])place('garden-bed',cx+x,cz+z,.02,{kind:'garden',scale:.9});
    place('rail-fence',cx-2.65,cz,Math.PI/2,{kind:'fence',length:3.8});
    place('rail-fence',cx+.3,cz+2.5,.035,{kind:'fence',length:3.8});
    place('crate-barrel-cluster',cx+2.9,cz-1.2,.4,{kind:'prop',scale:.52});
  }
  // Clustered undergrowth at the wall and in unused plot corners creates a
  // ragged, lived-in edge, with no new model, material or texture downloads.
  const anchors=[[-33,-33],[-33,-20],[-33,-7],[-33,7],[-31,27],[-21,36],[-9,37],
    [11,36],[27,33],[33,23],[33,10],[33,-5],[32,-18],[24,-35],[10,-35],[-8,-35],
    [-17,-9],[-16,18],[16,11],[8,26],[-6,-20],[9,-22],[-7,18],[17,-17]];
  for(const [index,[x,z]]of anchors.entries()){
    if(index%3===0)place('tree-01-round-oak',x,z,index*.83,{kind:'tree',scale:.46+(index%4)*.06});
    for(let i=0;i<4;i++){
      const a=dressRandom()*Math.PI*2,r=.8+dressRandom()*2.8;
      place('bush',x+Math.cos(a)*r,z+Math.sin(a)*r,dressRandom()*6.28,{kind:'shrub',scale:.45+dressRandom()*.6});
    }
    if(index<16)place('rock-01-mossy-boulder',x-1.6,z+1.3,index*.73,{kind:'rock',scale:.3+index%3*.08});
    for(let i=0;i<3;i++){
      const a=dressRandom()*6.28,r=.5+dressRandom()*3.8;
      // Ankle-height stone chips are visual ground cover, not invisible walls.
      place('rock-01-mossy-boulder',x+Math.cos(a)*r,z+Math.sin(a)*r,a,{kind:'ground-detail',scale:.055+dressRandom()*.045,decorative:true});
    }
  }
  return out;
}
export const VILLAGE_PLACEMENTS=makePlacements();
export const VILLAGE_PADS=VILLAGE_PLACEMENTS.filter(p=>p.pad).map(p=>({...p,radius:Math.hypot(...p.footprint)*.56}));

export function villageObstacles(placements=VILLAGE_PLACEMENTS,{refinedTrees=true}={}){
  const obstacles=[];
  for(const p of placements){
    if(p.decorative)continue;
    const scale=p.scale??1,cos=Math.cos(p.yaw),sin=Math.sin(p.yaw),offset=p.colliderOffset??[0,0];
    const center=(x,z)=>({x:p.x+(x*cos+z*sin)*scale,z:p.z+(-x*sin+z*cos)*scale});
    if(p.kind==='tree'||p.colliderRadius){
      if(p.kind==='tree'&&Math.hypot(p.x,p.z)>=50)continue;
      const treeScale=p.kind==='tree'&&refinedTrees?(p.asset==='tree-01-round-oak'?.55:.8):1;
      obstacles.push({id:p.id,...center(...offset.map(n=>n*treeScale)),radius:(p.colliderRadius??.4)*scale*treeScale,height:p.kind==='tree'?8:p.kind==='rock'?3:1.5});
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
