import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCavePaintLight,getCavePaintLight,sampleCavePaintLight,cavePaintEmitters,clearCavePaintLightCache,inspectCavePaintLightCache,CAVE_PAINT_LIGHT_CONFIG as CONFIG,CAVE_PAINT_LIGHT_POLICY as POLICY} from '../src/cave-painted-light.js';
import {CAVE_PLACEMENTS,CAVE_BOSS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {TerrainHeightField} from '../src/terrain.js';

const clear=()=>false,lamp=(x=-3,z=0)=>({id:'test-lamp',asset:'cave-13-votive-lantern',x,z,scale:1,yaw:0}),flat={heightAt:()=>0};
const luma=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
const actualTerrain=createWitchCaveTerrain(),actual=buildCavePaintLight(actualTerrain);

test('actual lamps and collector bulbs use existing object/glow positions; workbench is not an invented emitter',()=>{
 assert.equal(actual.emitters.length,12);assert.equal(actual.stats.lanterns,10);assert.equal(actual.stats.collectors,2);assert.equal(actual.emitters.some(e=>e.asset.includes('workbench')),false);
 for(const emitter of actual.emitters){
  const p=CAVE_PLACEMENTS.find(p=>p.id===emitter.id),collector=emitter.kind==='collector',offset=collector?.774:0;
  assert.ok(Math.abs(emitter.x-(p.x+Math.cos(p.yaw)*offset*p.scale))<1e-8);assert.ok(Math.abs(emitter.z-(p.z-Math.sin(p.yaw)*offset*p.scale))<1e-8);assert.ok(Math.abs(emitter.y-((p.elevation??actualTerrain.heightAt(p.x,p.z))+(collector?2.784:.8)*p.scale))<1e-8);
 }
 assert.equal(cavePaintEmitters(actualTerrain,{includeSoulCollectors:false}).length,10);
});

test('every actual lantern retains a readable warm pool, dark spaces contrast, and arena floor has a minimum',()=>{
 for(const emitter of actual.emitters.filter(e=>e.kind==='lantern')){
  const sample=sampleCavePaintLight(actual,emitter.x,actualTerrain.heightAt(emitter.x,emitter.z)+.1,emitter.z);
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
 assert.equal(after.stats.endSurfaceMargin,.8);assert.ok(after.stats.endSurfaceSamples>0);assert.ok(after.stats.blockedRays>0);assert.equal(after.stats.version,2);assert.ok(Math.abs(after.stats.combinedSurfaceFringeLimitMeters-1.925)<1e-12);
 for(let i=3;i<after.data.length;i+=4)assert.equal(after.data[i],before.data[i],'receiving height and geometry stay unchanged');
 assert.throws(()=>buildCavePaintLight(flat,{...options,endSurfaceMargin:.81}),/Invalid cave paint end surface margin/);
});

test('actual first rock wall near lantern109 receives more warm light without changing lantern or arena policy',()=>{
 const before=buildCavePaintLight(actualTerrain,{endSurfaceMargin:0}),x=-4.414213562373095,z=-29.585786437626904,y=actualTerrain.heightAt(x,z)+.1;
 const old=luma(sampleCavePaintLight(before,x,y,z).rgb),current=luma(sampleCavePaintLight(actual,x,y,z).rgb);assert.ok(current>old+.1);assert.ok(current>.55);assert.equal(POLICY.lanternRadius,7.5);assert.deepEqual(POLICY.arena,[.28,.30,.34]);
});

test('existing terrain ridge blocks light even without a rock mask; separate levels do not share a floor light',()=>{
 const ridge={heightAt:(x,z)=>Math.abs(x-.4)<.4?6:0},map=buildCavePaintLight(ridge,{placements:[lamp()],occludes:clear});
 assert.ok(luma(sampleCavePaintLight(map,-3,.1,0).rgb)>.6);assert.ok(luma(sampleCavePaintLight(map,3,.1,0).rgb)<.19);assert.ok(map.stats.blockedRays>0);
 const ledge={heightAt:(x,z)=>x>0?6:0},levels=buildCavePaintLight(ledge,{placements:[lamp()],occludes:clear});assert.ok(luma(sampleCavePaintLight(levels,3,6.1,0).rgb)<.19);
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
