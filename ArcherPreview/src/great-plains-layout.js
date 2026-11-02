import {sampleGroundCurve} from './village-ground-layout.js';

export const PLAINS_RADIUS=106;
export const PLAINS_SPAN=248;
export const PLAINS_SPAWN=Object.freeze({x:-87,z:-8});
export const PLAINS_CLEARINGS=[{x:-5,z:25,r:7},{x:-26,z:-19,r:5},{x:16,z:72,r:7},{x:51,z:-51,r:6},{x:-55,z:37,r:8}];
export const PLAINS_ROUTES=[
 {id:'village-road',width:5.2,points:[[-105,-8],[-94,-8],[-78,-7],[-58,0],[-35,12],[-5,25]]},
 {id:'forest-road',width:5.2,points:[[-5,25],[12,13],[28,-6],[40,-29],[51,-51],[65,-72],[74,-86]]},
 {id:'royal-road',width:5.5,points:[[-5,25],[2,40],[5,58],[6,78],[4,104]]},
 {id:'lookout-loop',width:3.2,points:[[-40,10],[-42,-6],[-34,-19],[-26,-19],[-18,-12],[-15,6],[-5,25]]},
 {id:'meadow-loop',width:3,points:[[-60,0],[-64,23],[-55,37],[-34,41],[-17,36],[-5,25]]},
 {id:'caravan-spur',width:4,points:[[5,58],[15,63],[16,72],[7,79]]},
].map(r=>({...r,samples:sampleGroundCurve(r.points,{step:.75})}));
export const PLAINS_STREAM=sampleGroundCurve([[82,-91],[88,-69],[86,-45],[89,-20],[84,3],[89,28],[79,56],[64,91]],{step:2});
export function plainsRoadDistance(x,z){
 let best=Infinity;
 for(const r of PLAINS_ROUTES)for(const [px,pz]of r.samples)best=Math.min(best,Math.hypot(x-px,z-pz)-r.width*.5);
 for(const c of PLAINS_CLEARINGS)best=Math.min(best,Math.hypot(x-c.x,z-c.z)-c.r);
 return best;
}
export function plainsStreamDistance(x,z){let best=Infinity;for(const [px,pz]of PLAINS_STREAM)best=Math.min(best,Math.hypot(x-px,z-pz));return best;}
function makePlacements(){
 let seed=261102;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const out=[];
 const add=(id,asset,x,z,kind,scale=1,radius=0,yaw=0,extra={})=>out.push({id,asset,x,z,kind,scale,yaw,colliderRadius:radius,...extra});
 // Exactly the approved 301 placements. The forest edge uses the same tree,
 // clustered more densely; the actual forest remains a separate streamed map.
 for(const [asset,count,kind,min,max,radius]of [
  ['tree-01-round-oak',18,'tree',.7,1.3,.85],
  ['rock-01-mossy-boulder',64,'rock',.25,1.1,.8],
  ['grass-tuft',180,'ground-detail',.55,1.3,0],
 ]){
  let placed=0;
  for(let attempt=0;placed<count&&attempt<50000;attempt++){
   let x=(random()*2-1)*98,z=(random()*2-1)*98;
   if(kind==='tree'&&placed<8){x=42+random()*40;z=-55-random()*36;}
   const scale=min+random()*(max-min),r=radius*scale;
   if(Math.hypot(x,z)>103||plainsRoadDistance(x,z)<(kind==='ground-detail'?.6:r+2.1)||plainsStreamDistance(x,z)<4.6)continue;
   if(out.some(p=>p.kind!=='ground-detail'&&Math.hypot(x-p.x,z-p.z)<r+(p.colliderRadius||.4)+1.5))continue;
   add(`${kind}-${placed++}`,asset,x,z,kind,scale,r,random()*Math.PI*2);
  }
  if(placed!==count)throw Error('Plains placement budget failed: '+asset);
 }
 // Split rail fences border the road and caravan bay without crossing paths.
 let rails=0;const road=PLAINS_ROUTES[0].samples;
 for(let i=14;i<road.length-2&&rails<28;i+=5){
  const [x,z]=road[i],[nx,nz]=road[i+1],length=Math.hypot(nx-x,nz-z),dx=(nx-x)/length,dz=(nz-z)/length;
  for(const side of [-1,1]){
   const px=x-dz*5.8*side,pz=z+dx*5.8*side;
   if(rails>=28||[-1,0,1].some(t=>plainsRoadDistance(px+dx*t*1.6,pz+dz*t*1.6)<.8))continue;
   add(`rail-${rails++}`,'rail-fence',px,pz,'fence',.75,0,-Math.atan2(dz,dx),{colliderFootprint:[2.85,.32]});
  }
 }
 if(rails!==28)throw Error('Rail fence count mismatch');
 add('junction-waypost','waypost',-16,27,'prop',1,.35,Math.PI*.2);
 add('village-waypost','waypost',-85,-13,'prop',1,.35,Math.PI*.5);
 add('caravan','covered-wagon',24,75,'prop',1,1.8,Math.PI*.05);
 add('cargo-a','crate-barrel-cluster',27,70,'prop',.75,.75);
 add('cargo-b','crate-barrel-cluster',28,74,'prop',.65,.7);
 add('boundary-a','rock-01-mossy-boulder',53,-57,'rock',.4,.55,0,{boundaryMarker:true});
 add('boundary-b','rock-01-mossy-boulder',63,-64,'rock',.4,.55,1,{boundaryMarker:true});
 add('saint-bandage','clue-bandage',55,-58,'prop',1,0,.4,{questId:'M02'});
 add('supply-chest','chest-common',20,79,'prop',1,.6,Math.PI,{lootTier:1});
 add('meadow-chest','chest-common',-55,43,'prop',1,.6,.7,{lootTier:1});
 add('lookout-chest','chest-common',-27,-23,'prop',1,.6,Math.PI*.6,{lootTier:2});
 if(out.length!==301)throw Error('Expected 301 plains placements');
 return out;
}
export const PLAINS_PLACEMENTS=makePlacements();
export function plainsObstacles(){
 const out=PLAINS_PLACEMENTS.filter(p=>p.colliderRadius||p.colliderFootprint).map(p=>p.colliderFootprint?{id:p.id,x:p.x,z:p.z,shape:'box',halfWidth:p.colliderFootprint[0]/2,halfDepth:p.colliderFootprint[1]/2,yaw:p.yaw,radius:Math.hypot(...p.colliderFootprint)/2,height:1.1}:{id:p.id,x:p.x,z:p.z,radius:p.colliderRadius,height:p.kind==='tree'?5:p.kind==='rock'?1.3:1.5});
 // Keep the shallow river out of the walkable area. No invisible collision
 // crosses the authored route; the forest path stays on its west bank.
 for(const [i,[x,z]]of PLAINS_STREAM.entries())out.push({id:'river-'+i,x,z,radius:2,height:.1});
 return out;
}
