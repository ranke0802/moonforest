// Village placement generator: the editing and build source of the fixed village
// layout. The game loads the generated result instead (fixed-layouts.js);
// scripts/build-fixed-layouts.mjs writes it and tests keep both identical.
import { obstacleClearance } from './village-collision.js';
import {COLLIDER_SHAPES,VILLAGE_HOMES,facingCenter,villageCorePlacements,villageRoadDistance,villageObstacles as obstaclesOf} from './village-layout-base.js';
export * from './village-layout-base.js';

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
  const out=villageCorePlacements();
  const add=(asset,x,z,yaw=0,extra={})=>out.push({id:`${asset}-${out.length}`,asset,x,z,yaw,scale:1,...extra,...COLLIDER_SHAPES[asset]});
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
  let solids=obstaclesOf(out,{refinedTrees:false});
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
    solids.push(...obstaclesOf([placed],{refinedTrees:false}));return true;
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
export function villageObstacles(placements=VILLAGE_PLACEMENTS,options){return obstaclesOf(placements,options);}
