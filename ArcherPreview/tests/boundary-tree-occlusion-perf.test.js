import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,MeshBuilder,Vector3,FreeCamera,TransformNode} from '@babylonjs/core';
import {TreeOcclusion,prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {createVillageTransform} from '../src/village-environment.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from '../src/village-plains-outskirts.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {placementBounds} from '../src/village-demand.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {FOREST_EDGE_PLACEMENTS} from '../src/plains-forest-edge.js';
import {forestToPlains} from '../src/plains-forest-boundary.js';

const base=new URL('../public/assets/',import.meta.url),manifest=name=>JSON.parse(readFileSync(new URL(name+'.json',base),'utf8'));
const tall=new Set(['watchtower','well','market-stall','covered-wagon','wood-03-plank-gate']);
const contexts=[
 {name:'village',records:[...VILLAGE_PLACEMENTS,...VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS],config:{...manifest('village').assets,...manifest('village-plains-outskirts').assets},village:true},
 {name:'plains',records:PLAINS_PLACEMENTS,config:manifest('great-plains').assets,plains:true},
 {name:'forest',records:FOREST_PLACEMENTS,config:manifest('monster-forest').assets,forest:true},
 {name:'cave',records:CAVE_PLACEMENTS,config:manifest('witch-cave').assets,cave:true},
];
const results=[];
function oldUpdate(o,camera,player,dt,dimensions){
 o.checkIn-=dt;
 if(o.checkIn<=0){o.checkIn=.1;o.head.copyFrom(player);o.head.y+=dimensions.headHeight;o.chest.copyFrom(player);o.chest.y+=dimensions.chestHeight;
  for(const tree of o.trees)tree.target=(o.obstructs(tree,camera,o.head)||o.obstructs(tree,camera,o.chest)) ? .45 : 1;
 }
 const step=Math.min(dt,.1)*4;for(const tree of o.trees){if(tree.coverage===tree.target)continue;tree.coverage+=Math.sign(tree.target-tree.coverage)*Math.min(step,Math.abs(tree.target-tree.coverage));for(const mesh of tree.meshes)mesh.instancedBuffers.treeCoverage=tree.coverage;}
}
test('village reciprocal scenery is disabled at distance and re-enabled when actually visible',()=>{
 const engine=new NullEngine({renderWidth:1000,renderHeight:600}),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,4,-500),scene);
 const world={scene,camera,mapId:'village',touchDevice:true,terrain:{heightAt:()=>0},lighting:{shadowsActive:false},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const configs=manifest('village-plains-outskirts').assets;
 const records=VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS.map(placement=>{const config=configs[placement.asset],{root}=createVillageTransform(world,placement,config),bounds=placementBounds(world,placement,config);return {root,placement,bounds,min:bounds.min,max:bounds.max,meshes:[]};});
 let visibility;
 try{
  camera.setTarget(new Vector3(0,2,-499));visibility=new VillageVisibility(world,records,{touch:true});visibility.update(camera.globalPosition,Vector3.Zero(),.2);
  assert.equal(records.filter(r=>r.root.isEnabled()).length,0);
  camera.position.set(0,4,85);camera.setTarget(new Vector3(0,3,120));camera.getViewMatrix(true);visibility.update(camera.globalPosition,new Vector3(0,0,85),.2);
  const visible=records.filter(r=>r.root.isEnabled()).length;assert.ok(visible>0,`visible after approach: ${visible}/${records.length}`);
  camera.setTarget(new Vector3(0,3,40));camera.getViewMatrix(true);visibility.update(camera.globalPosition,new Vector3(0,0,85),.2);const turned=records.filter(r=>r.root.isEnabled()).length;assert.ok(turned<visible,`turn rejects cells: ${turned}/${visible}`);
  results.push({case:'reciprocal-village-cell-gating',records:records.length,enabledAtDistance:0,enabledInForwardFrustum:visible,enabledAfterTurn:turned});
 }finally{visibility?.dispose();scene.dispose();engine.dispose();}
});
test('plains forest-edge copies obey the unchanged 240% distance and frustum gates',()=>{
 const engine=new NullEngine({renderWidth:1000,renderHeight:600}),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(1000,4,1000),scene);
 const world={scene,camera,mapId:'great-plains',plains:true,plainsViewDistance:2.4,touchDevice:true,terrain:{heightAt:()=>0},lighting:{shadowsActive:false},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const configs=manifest('great-plains').assets,records=FOREST_EDGE_PLACEMENTS.map(placement=>{const config=configs[placement.asset],{root}=createVillageTransform(world,placement,config),bounds=placementBounds(world,placement,config);return {root,placement,bounds,min:bounds.min,max:bounds.max,meshes:[]};});let visibility;
 try{
  camera.setTarget(new Vector3(1000,3,1001));visibility=new VillageVisibility(world,records,{touch:true});visibility.update(camera.globalPosition,Vector3.Zero(),.2);assert.equal(records.filter(r=>r.root.isEnabled()).length,0);
  const near=forestToPlains({x:0,z:20}),ahead=forestToPlains({x:0,z:55}),behind=forestToPlains({x:0,z:-20});camera.position.set(near.x,4,near.z);camera.setTarget(new Vector3(ahead.x,3,ahead.z));camera.getViewMatrix(true);visibility.update(camera.globalPosition,new Vector3(near.x,0,near.z),.2);
  const visible=records.filter(r=>r.root.isEnabled()).length;assert.ok(visible>0);camera.setTarget(new Vector3(behind.x,3,behind.z));camera.getViewMatrix(true);visibility.update(camera.globalPosition,new Vector3(near.x,0,near.z),.2);const turned=records.filter(r=>r.root.isEnabled()).length;assert.ok(turned<visible,`turn rejects cells: ${turned}/${visible}`);
  results.push({case:'plains-forest-edge-cell-gating',records:records.length,viewDistance:2.4,enabledAtDistance:0,enabledInForwardFrustum:visible,enabledAfterTurn:turned});
 }finally{visibility?.dispose();scene.dispose();engine.dispose();}
});
test('touching bounds, axis-parallel, camera-inside and stationary rays preserve the original fade',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateBox('one-tree',{size:2},scene),root=new TransformNode('root',scene);mesh.parent=root;prepareTreeOcclusion([mesh]);mesh.computeWorldMatrix(true);
 const original=new TreeOcclusion([root]),optimized=new TreeOcclusion([root]),d={headHeight:1.4,chestHeight:.9};
 try{
  const poses=[[[-4,1.4,1],[4,0,1]],[[-4,1.4,1.000001],[4,0,1.000001]],[[1,2,-4],[1,0,4]],[[0,1,0],[4,0,0]],[[2,1,2],[2,0,2]],[[0,1,-4],[0,0,4]]];
  for(const [from,to]of poses)for(let frame=0;frame<6;frame++){const camera=Vector3.FromArray(from),player=Vector3.FromArray(to);oldUpdate(original,camera,player,.1,d);optimized.update(camera,player,.1,d);assert.equal(optimized.trees[0].target,original.trees[0].target);assert.equal(optimized.trees[0].coverage,original.trees[0].coverage);}
 }finally{scene.dispose();engine.dispose();}
});
for(const context of contexts)test(`tree coverage broad phase matches original on actual ${context.name} placement transforms`,()=>{
 const engine=new NullEngine(),scene=new Scene(engine),world={scene,terrain:{heightAt:()=>0}},roots=[],sources=new Map();
 try{
  const selected=context.records.length>150?Array.from({length:150},(_,i)=>context.records[Math.floor(i*(context.records.length-1)/149)]):context.records;
  for(const p of selected){const config=context.config[p.asset];assert.ok(config,`${context.name}: ${p.asset}`);
   const covered=(['building','tree','rock'].includes(config.category)||tall.has(p.asset))&&!p.background&&!(context.cave&&(p.kind==='rock'||config.category==='rock'))&&(!context.village||Math.hypot(p.x,p.z)<54);
   if(!covered)continue;
   let source=sources.get(p.asset);if(!source){const [width,height,depth]=config.bounds;source=MeshBuilder.CreateBox(p.asset,{width,height,depth},scene);source.isVisible=false;prepareTreeOcclusion([source]);sources.set(p.asset,source);}
   const {root,facing}=createVillageTransform(world,p,config),mesh=source.createInstance(p.id);mesh.parent=facing;mesh.computeWorldMatrix(true);roots.push(root);
  }
  const original=new TreeOcclusion(roots),optimized=new TreeOcclusion(roots);let oldChecks=0,newChecks=0,oldMs=0,newMs=0;
  const o=original.obstructs.bind(original),n=optimized.obstructs.bind(optimized);
  original.obstructs=(...args)=>{oldChecks++;return o(...args);};optimized.obstructs=(...args)=>{newChecks++;return n(...args);};
  const d={headHeight:1.48,chestHeight:.9};let seed=14389;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let frame=0;frame<64;frame++){
   const p=context.records[Math.floor(random()*context.records.length)],player=new Vector3(p.x,0,p.z),angle=random()*Math.PI*2,distance=2+random()*19;
   const camera=new Vector3(player.x+Math.sin(angle)*distance,1.5+random()*6,player.z+Math.cos(angle)*distance);
   const dt=frame%7===0?.025:.1;let start=performance.now();oldUpdate(original,camera,player,dt,d);oldMs+=performance.now()-start;start=performance.now();optimized.update(camera,player,dt,d);newMs+=performance.now()-start;
   for(let i=0;i<roots.length;i++){assert.equal(optimized.trees[i].target,original.trees[i].target,`${context.name} target ${frame}/${i}`);assert.equal(optimized.trees[i].coverage,original.trees[i].coverage,`${context.name} coverage ${frame}/${i}`);}
  }
  assert.ok(newChecks<=oldChecks);results.push({map:context.name,allPlacements:context.records.length,sampledPlacements:selected.length,coveredRoots:roots.length,oldObstructionQueries:oldChecks,newObstructionQueries:newChecks,reduction:oldChecks?1-newChecks/oldChecks:0,oldUpdateMs:oldMs,newUpdateMs:newMs,frameSamples:64});
 }finally{scene.dispose();engine.dispose();}
});
test.after(()=>{const dir=new URL('../reports/ui-performance-integration-2026-11-03/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('boundary-tree-occlusion.json',dir),JSON.stringify({cases:results,scope:'Deterministically sampled actual placement transforms and asset bounds with synthetic box geometry, Babylon NullEngine and original update oracle. 64 moving camera samples per map.',limitations:['CPU totals are short synthetic desktop samples, sensitive to instrumentation and scheduling; they do not measure actual GPU time, phone performance or FPS.','Synthetic boxes do not represent the visual mesh; precise real-surface and LOD tests remain in tree-occlusion.test.js.','Sampled scenery roots are included regardless of streaming state.']},null,2)+'\n');});
