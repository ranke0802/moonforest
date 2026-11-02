import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Ray,Vector3} from '@babylonjs/core';
import {buildCavePaintLight,getCavePaintLight,sampleCavePaintLight,cavePaintEmitters,caveRockPaintReceiver,clearCavePaintLightCache,inspectCavePaintLightCache,CAVE_PAINT_LIGHT_CONFIG as CONFIG,CAVE_PAINT_LIGHT_POLICY as POLICY} from '../src/cave-painted-light.js';
import {CAVE_PLACEMENTS,CAVE_BOSS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {TerrainHeightField} from '../src/terrain.js';
import {CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';

const clear=()=>false,lamp=(x=-3,z=0)=>({id:'test-lamp',asset:'cave-13-votive-lantern',x,z,scale:1,yaw:0}),flat={heightAt:()=>0};
const luma=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
const actualTerrain=createWitchCaveTerrain(),actual=buildCavePaintLight(actualTerrain);
// Retain historical first-wall fixtures as explicit source placements. Their
// lighting regression must not require current decor to stay on the floor.
const floorPlacements=CAVE_PLACEMENTS.map(p=>p.wallMount?{...p,...p.wallMount.from,elevation:undefined,yaw:0,wallMount:undefined}:p);
const historical=buildCavePaintLight(actualTerrain,{placements:floorPlacements});

test('actual lamps and collector bulbs use existing object/glow positions; workbench is not an invented emitter',()=>{
 assert.equal(actual.emitters.length,22);assert.equal(actual.stats.lanterns,20);assert.equal(actual.stats.collectors,2);assert.equal(actual.emitters.some(e=>e.asset.includes('workbench')),false);
 for(const emitter of actual.emitters){
  const p=CAVE_PLACEMENTS.find(p=>p.id===emitter.id),collector=emitter.kind==='collector',offset=collector?.774:0;
  assert.ok(Math.abs(emitter.x-(p.x+Math.cos(p.yaw)*offset*p.scale))<1e-8);assert.ok(Math.abs(emitter.z-(p.z-Math.sin(p.yaw)*offset*p.scale))<1e-8);assert.ok(Math.abs(emitter.y-((p.elevation??actualTerrain.heightAt(p.x,p.z))+(collector?2.784:.8)*p.scale))<1e-8);
 }
 assert.equal(cavePaintEmitters(actualTerrain,{includeSoulCollectors:false}).length,20);
});

test('every actual lantern retains a readable warm pool, dark spaces contrast, and arena floor has a minimum',()=>{
 for(const emitter of actual.emitters.filter(e=>e.kind==='lantern')){
  const p=CAVE_PLACEMENTS.find(p=>p.id===emitter.id),[nx,nz]=p.wallMount.normal,x=emitter.x+nx*1.8,z=emitter.z+nz*1.8;
  const sample=sampleCavePaintLight(actual,x,actualTerrain.heightAt(x,z)+.1,z);
  assert.ok(luma(sample.rgb)>.45,`${emitter.id} warm floor pool must not be suppressed by conservative wall guard`);assert.ok(sample.rgb[0]>sample.rgb[2]);
 }
 const dark=sampleCavePaintLight(actual,65,actualTerrain.heightAt(65,60)+.1,60),bright=sampleCavePaintLight(actual,-45,actualTerrain.heightAt(-45,38)+.1,38);
 assert.ok(luma(bright.rgb)>luma(dark.rgb)*3);assert.ok(luma(dark.rgb)<.22);
 const arena=sampleCavePaintLight(actual,CAVE_BOSS.x,CAVE_BOSS.height+.1,CAVE_BOSS.z);assert.ok(luma(arena.rgb)>=.28);assert.ok(arena.rawRGB.every(v=>v<=1));
});

test('default thin-wall LOS blocks distant leakage; optional full-texel guard is tested but remains disabled',()=>{
 const placement=lamp(),wall=(x,z,r)=>Math.abs(x-.4)<=r+.015,normal=buildCavePaintLight(flat,{placements:[placement],occludes:wall}),map=buildCavePaintLight(flat,{placements:[placement],occludes:wall,bilinearWallGuard:true});
 assert.equal(normal.stats.bilinearWallGuard,false);assert.equal(normal.stats.bilinearGuardPixels,0);assert.equal(normal.stats.interpolationLimitMeters,1.125);assert.ok(luma(sampleCavePaintLight(normal,3,.1,0).rgb)<.19);
 assert.ok(luma(sampleCavePaintLight(map,-3,.1,0).rgb)>.6);
 for(const x of [.41,.7,1.2,3]){const sample=sampleCavePaintLight(map,x,.1,0);assert.ok(luma(sample.rgb)<.19,`no light leaking on far side x=${x}`);}
 assert.ok(map.stats.blockedRays>0);assert.ok(map.stats.bilinearGuardPixels>0);
});

test('final .8m surface margin lights the first wall while a flat receiver two metres behind it stays blocked',()=>{
 // The +.5625m texel centre lies inside this .5m-thick wall, matching the
 // actual receiving-surface failure; a flat point behind a wall is not a wall.
 const wall=(x,z,r)=>Math.abs(x-.4)<=.25+r,options={placements:[lamp()],occludes:wall},before=buildCavePaintLight(flat,{...options,endSurfaceMargin:0}),after=buildCavePaintLight(flat,options),unblocked=buildCavePaintLight(flat,{...options,occludes:clear});
 const first=sampleCavePaintLight(after,.4,.1,0),oldFirst=sampleCavePaintLight(before,.4,.1,0);assert.ok(luma(first.rgb)>luma(oldFirst.rgb)+.1,'receive light on first .5m-thick wall, not just the lamp floor');
 for(const [x,z]of [[2.65,0],[2.8,2]]){const shadow=sampleCavePaintLight(after,x,.1,z),open=sampleCavePaintLight(unblocked,x,.1,z);assert.ok(luma(shadow.rgb)<.19,'intervening wall still blocks separate flat receiver/room');assert.ok(luma(open.rgb)>luma(shadow.rgb)+.04,'control receiver is within the lamp radius');}
 assert.equal(after.stats.endSurfaceMargin,.8);assert.ok(after.stats.endSurfaceSamples>0);assert.ok(after.stats.blockedRays>0);assert.equal(after.stats.version,CONFIG.version);assert.ok(Math.abs(after.stats.combinedSurfaceFringeLimitMeters-1.925)<1e-12);
 for(let i=3;i<after.data.length;i+=4)assert.equal(after.data[i],before.data[i],'receiving height and geometry stay unchanged');
 assert.throws(()=>buildCavePaintLight(flat,{...options,endSurfaceMargin:.81}),/Invalid cave paint end surface margin/);
});

test('actual first rock wall near lantern109 receives more warm light without changing lantern or arena policy',()=>{
 const before=buildCavePaintLight(actualTerrain,{placements:floorPlacements,endSurfaceMargin:0}),x=-4.414213562373095,z=-29.585786437626904,y=actualTerrain.heightAt(x,z)+.1;
 const old=luma(sampleCavePaintLight(before,x,y,z).rgb),current=luma(sampleCavePaintLight(historical,x,y,z).rgb);assert.ok(current>old+.1);assert.ok(current>.55);assert.equal(POLICY.lanternRadius,7.5);assert.deepEqual(POLICY.arena,[.28,.30,.34]);
});

test('existing terrain ridge blocks light even without a rock mask; separate levels do not share a floor light',()=>{
 const ridge={heightAt:(x,z)=>Math.abs(x-.4)<.4?6:0},map=buildCavePaintLight(ridge,{placements:[lamp()],occludes:clear});
 assert.ok(luma(sampleCavePaintLight(map,-3,.1,0).rgb)>.6);assert.ok(luma(sampleCavePaintLight(map,3,.1,0).rgb)<.19);assert.ok(map.stats.blockedRays>0);
 const ledge={heightAt:(x,z)=>x>0?6:0},levels=buildCavePaintLight(ledge,{placements:[lamp()],occludes:clear});assert.ok(luma(sampleCavePaintLight(levels,3,6.1,0).rgb)<.19);
});

test('lower receiving face is lit beside tall terrain while real floor alpha and separate-room occlusion stay exact',()=>{
 const shoulder={heightAt:x=>x>.1?10:0},options={placements:[lamp()],occludes:clear};
 const before=buildCavePaintLight(shoulder,options),after=buildCavePaintLight(shoulder,{...options,receiverAt:(_t,x,z,floor)=>x>.1&&x<1.7?0:floor});
 const a=sampleCavePaintLight(before,.5625,.65,0),b=sampleCavePaintLight(after,.5625,.65,0);
 assert.ok(luma(b.rgb)>luma(a.rgb)+.15,'receive near a lamp on a low face, not ten metres above it');
 for(let i=3;i<before.data.length;i+=4)assert.equal(after.data[i],before.data[i],'water depth and physical floor alpha are unchanged');
 assert.ok(luma(sampleCavePaintLight(after,3,10.1,0).rgb)<.19,'upper separate receiver does not inherit the lower wall light');
 // A small free gap after an earlier obstacle is a different space, even if
 // its destination is another low receiving surface.
 const broken={heightAt:x=>(x>-.5&&x<0)||(x>.5)?10:0};
 const separated=buildCavePaintLight(broken,{...options,receiverAt:(_t,x,z,floor)=>x>.5&&x<1.8?0:floor});
 assert.ok(luma(sampleCavePaintLight(separated,1.3,.65,0).rgb)<.21,'a ray that exits a previous wall cannot be a terminal receiver');
});

test('actual lower-wall receiver changes only adjacent non-walking shoulders and keeps the 64KiB single-height contract',()=>{
 const map=buildCavePaintLight(actualTerrain,{placements:floorPlacements,receiverAt:caveRockPaintReceiver});
 assert.ok(map.stats.receiverPixels>0);assert.ok(map.stats.receiverPixels<2000);
 // The r3 laboratory lowered the old (-41.0625,-9.5625) shoulder. Use a
 // retained tall shoulder beside the real (12,30) lantern, not the new floor.
 const x=15.1875,z=32.0625,floor=actualTerrain.heightAt(x,z),receiver=caveRockPaintReceiver(actualTerrain,x,z,floor),y=receiver+.65;
 assert.ok(floor>receiver+1.2,'fixture must remain a high non-walking shoulder');assert.ok(Math.abs(receiver-1.495027699127818)<1e-6);assert.ok(floor>8);
 assert.ok(luma(sampleCavePaintLight(map,x,y,z).rgb)>luma(sampleCavePaintLight(historical,x,y,z).rgb)+.12,'historical lantern reveals its retained adjacent lower receiving face');
 for(let i=3;i<actual.data.length;i+=4)assert.equal(map.data[i],actual.data[i]);
 assert.equal(caveRockPaintReceiver(actualTerrain,-35,-18,actualTerrain.heightAt(-35,-18)),actualTerrain.heightAt(-35,-18),'walkable laboratory floor uses its actual height');
 assert.equal(map.data.byteLength,65536);assert.equal(map.stats.additionalLights,0);assert.equal(map.stats.additionalShadowPasses,0);assert.equal(map.stats.frameUpdates,0);
});

test('the actual r3 native first wall receives warm lamp light with the existing .8m end margin',async()=>{
 const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),config=manifest.assets[CAVE_LABORATORY_GEOMETRY.assetId],placement=CAVE_PLACEMENTS.find(p=>p.asset===CAVE_LABORATORY_GEOMETRY.assetId),{gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));
 assert.equal(config.sourceSha256,CAVE_LABORATORY_GEOMETRY.sourceSha256);assert.equal(placement.yaw,0);assert.equal(config.height/config.bounds[1]*placement.scale,1);
 const emitter=historical.emitters.find(e=>e.id==='cavern-107');assert.deepEqual([emitter.x,emitter.z],[-40,-14]);
 const angle=285*Math.PI/180,origin=new Vector3(emitter.x,emitter.y,emitter.z),direction=new Vector3(Math.sin(angle),0,Math.cos(angle)),ray=new Ray(origin,direction,emitter.radius),offset=new Vector3(placement.x,placement.elevation-.025,placement.z);let first=Infinity;
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){const p=readAccessor(gltf,files,primitive.attributes.POSITION),indices=readAccessor(gltf,files,primitive.indices);for(let i=0;i<indices.length;i+=3){const tri=[0,1,2].map(k=>Vector3.FromArray(p,indices[i+k]*3).add(offset)),hit=ray.intersectsTriangle(...tri);if(hit&&hit.distance>0&&hit.distance<first)first=hit.distance;}}
 assert.ok(first<emitter.radius,'positive actual packed-native first-surface intersection');const point=origin.add(direction.scale(first));assert.ok(Math.abs(point.z+13.125)<1e-6);assert.ok(first>3.3&&first<3.5);
 const before=buildCavePaintLight(actualTerrain,{placements:floorPlacements,receiverAt:caveRockPaintReceiver,endSurfaceMargin:0}),after=buildCavePaintLight(actualTerrain,{placements:floorPlacements,receiverAt:caveRockPaintReceiver}),sample=sampleCavePaintLight(after,point.x,point.y,point.z);
 assert.ok(luma(sample.rgb)>.45);assert.ok(luma(sample.rgb)>luma(sampleCavePaintLight(before,point.x,point.y,point.z).rgb)+.2,'first native receiving wall benefits from terminal margin without widening it');assert.ok(sample.rgb[0]>sample.rgb[2]);assert.equal(after.stats.endSurfaceMargin,.8);assert.equal(after.data.byteLength,65536);
 const oldX=-41.0625,oldZ=-9.5625,oldFloor=actualTerrain.heightAt(oldX,oldZ);assert.equal(caveRockPaintReceiver(actualTerrain,oldX,oldZ,oldFloor),oldFloor,'retired shoulder fixture is now the actual lowered floor');
});

