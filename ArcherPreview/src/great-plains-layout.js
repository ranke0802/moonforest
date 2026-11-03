import {sampleGroundCurve} from './village-ground-layout.js';
import {isSoftVegetation} from './scenery-collision-policy.js';
import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {villageHeight} from './village-terrain.js';
import {VILLAGE_PLAINS_BOUNDARY as boundary,villageToPlains,boundaryExteriorPlacement,isVillageBoundaryTree} from './village-plains-boundary.js';
import {FOREST_EDGE_ROAD,FOREST_EDGE_CLEARINGS,joinForestEdge} from './plains-forest-edge.js';
import {forestToPlains} from './plains-forest-boundary.js';

// Authored against plains-exterior.png; all landmarks have deliberate locations.
export const PLAINS_RADIUS=106;
export const PLAINS_SPAN=288;
export const PLAINS_SPAWN=Object.freeze({x:-87,z:-32});
export const PLAINS_LOOKOUT=Object.freeze({x:-28,z:-20,height:8,capRadius:9,cliffWidth:3,stretchX:1.1,rampStartX:-61,rampTopX:-37,rampHalfWidth:3,rampShoulder:6});
export const PLAINS_CLEARINGS=[{x:-5,z:25,r:7,y:.3},{x:-26,z:-19,r:6,y:8.1},{x:16,z:72,r:8,y:.25},{x:51,z:-51,r:7,y:.35},{x:-55,z:37,r:9,y:.4},...FOREST_EDGE_CLEARINGS];
const villageGatewaySamples=boundary.villageSamples.map(([x,z])=>{const p=villageToPlains({x,z});return [p.x,p.z];}),villageRoadExtension=[villageGatewaySamples.at(-1),[-79,-30],[-61,-20],[-41,-8],[-23,6],[-5,25]];
const forestApproach=[[-5,25],[10,13],[28,-4],[43,-22],[55,-41],...[[7,78],[11,70],[0,58]].map(([x,z])=>{const p=forestToPlains({x,z});return [p.x,p.z];}),FOREST_EDGE_ROAD[0]];
export const PLAINS_ROUTES=[
 {id:'village-road',width:boundary.roadWidth,gateway:true,points:[...boundary.villageRoad.filter(p=>p[1]>=40).map(([x,z])=>{const p=villageToPlains({x,z});return [p.x,p.z];}),...villageRoadExtension.slice(1)],samples:[...villageGatewaySamples,...sampleGroundCurve(villageRoadExtension,{step:.8}).slice(1)]},
 {id:'forest-road',width:4.8,gateway:true,points:[...forestApproach,...FOREST_EDGE_ROAD.slice(1)],samples:[...sampleGroundCurve(forestApproach,{step:.65}).slice(0,-1),...FOREST_EDGE_ROAD]},
 {id:'royal-road',width:5.1,points:[[-5,25],[1,40],[2,57],[1,77],[-3,107]]},
 {id:'lookout-loop',width:2.8,points:[[-61,-20],[-57,-37],[-41,-43],[-24,-42],[-9,-34],[2,-20],[-1,-7],[-5,25]]},
 {id:'lookout-top',width:2.8,points:[[-61,-20],[-52,-20],[-43,-20],[-35,-20],[-26,-19]]},
 {id:'meadow-loop',width:2.8,points:[[-61,-20],[-64,-2],[-64,18],[-55,37],[-35,42],[-18,35],[-5,25]]},
 {id:'caravan-spur',width:3.5,points:[[2,57],[13,62],[16,72],[8,82],[1,84]]},
 {id:'forest-rest',width:2.5,points:[[49,-32],[48,-44],[51,-51],[59,-50]]},
].map(r=>({...r,samples:r.samples??sampleGroundCurve(r.points,{step:.8})}));
export const PLAINS_STREAM=sampleGroundCurve([[95,-97],[89,-82],[85,-67],[79,-51],[85,-33],[78,-15],[83,3],[75,22],[84,39],[77,57],[66,79],[62,106]],{step:1.4});
// The common quest-prop system owns chest rendering and opening. Keep these
// stable anchors out of scenery instances to avoid drawing each chest twice.
export const PLAINS_TREASURE_ANCHORS=[
 {id:'supply-chest',asset:'chest-common',x:18,z:81,kind:'prop',scale:1,colliderRadius:.6,yaw:Math.PI,lootTier:1},
 {id:'meadow-chest',asset:'chest-common',x:-61.5,z:58.5,kind:'prop',scale:1,colliderRadius:.6,yaw:.7,lootTier:1},
 {id:'lookout-chest',asset:'chest-common',x:-30.2,z:-23.7,kind:'prop',scale:1,colliderRadius:.6,yaw:Math.PI*.6,lootTier:2},
];
export function plainsRoadDistance(x,z){let best=Infinity;for(const r of PLAINS_ROUTES)for(const [px,pz]of r.samples)best=Math.min(best,Math.hypot(x-px,z-pz)-r.width*.5);for(const c of PLAINS_CLEARINGS)best=Math.min(best,Math.hypot(x-c.x,z-c.z)-c.r);return best;}
export function plainsStreamDistance(x,z){let best=Infinity;for(const [px,pz]of PLAINS_STREAM)best=Math.min(best,Math.hypot(x-px,z-pz));return best;}
const seedRandom=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
// Small, authored islands leave the meadow and the landmark sightlines open.
// These offsets only vary within each grove; they never scatter over the map.
const GROVE_OFFSETS=[
 [[0,0],[-5,2],[4,4],[1,-5],[-6,-4],[7,-2],[-3,7],[6,9]],
 [[0,0],[-4,-3],[4,-5],[6,1],[2,6],[-5,6],[-8,1],[8,-6]],
 [[0,0],[-6,1],[2,5],[5,-3],[-3,-6],[7,3],[-6,7],[3,-9]],
];
const GROVE_TREES={
 village:['tree-01-round-oak','tree-01-round-oak','tree-01-round-oak','tree-02-slender-pine'],
 meadow:['tree-01-round-oak','tree-01-round-oak','tree-02-slender-pine','tree-01-round-oak'],
 fringe:['tree-01-round-oak','tree-02-slender-pine','forest-01-sickly-oak','tree-01-round-oak'],
 forest:['tree-02-slender-pine','forest-01-sickly-oak','tree-02-slender-pine','forest-02-dead-tree'],
};
function addGroveScenery(out,add){
 const groves=[
  ['gate-north','village',-80,-50,.2,4],['gate-south','village',-86,-14,-.5,5],
  ['village-field','village',-77,16,.8,4],['meadow-west','meadow',-84,43,-.8,4],
  ['lookout-west','meadow',-54,-32,.4,4],['lookout-north','meadow',-29,-50,-.3,5],
  ['meadow-south','meadow',-48,59,.7,5],['meadow-east','meadow',12,40,-.5,5],
  ['caravan-east','meadow',42,65,.3,4],
  ['forest-outer','fringe',22,-22,.8,4],['forest-middle','fringe',32,-48,-.4,5],
  ['forest-west','forest',17,-66,.4,6],['forest-rest-back','forest',45,-68,-.6,6],
  ['forest-bank','forest',69,-35,.2,5],['forest-gate','forest',28,-78,.8,5],
 ];
 const room=(x,z,r,kind)=>{
  if(Math.hypot(x,z)>104||plainsRoadDistance(x,z)<r+1.3||plainsStreamDistance(x,z)<r+4.2)return false;
  // Keep the summit, village-facing ramp and junction readable from the road.
  if(Math.hypot((x+28)/1.1,z+20)<15||Math.hypot(x+5,z-25)<14)return false;
  return ![...out,...PLAINS_TREASURE_ANCHORS].some(p=>{
   if(p.background||p.kind==='ground-detail')return false;
   const other=p.colliderFootprint?Math.hypot(...p.colliderFootprint)/2:p.colliderRadius;
   const spacing=kind==='tree'&&p.kind==='tree'?4.7:Math.max(.7,r)+other+.6;
   return Math.hypot(x-p.x,z-p.z)<spacing;
  });
 };
 for(const [index,[grove,zone,cx,cz,angle,count]]of groves.entries()){
  const cs=Math.cos(angle),sn=Math.sin(angle),position=([dx,dz])=>[cx+dx*cs-dz*sn,cz+dx*sn+dz*cs];
  // The hill cache belongs to authored offset 2. Its tree identity must not
  // shift when the village-facing loop excludes an earlier candidate offset.
  const cacheTree=grove==='lookout-west'?2:null,available=Array.from({length:count},(_,i)=>i).filter(i=>i!==cacheTree);
  let placed=0;
  for(const [slot,offset]of GROVE_OFFSETS[index%GROVE_OFFSETS.length].entries()){
   if(placed>=count)break;
   const treeNumber=cacheTree===null?placed:slot===2?cacheTree:available[0];if(treeNumber===undefined)continue;
   const [x,z]=position(offset),asset=GROVE_TREES[zone][treeNumber%4];
   const scale=(asset.startsWith('forest-')?1.12:.72)+((index+slot*3)%5)*.055;
   if(!room(x,z,2.1*scale,'tree'))continue;
   add(`grove-${grove}-tree-${treeNumber}`,asset,x,z,'tree',scale,.7*scale,angle+slot*1.37,{grove,zone});placed++;if(cacheTree!==null&&treeNumber!==cacheTree)available.shift();
  }
  for(const [slot,offset]of [[-3,-3],[5,1],[-1,5]].entries()){
   const [x,z]=position(offset),scale=.7+((index+slot)%3)*.12;
   if(room(x,z,.65,'shrub'))add(`grove-${grove}-bush-${slot}`,'bush',x,z,'shrub',scale,.45*scale,angle+slot,{grove,zone});
  }
  for(const [slot,offset]of [[-8,1],[4,-7]].entries()){
   const [x,z]=position(offset),scale=.48+((index+slot)%4)*.11;
   if(room(x,z,.8*scale,'rock'))add(`grove-${grove}-stone-${slot}`,'rock-01-mossy-boulder',x,z,'rock',scale,.8*scale,angle+slot,{grove,zone});
  }
 }
 // Props belong to a place: roadside wood supply, a caravan stop and forest decay.
 for(const [id,asset,x,z,scale,radius,yaw]of [
  ['gate-cart','handcart',-80,-22,1,1.6,-.7],['gate-wood','firewood',-77,-20,.85,1.05,.3],
  ['caravan-wood','firewood',25,81,.8,1,.5],
  ['forest-log-west','forest-03-fallen-log',22,-61,.85,2.1,.6],
  ['forest-log-bank','forest-03-fallen-log',70,-47,.85,2.1,-.5],
  ['forest-log-gate','forest-03-fallen-log',55,-76,.75,1.9,.3],
 ])if(room(x,z,radius,'prop'))add('grove-'+id,asset,x,z,'prop',scale,radius,yaw,{grove:id,zone:id.startsWith('forest')?'forest':'village'});
 // The existing boundary keeps its positions and count. Species change towards
 // the forest, so the canopy transition costs no additional boundary instances.
 for(const p of out){
  if(!p.id.startsWith('forest-north-')&&!(p.id.startsWith('forest-east-')&&p.z<-18))continue;
  const index=Number(p.id.split('-').at(-1)),deep=p.z<-76||p.x>105;
  const asset=(deep?['tree-02-slender-pine','forest-01-sickly-oak','tree-02-slender-pine','forest-02-dead-tree','tree-01-round-oak']:GROVE_TREES.fringe)[index%(deep?5:4)];
  if(asset==='tree-01-round-oak')continue;
  p.asset=asset;p.scale*=asset==='tree-02-slender-pine'?.75:1.2;
 }
 // Break up the regular boundary rows without increasing the instance count.
 // Keep the road, stream and neighbouring trunks clear after each move.
 for(const p of out.filter(p=>p.id.startsWith('forest-north-')||p.id.startsWith('forest-east-'))){
  const index=Number(p.id.split('-').at(-1)),x=p.x+Math.sin(index*2.41)*2.4,z=p.z+Math.cos(index*1.79)*2.4;
  if(plainsRoadDistance(x,z)<=p.colliderRadius+1||plainsStreamDistance(x,z)<=p.colliderRadius+4.2)continue;
  if([...out,...PLAINS_TREASURE_ANCHORS].some(other=>other!==p&&!other.background&&other.kind!=='ground-detail'&&Math.hypot(x-other.x,z-other.z)<p.colliderRadius+(other.colliderRadius??0)+1.2))continue;
  p.x=x;p.z=z;
 }
 // Reuse the two old arrival trees, then instance the exact village tree edge.
 // Outer trees are never baked into the exterior batch or given new sources.
 const frame=out.filter(p=>p.id.startsWith('forest-east-')&&Math.hypot(p.x,p.z)>125).slice(0,2);
 for(const [i,source]of VILLAGE_PLACEMENTS.filter(isVillageBoundaryTree).entries()){
  const position=villageToPlains(source),physicalScale=source.scale*(source.asset==='tree-01-round-oak'?.55:.8),radius=(source.colliderRadius??.4)*physicalScale,interactive=Math.hypot(position.x,position.z)<PLAINS_RADIUS+radius;
  const p={...position,asset:source.asset,scale:source.scale,yaw:source.yaw+boundary.yaw,kind:'tree',colliderRadius:interactive?radius:0,colliderOffset:(source.colliderOffset??[0,0]).map(v=>v*physicalScale),elevation:villageHeight(source.x,source.z),background:!interactive,composition:'village-arrival',villageBoundary:true,sourcePlacement:source.id};
  if(frame[i])Object.assign(frame[i],p);
  else add('village-boundary-'+source.id,p.asset,p.x,p.z,p.kind,p.scale,0,p.yaw,p);
 }
 // Shape the broad open space between the hill and crossroads as two loose,
 // asymmetric groups, reusing trees from beyond the playable forest boundary.
 // The sightline to the summit and the road shoulders remain open.
 const trees=[
  ['forest-east-99',-17,-4,'tree-01-round-oak',1.05],
  ['forest-east-100',-11,2,'tree-02-slender-pine',.83],
  ['forest-north-8',-23,-4,'tree-01-round-oak',.72],
  ['forest-north-9',-35,16,'tree-01-round-oak',.92],
  ['forest-north-10',-29,20,'tree-02-slender-pine',.72],
 ];
 for(const [id,x,z,asset,scale]of trees){
  const p=out.find(p=>p.id===id);if(!p)throw new Error('Missing plains composition tree '+id);
  Object.assign(p,{x,z,asset,scale,colliderRadius:.8,composition:'crossroads-grove'});
 }
 for(const [id,x,z]of [['grove-caravan-east-bush-0',-14,0],['grove-caravan-east-bush-1',-32,18]]){
  const p=out.find(p=>p.id===id);if(!p)throw new Error('Missing plains composition shrub '+id);
  Object.assign(p,{x,z,grove:'crossroads-approach',zone:'meadow',composition:'crossroads-grove'});
 }
 for(const [i,[x,z]]of [[-20,2],[-37,19]].entries()){
  const p=out.filter(p=>p.id.startsWith('river-stone-'))[i];if(!p)throw new Error('Missing plains composition river stone');
  Object.assign(p,{x,z,scale:.4,colliderRadius:.26,composition:'crossroads-grove'});
 }
}
function addGroundScenery(out,add){
 const random=seedRandom(26110317),rocks=[],patches=[];
 const sites=[[-78,-48],[-76,2],[-84,29],[-66,63],[-45,73],[-42,-58],[-8,-64],[12,-43],[31,-16],[26,39],[42,65],[45,86],[-20,62],[-34,7],[19,-66],[61,-26]];
 const offsets=[[0,0],[5,2],[-4,4],[3,-5],[-6,-3],[8,7],[-9,6],[1,10]];
 const solid=p=>!p.background&&!isSoftVegetation(p)&&(p.colliderRadius||p.colliderFootprint);
 for(const [slot,[dx,dz]]of offsets.entries())for(const [group,[cx,cz]]of sites.entries()){
  if(rocks.length>=32)break;
  // The actual existing round boulder is a flat-based dome; spires provide a
  // contrasting silhouette. No rotated/floating stand-in or new model is used.
  const dome=(group+slot)%4!==3,scale=dome?.58+((group*3+slot)%6)*.17:.34+((group+slot)%5)*.11;
  const x=cx+dx,z=cz+dz,radius=(dome?1.72:2.25)*scale;
  if(Math.hypot(x,z)>101||plainsRoadDistance(x,z)<radius+1||plainsStreamDistance(x,z)<radius+4.1||Math.hypot((x+28)/1.1,z+20)<16)continue;
  if([...out,...PLAINS_TREASURE_ANCHORS].some(p=>solid(p)&&Math.hypot(p.x-x,p.z-z)<radius+(p.colliderRadius??Math.hypot(...p.colliderFootprint)/2)+.75))continue;
  const id='landscape-rock-'+rocks.length;add(id,dome?'rock-01-mossy-boulder':'rock-02-jagged-outcrop',x,z,'rock',scale,radius,random()*Math.PI*2,{yOffset:-.10-radius*.075,landscape:'ground-rock',rockGroup:group});rocks.push(out.at(-1));
 }
 const grass=out.filter(p=>p.asset==='grass-tuft'),existing=460,extra=180,target=existing+extra;
 const anchors=[...rocks,...out.filter(p=>!rocks.includes(p)&&['tree','rock'].includes(p.kind)&&!p.background&&p.scale>.35&&Math.hypot(p.x,p.z)<102)
  .sort((a,b)=>Math.sin(a.x*1.71+a.z*.63)-Math.sin(b.x*1.71+b.z*.63))];
 const solids=out.filter(solid);
 for(const [index,anchor]of anchors.entries()){
  if(patches.length>=target)break;
  const count=anchor.landscape==='ground-rock'?7:4+index%3,start=random()*Math.PI*2;
  for(let slot=0;slot<count&&patches.length<target;slot++){
   const angle=start+slot*2.399963+random()*.35,distance=(anchor.colliderRadius??.7)+.30+random()*1.05;
   const x=anchor.x+Math.cos(angle)*distance,z=anchor.z+Math.sin(angle)*distance;
   if(Math.hypot(x,z)>104||plainsRoadDistance(x,z)<.45||plainsStreamDistance(x,z)<3.4)continue;
   if(solids.some(p=>Math.hypot(p.x-x,p.z-z)<(p.colliderRadius??0)+.08))continue;
   if(patches.some(p=>Math.hypot(p.x-x,p.z-z)<.42))continue;
   const data={x,z,scale:.38+random()*.7,yaw:random()*Math.PI*2,landscape:'ground-grass',nearScenery:anchor.id};
   if(patches.length<existing)Object.assign(grass[patches.length],data);
   else add('grass-cluster-'+(patches.length-existing),'grass-tuft',x,z,'ground-detail',data.scale,0,data.yaw,{landscape:data.landscape,nearScenery:anchor.id});
   patches.push(data);
  }
 }
}
function makePlacements(){
 const random=seedRandom(26110202),out=[];
 const add=(id,asset,x,z,kind,scale=1,radius=0,yaw=0,extra={})=>out.push({id,asset,x,z,kind,scale,yaw,colliderRadius:radius,...extra});
 const safe=(x,z,r=1)=>plainsRoadDistance(x,z)>r+.7&&plainsStreamDistance(x,z)>3.6+r;
 const exterior=boundaryExteriorPlacement();add('village-exterior','village-approach',exterior.x,exterior.z,'landmark',1,0,exterior.yaw,{elevation:exterior.elevation,background:true});
 add('junction-waypost','waypost',-1,18,'prop',1,.35,Math.PI*.2);
 add('village-waypost','waypost',-85,-36,'prop',1,.35,Math.PI*.5);
 add('caravan','covered-wagon',19,73,'prop',1,1.8,Math.PI*.12);
 add('cargo-a','crate-barrel-cluster',26,70,'prop',.65,.7);
 add('cargo-b','crate-barrel-cluster',24,77,'prop',.55,.6);
 for(const [id,x,z]of [['boundary-a',57,-57],['boundary-b',68,-64]])add(id,'rock-01-mossy-boulder',x,z,'rock',.55,.6,0,{boundaryMarker:true});
 add('saint-bandage','clue-bandage',57,-58,'prop',1,0,.4,{questId:'M02'});
 // The climb opens towards the village; tall buttresses now frame its east.
 for(const [i,[x,z,scale,yaw]]of [[-23,-20,1.4,.3],[-22,-26,1.35,1],[-26,-29,1.3,1.7],[-31,-30,1.2,2.4],[-36,-29,1,2.8],[-20,-22,.85,.6],[-24,-31,.65,1.9]].entries())add('lookout-rock-'+i,'rock-02-jagged-outcrop',x,z,'rock',scale*1.45,1.65*scale,yaw,{elevation:0});
 add('lookout-oak','tree-01-round-oak',-32,-23,'tree',.8,.72,.2);
 // Dense canopy layers stop at the authored forest corridor.
 let forest=0;
 for(let row=0;row<5;row++)for(let col=0;col<13;col++){
  const x=38+col*6.8+(row%2)*2.5+(random()-.5)*4,z=-77-row*6.8+(random()-.5)*4;
  if(safe(x,z,.95))add('forest-north-'+forest++,'tree-01-round-oak',x,z,'tree',1.35+random()*.5,.9,random()*6.28);
 }
 for(let row=0;row<4;row++)for(let col=0;col<14;col++){
  const x=94+row*7+(random()-.5)*4,z=-64+col*7+(row%2)*3+(random()-.5)*4;
  if(safe(x,z,1))add('forest-east-'+forest++,'tree-01-round-oak',x,z,'tree',1.3+random()*.55,.9,random()*6.28);
 }
 for(const [i,[x,z,s]]of [[-70,-45,.72],[-57,-2,.7],[-83,23,.72],[-78,40,.95],[-63,57,.8],[-45,65,.62],[27,49,.75],[39,12,.65],[25,-43,.76],[-4,-68,.82],[-46,-62,.8],[20,83,.75],[-34,83,.85],[47,-54,.7],[37,-56,.75]].entries())if(safe(x,z,.8))add('meadow-oak-'+i,'tree-01-round-oak',x,z,'tree',s,.8,random()*6.28);
 let cliff=0;
 for(const [cx,cz,sx,sz,n]of [[-51,-96,51,10,15],[15,-112,28,10,9],[-89,82,20,20,12],[49,109,28,12,13],[109,60,13,34,12]])for(let i=0;i<n;i++){
  const x=cx+(random()-.5)*sx,z=cz+(random()-.5)*sz,scale=1.3+random()*1.6;
  if(safe(x,z,2.5))add('rim-cliff-'+cliff++,'rock-02-jagged-outcrop',x,z,'rock',scale,2.1*scale,random()*6.28,{yOffset:-.7});
 }
 let stone=0;
 for(const [cx,cz,n]of [[-73,58,15],[-45,70,14],[-53,-43,13],[8,-45,14],[35,40,15],[53,81,17],[-12,61,8],[-11,-64,13],[37,-15,10]])for(let i=0;i<n;i++){
  const a=random()*6.28,d=Math.sqrt(random())*7,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d,s=.17+random()*.58;
  if(safe(x,z,s))add('outcrop-stone-'+stone++,'rock-01-mossy-boulder',x,z,'rock',s,.72*s,random()*6.28);
 }
 for(let i=2;i<PLAINS_STREAM.length-2;i+=2){const [x,z]=PLAINS_STREAM[i],[nx,nz]=PLAINS_STREAM[i+1],d=Math.hypot(nx-x,nz-z);for(const sign of [-1,1]){
  const side=3.1+random()*1.9,px=x-(nz-z)/d*side*sign,pz=z+(nx-x)/d*side*sign,s=.18+random()*.45;
  if(plainsRoadDistance(px,pz)>.8+s)add('river-stone-'+stone++,'rock-01-mossy-boulder',px,pz,'rock',s,.65*s,random()*6.28);
 }}
 const fences=[[-66,40,-1.3],[-63,45,-1.1],[-58,49,-.5],[-51,50,0],[-44,48,.4],[-39,45,.6],[-71,25,-1.5],[-71,31,-1.4],[-65,12,-1.2],[-55,5,-.5],[-49,9,-.5],[-31,7,-.55],[-25,11,-.6],[-19,16,-.65],[12,84,.2],[18,86,0],[24,84,.45],[29,80,.8],[31,74,1.4],[30,68,-1.3],[26,63,-.6],[46,-49,1.4],[45,-55,1],[50,-59,.2],[55,-58,-.2],[-83,-36,-.3],[-77,-35,-.3],[-71,-32,-.4]];
 for(const [i,[x,z,yaw]]of fences.entries())if(plainsRoadDistance(x,z)>1.2)add('rail-'+i,'rail-fence',x,z,'fence',.85,0,yaw,{colliderFootprint:[3.23,.35]});
 let grass=0;
 for(let i=0;i<1400&&grass<580;i++){
  const x=(random()*2-1)*103,z=(random()*2-1)*104;
  if(Math.hypot(x,z)>112||!safe(x,z,.05))continue;
  if(plainsRoadDistance(x,z)>=6&&random()<.3)continue;
  add('grass-'+grass++,'grass-tuft',x,z,'ground-detail',.55+random()*.65,0,random()*6.28);
 }
 addGroveScenery(out,add);
 addGroundScenery(out,add);
 return out;
}
export const PLAINS_PLACEMENTS=joinForestEdge(makePlacements());
export function plainsObstacles(){
 const out=PLAINS_PLACEMENTS.filter(p=>!isSoftVegetation(p)&&(p.colliderRadius||p.colliderFootprint)).map(p=>{
  // Boundary offsets are physical metres after the original source's refined
  // trunk normalization. Rotate them with the same rigid scene transform.
  const [dx,dz]=p.villageBoundary?p.colliderOffset??[0,0]:[0,0],c=Math.cos(p.yaw),s=Math.sin(p.yaw),x=p.x+c*dx+s*dz,z=p.z-s*dx+c*dz;
  return p.colliderFootprint?{id:p.id,x,z,shape:'box',halfWidth:p.colliderFootprint[0]/2,halfDepth:p.colliderFootprint[1]/2,yaw:p.yaw,radius:Math.hypot(...p.colliderFootprint)/2,height:1.1}:{id:p.id,x,z,radius:p.colliderRadius,height:p.kind==='tree'?8:p.kind==='rock'?2:1.5};
 });
 for(const [i,[x,z]]of PLAINS_STREAM.entries())out.push({id:'river-'+i,x,z,radius:2,height:.1});
 return out;
}
