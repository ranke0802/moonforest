import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PLAINS_PLACEMENTS,PLAINS_STREAM,PLAINS_ROUTES,PLAINS_RADIUS,plainsRoadDistance,plainsStreamDistance} from '../src/great-plains-layout.js';
import {sampleGroundCurve} from '../src/village-ground-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {mapPortals} from '../src/map-route.js';
import {forestEdgeWeight} from '../src/plains-forest-edge.js';

const banks=PLAINS_PLACEMENTS.filter(p=>p.id.startsWith('river-stone-')&&!p.composition);
const assets=JSON.parse(readFileSync(new URL('../public/assets/great-plains.json',import.meta.url))).assets;
const projected=p=>{
 let distance=Infinity,along=0,travel=0;
 for(let i=1;i<PLAINS_STREAM.length;i++){
  const [ax,az]=PLAINS_STREAM[i-1],[bx,bz]=PLAINS_STREAM[i],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.z-az)*dz)/(length*length))),d=Math.hypot(p.x-ax-t*dx,p.z-az-t*dz);
  if(d<distance){distance=d;along=travel+t*length;}travel+=length;
 }
 return {distance,along};
};

test('river composition preserves the channel, stable crossroads references and instance budget',()=>{
 assert.deepEqual(PLAINS_STREAM,sampleGroundCurve([[95,-97],[89,-82],[85,-67],[79,-51],[85,-33],[78,-15],[83,3],[75,22],[84,39],[77,57],[66,79],[62,106]],{step:1.4}));
 assert.equal(PLAINS_PLACEMENTS.length,1424);
 assert.equal(banks.length,110);
 for(const [id,x,z]of [['river-stone-112',-20,2],['river-stone-113',-37,19]]){
  const p=PLAINS_PLACEMENTS.find(p=>p.id===id);assert.ok(p);
  assert.deepEqual({x:p.x,z:p.z,scale:p.scale,radius:p.colliderRadius,asset:p.asset,composition:p.composition},{x,z,scale:.4,radius:.26,asset:'rock-01-mossy-boulder',composition:'crossroads-grove'});
  assert.equal(p.riverGroup,undefined);
 }
 const triangles=banks.reduce((sum,p)=>sum+assets[p.asset].lods[0].triangles,0);
 assert.ok(triangles<=110*assets['rock-01-mossy-boulder'].lods[0].triangles*1.002,'existing near-LOD triangle budget stays essentially equal');
});

test('banks have asymmetric clusters, long open gaps, two silhouettes and embedded scale hierarchy',()=>{
 assert.deepEqual(new Set(banks.map(p=>p.asset)),new Set(['rock-01-mossy-boulder','rock-02-jagged-outcrop']));
 assert.ok(banks.filter(p=>p.asset==='rock-02-jagged-outcrop').length>=30);
 assert.equal(new Set(banks.map(p=>p.riverGroup)).size,11);
 assert.ok(banks.filter(p=>p.riverRole==='anchor').length>=10);
 assert.ok(banks.filter(p=>p.riverRole==='small').length>=60);
 assert.ok(Math.max(...banks.map(p=>p.scale))/Math.min(...banks.map(p=>p.scale))>12);
 assert.ok(new Set(banks.map(p=>p.scale.toFixed(2))).size>=35);
 assert.ok(new Set(banks.map(p=>p.yaw.toFixed(2))).size>=90);
 const groups=new Map();for(const p of banks){if(!groups.has(p.riverGroup))groups.set(p.riverGroup,[]);groups.get(p.riverGroup).push(p);}
 assert.ok([...groups.values()].some(group=>group.filter(p=>p.riverBank===1).length/group.length>=.75),'some reaches favour one bank');
 assert.ok([...groups.values()].some(group=>group.filter(p=>p.riverBank===-1).length/group.length>=.75),'favour changes sides');
 const along=banks.map(p=>projected(p).along).sort((a,b)=>a-b),gaps=along.slice(1).map((value,i)=>value-along[i]);
 assert.ok(gaps.filter(gap=>gap>6).length>=4,'leave open reaches instead of two continuous stone rows');
 assert.ok(Math.max(...gaps)>9);
 for(const p of banks){const fraction=-p.yOffset/(assets[p.asset].height*p.scale);assert.ok(fraction>=.18&&fraction<=.44,p.id+' must be visibly embedded');}
});

test('normalized rock footprints keep the watercourse, road shoulders, portals and native forest open',()=>{
 const nav=new VillageNavigation(banks.map(p=>({id:p.id,x:p.x,z:p.z,radius:p.colliderRadius,height:2})));
 for(const p of banks){
  const config=assets[p.asset],physicalRadius=Math.hypot(config.bounds[0],config.bounds[2])*.5*config.height/config.bounds[1]*p.scale;
  assert.ok(p.colliderRadius>=physicalRadius,p.id+' collider must cover the normalized source footprint');
  assert.ok(projected(p).distance-physicalRadius>2.25,p.id+' enters the watercourse');
  assert.ok(plainsStreamDistance(p.x,p.z)-p.colliderRadius>2.25);
  assert.ok(plainsRoadDistance(p.x,p.z)>p.colliderRadius+.8);
  assert.ok(forestEdgeWeight(p.x,p.z)<=.15,p.id+' intrudes into the native forest passage');
 }
 for(const road of PLAINS_ROUTES)for(let i=1;i<road.samples.length;i++){
  const [x,z]=road.samples[i],[px,pz]=road.samples[i-1],length=Math.hypot(x-px,z-pz);if(length<1e-8)continue;
  for(const side of [-1,0,1]){const point={x:x-(z-pz)/length*road.width*.5*side,z:z+(x-px)/length*road.width*.5*side};if(Math.hypot(point.x,point.z)<PLAINS_RADIUS-.5)assert.ok(nav.free(point,.35,PLAINS_RADIUS),road.id+' bank rock obstructs a shoulder');}
 }
 for(const portal of mapPortals('great-plains'))assert.ok(nav.free(portal,.35,PLAINS_RADIUS));
});