test('RGBA has fixed64KiB/1.125m texel centres and full floor range with finite bilinear edge sampling',()=>{
 const terrain={heightAt:x=>x<0?-8:24},map=buildCavePaintLight(terrain,{placements:[],occludes:clear});
 assert.deepEqual(map.rect,[-72,-72,144,144]);assert.equal(map.width,128);assert.equal(map.height,128);assert.equal(map.data.byteLength,65536);assert.equal(map.rect[2]/map.width,1.125);
 assert.equal(sampleCavePaintLight(map,-71.4375,-8,-71.4375).floorHeight,-8);assert.equal(sampleCavePaintLight(map,71.4375,24,71.4375).floorHeight,24);assert.equal(map.stats.clampedHeightPixels,0);
 for(const [x,z]of [[-1000,-1000],[1000,1000],[-72,72],[72,-72]]){const sample=sampleCavePaintLight(map,x,0,z);assert.ok(sample.rgb.every(Number.isFinite));assert.ok(Number.isFinite(sample.floorHeight));}
 const overflow=buildCavePaintLight({heightAt:()=>40},{placements:[],occludes:clear});assert.equal(overflow.stats.clampedHeightPixels,128*128);assert.equal(sampleCavePaintLight(overflow,0,40,0).floorHeight,24);
});

