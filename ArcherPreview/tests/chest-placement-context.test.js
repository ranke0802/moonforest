import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {VILLAGE_PLACEMENTS,villageObstacles,villageRoadDistance,VILLAGE_SPAWN} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS,PLAINS_TREASURE_ANCHORS,PLAINS_ROUTES,plainsObstacles,PLAINS_SPAWN} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS,FOREST_ROUTES,forestObstacles} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS,caveObstacles} from '../src/witch-cave-layout.js';
import {FOREST_SPAWN,CAVE_SPAWN} from '../src/map-route.js';
import {TRAINING_OBSTACLES} from '../src/forest-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {obstacleClearance} from '../src/village-collision.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {ChapterJourney} from '../src/chapter-quest-state.js';

// These are actual, stable placement IDs, not newly spawned chest backdrops.
const anchors={
 'village-relief':'tree-01-round-oak-131',
 'village-treasure-orchard':'home-07','village-treasure-stable':'home-19','village-treasure-garden':'home-06','village-treasure-chapel':'home-20','village-treasure-north-wall':'home-02',
 'supply-chest':'meadow-oak-11','meadow-chest':'meadow-oak-4','lookout-chest':'lookout-oak',
 'great-plains-treasure-village-grove':'grove-gate-cart','great-plains-treasure-stream-bank':'grove-meadow-south-tree-3','great-plains-treasure-western-ridge':'grove-lookout-west-tree-0','great-plains-treasure-hill-grove':'grove-lookout-west-tree-2','great-plains-treasure-forest-fringe':'grove-forest-middle-tree-3','great-plains-treasure-forest-cache':'forest-boundary-forest-tree-02-slender-pine-105',
 'goblin-relic':'forest-forest-01-sickly-oak-62','monster-forest-treasure-trail-cache':'forest-forest-01-sickly-oak-7','monster-forest-treasure-spring-cache':'forest-tree-02-slender-pine-94','monster-forest-treasure-fallen-log':'forest-forest-01-sickly-oak-43','monster-forest-treasure-old-camp':'forest-tree-02-slender-pine-135','monster-forest-treasure-stone-circle':'forest-tree-02-slender-pine-112','monster-forest-treasure-cave-approach':'forest-tree-02-slender-pine-48',
 'witch-cave-treasure-laboratory-cache':'cavern-123',
};
const roadEdgeDistance=(routes,p)=>Math.min(...routes.flatMap(route=>route.samples.map(([x,z])=>Math.hypot(x-p.x,z-p.z)-route.width*.5)));
const definitions={
 village:{placements:VILLAGE_PLACEMENTS,obstacles:villageObstacles,terrain:createVillageTerrain,limit:48,spawn:VILLAGE_SPAWN,road:villageRoadDistance},
 'great-plains':{placements:PLAINS_PLACEMENTS,obstacles:plainsObstacles,terrain:createGreatPlainsTerrain,limit:105,spawn:PLAINS_SPAWN,training:{x:-55,z:37},road:(x,z)=>roadEdgeDistance(PLAINS_ROUTES,{x,z})},
 'monster-forest':{placements:FOREST_PLACEMENTS,obstacles:forestObstacles,terrain:createMonsterForestTerrain,limit:55,spawn:FOREST_SPAWN,road:(x,z)=>roadEdgeDistance(FOREST_ROUTES,{x,z})},
 'witch-cave':{placements:CAVE_PLACEMENTS,obstacles:caveObstacles,terrain:createWitchCaveTerrain,limit:64,spawn:CAVE_SPAWN,training:{x:-39,z:39}},
};
const chestConfig=JSON.parse(readFileSync(new URL('../public/assets/quest-props.json',import.meta.url))).assets['chest-common'];
const results=[];
function fixture(map){const d=definitions[map],training=TRAINING_OBSTACLES.map(o=>d.training?{...o,...d.training}:o),obstacles=[...d.obstacles(),...training];return {...d,obstacles,height:d.terrain(),nav:new (map==='witch-cave'?CaveNavigation:VillageNavigation)(obstacles)};}
function footprint(p){const ratio=(p.height??chestConfig.height)/chestConfig.bounds[1]*(p.scale??1),c=Math.cos(p.yaw),s=Math.sin(p.yaw),points=[];for(const x of [-.5,0,.5])for(const z of [-.5,0,.5]){const dx=x*chestConfig.bounds[0]*ratio,dz=z*chestConfig.bounds[2]*ratio;points.push({x:p.x+dx*c+dz*s,z:p.z-dx*s+dz*c});}return points;}
function wallContext(m,p){
 const ground=m.height.heightAt(p.x,p.z),walls=[];
 for(let i=0;i<32;i++){const angle=i*Math.PI/16,q={x:p.x+Math.sin(angle)*2.4,z:p.z+Math.cos(angle)*2.4},height=m.height.heightAt(q.x,q.z),rise=height-ground;if(rise>=1.2&&!m.nav.free(q,.35,m.limit))walls.push({...q,height,rise});}
 assert.ok(walls.length,p.id+' must have an actual solid rock wall within 2.4m, not just a nearby lantern or room label');
 const support=walls.sort((a,b)=>b.rise-a.rise)[0];return {anchorId:'cave-terrain-wall',kind:'wall',source:'src/witch-cave-terrain.js',gap:2.4,anchorPosition:support};
}

test('all original point identities, reward tiers, models, labels and save conditions remain unchanged',()=>{
 // d03de5b metadata snapshot excludes only the deliberately authored x/z/yaw.
 const metadata=CHAPTER_POINTS.map(({x,z,yaw,...point})=>point);
 assert.equal(createHash('sha256').update(JSON.stringify(metadata)).digest('hex'),'15436984cfea96188a3eadfdecff6a8cee245aa2a16ab003e63131be77a20b70');
 assert.deepEqual(Object.fromEntries(Object.keys(definitions).map(map=>[map,CHAPTER_POINTS.filter(p=>p.map===map&&p.tier).length])),{village:6,'great-plains':9,'monster-forest':7,'witch-cave':7});
 assert.equal(new Set(CHAPTER_POINTS.map(p=>p.id)).size,CHAPTER_POINTS.length);
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const open=(journey,p)=>journey.openChest(p,{origin:{x:p.x,y:0,z:p.z},position:{x:p.x,y:0,z:p.z}});for(const point of CHAPTER_POINTS.filter(p=>p.tier)){const journey=new ChapterJourney(storage);assert.ok(open(journey,point));assert.equal(open(journey,{...point,x:point.x+1,yaw:point.yaw+.2}),null,'position must never become part of the reward token');assert.equal(open(new ChapterJourney(storage),point),null,'opened chest survives reload');}
});

for(const map of Object.keys(definitions))test(`${map} chests belong to existing scenery or solid cavern walls with a clear reachable front`,()=>{
 const m=fixture(map),chests=CHAPTER_POINTS.filter(point=>point.map===map&&point.tier),rows=[];
 for(const point of chests){
  assert.ok([point.x,point.z,point.yaw].every(Number.isFinite));assert.ok(m.nav.free(point,.8,m.limit),point.id+' intersects scenery or a cliff');assert.deepEqual(m.nav.findFree(point,.65,m.limit),{x:point.x,z:point.z},point.id+' would be silently relocated away from its anchor at runtime');
  const body=footprint(point);for(const q of body)assert.ok(m.nav.free(q,.04,m.limit),point.id+' body intersects an existing obstacle');
  const elevations=body.map(q=>m.height.heightAt(q.x,q.z)),slope=Math.max(...elevations)-Math.min(...elevations);assert.ok(slope<.25,point.id+' floats across a steep or broken shelf');
  let context;
  if(anchors[point.id]){
   const support=m.placements.find(p=>p.id===anchors[point.id]);assert.ok(support,point.id+' lost its existing scenery anchor');
   const kind=support.kind==='tree'?'tree':support.kind==='building'?'house':['handcart','covered-wagon'].includes(support.asset)?'cart':support.kind==='wall'?'wall':null;assert.ok(kind,point.id+' uses a prohibited isolated rock/prop backdrop');
   const distance=Math.hypot(point.x-support.x,point.z-support.z),solids=m.obstacles.filter(o=>o.id===support.id||o.id.startsWith(support.id+'-')),gap=solids.length?Math.min(...solids.map(o=>obstacleClearance(point,o))):distance;
   if(kind==='tree')assert.ok(distance<=2.9&&gap>=.8,point.id+' is outside its tree context or in the trunk');else assert.ok(gap>=.8&&gap<=1.6,point.id+' is detached from or inside its house/cart/wall');
   context={anchorId:support.id,kind,asset:support.asset,gap,distance,anchorPosition:{x:support.x,z:support.z}};
  }else{assert.equal(map,'witch-cave');context=wallContext(m,point);}
  if(m.road)assert.ok(m.road(point.x,point.z)>=(map==='village'?1.8:.8),point.id+' sits on the walking road');
  const front={x:point.x+Math.sin(point.yaw)*1.6,z:point.z+Math.cos(point.yaw)*1.6};assert.ok(m.nav.free(front,.35,m.limit),point.id+' front cannot be occupied by the player');assert.ok(m.nav.segmentClear(front,point,.05),point.id+' cannot be interacted with from its clear front');assert.ok(Math.abs(m.height.heightAt(front.x,front.z)-m.height.heightAt(point.x,point.z))<.5,point.id+' front is on a different shelf');
  const route=m.nav.path(m.spawn,front,.35,m.limit);assert.ok(route.length,point.id+' approach is disconnected from the map entrance');const end=route.at(-1);assert.ok(Math.hypot(end.x-front.x,end.z-front.z)<.01,point.id+' route misses the clear front');
  for(const other of chests)if(other!==point)assert.ok(Math.hypot(point.x-other.x,point.z-other.z)>3.5,point.id+' piles multiple caches around one spot');
  rows.push({id:point.id,map,tier:point.tier,x:point.x,y:m.height.heightAt(point.x,point.z),z:point.z,yaw:point.yaw,context,footprintHeightRange:slope,approach:{...front,distance:1.6,playerRadius:.35,lineOfSight:true,reachableFrom:m.spawn,routeWaypoints:route.length},runtimeFindFreeUnchanged:true,bodyClear:true});
 }
 if(map==='great-plains')for(const anchor of PLAINS_TREASURE_ANCHORS){const point=chests.find(p=>p.id===anchor.id);assert.deepEqual([point.x,point.z,point.yaw],[anchor.x,anchor.z,anchor.yaw]);}
 results.push(...rows);
});

test.after(()=>{
 const folder=new URL('../reports/chest-context-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('placement-validation.json',folder),JSON.stringify({passed:results.length===29,chests:results.length,counts:Object.fromEntries(Object.keys(definitions).map(map=>[map,results.filter(p=>p.map===map).length])),points:results,limitations:['Deterministic layout, actual terrain/collision/navigation and interaction-line checks. No browser automation, GPU rendering, visual-quality or phone-FPS claim.','Natural cave wall context is certified by an actual impassable terrain sample at least 1.2m higher within 2.4m; the lab cache uses the existing handcart.','Only chest coordinates and yaw changed. Original point identity/reward/model/condition metadata is checked against a d03de5b SHA-256 snapshot.'],browserAutomation:false,newAssets:false},null,2)+'\n');
});