test('CPU RGB includes the shared vertical attenuation and samples never mutate bytes or static statistics',()=>{
 const map=buildCavePaintLight(flat,{placements:[],occludes:clear}),before=map.data.slice(),stats=JSON.stringify(map.stats),low=sampleCavePaintLight(map,-40,.1,-40),high=sampleCavePaintLight(map,-40,12,-40);
 assert.equal(low.heightFactor,1);assert.ok(Math.abs(high.heightFactor-CONFIG.heightMinimum)<1e-12);assert.ok(Math.abs(high.rgb[0]-high.rawRGB[0]*CONFIG.heightMinimum)<1e-12);
 for(let i=0;i<500;i++)sampleCavePaintLight(map,i%144-72,i%20,i%113-60);assert.deepEqual(map.data,before);assert.equal(JSON.stringify(map.stats),stats);assert.equal(map.stats.frameUpdates,0);assert.equal(map.stats.additionalLights,0);assert.equal(map.stats.additionalShadowPasses,0);
 assert.equal(CONFIG.floorMin,-8);assert.equal(CONFIG.floorMax,24);assert.equal(CONFIG.heightStart,1.25);assert.equal(CONFIG.heightEnd,8);assert.equal(POLICY.lanternRadius,7.5);
});

test('one-map detached CPU cache survives identical terrain copies and replaces on geometry/emitter changes',()=>{
 clearCavePaintLightCache();const options={placements:[lamp()],occludes:clear},a=new TerrainHeightField({size:160,subdivisions:8,height:()=>0}),b=new TerrainHeightField({size:160,subdivisions:8,height:()=>0});
 const first=getCavePaintLight(a,options),same=getCavePaintLight(b,options);assert.equal(first,same);assert.deepEqual(inspectCavePaintLightCache(),{maps:1,bytes:65536,hits:1,sceneObjects:0});
 b.heights[0]=1;const changed=getCavePaintLight(b,options);assert.notEqual(changed,first);assert.equal(inspectCavePaintLightCache().maps,1);assert.equal(inspectCavePaintLightCache().bytes,65536);
 const moved=getCavePaintLight(b,{...options,placements:[lamp(-5)]});assert.notEqual(moved,changed);assert.equal(Object.hasOwn(moved,'scene'),false);assert.equal(Object.hasOwn(moved,'texture'),false);
 assert.throws(()=>getCavePaintLight({heightAt:()=>NaN},{placements:[],occludes:clear}),/Invalid cave paint floor/);assert.equal(getCavePaintLight(b,{...options,placements:[lamp(-5)]}),moved,'failed build cannot publish a partial cache');
 // No disposed engine/RawTexture can be retained: cache payload is CPU-only.
 for(let i=0;i<12;i++){b.heights[0]=i;getCavePaintLight(b,options);assert.equal(inspectCavePaintLightCache().maps,1);assert.equal(inspectCavePaintLightCache().bytes,65536);}
 clearCavePaintLightCache();assert.equal(inspectCavePaintLightCache().maps,0);assert.equal(inspectCavePaintLightCache().bytes,0);
});

test('repeated pure builds are independent and invalid terrain fails before publishing a partial cache',()=>{
 const a=buildCavePaintLight(flat,{placements:[],occludes:clear}),b=buildCavePaintLight(flat,{placements:[],occludes:clear});assert.notEqual(a.data,b.data);assert.deepEqual(a.data,b.data);
 assert.throws(()=>buildCavePaintLight({}),/required/);assert.throws(()=>buildCavePaintLight({heightAt:()=>NaN},{placements:[]}),/Invalid cave paint floor/);
});
