import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {NullEngine,Vector3} from '@babylonjs/core';

globalThis.matchMedia??=()=>({matches:true});
{const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};}

const {arrivalSceneryPlan,planResources,ARRIVAL_PLAN_SLICE}=await import('../src/v03/next-map-plan.js');
const {createNextMapPrefetch,nextMapResources,stageBudget,quietBudget,QUIET_TRAVEL_MS,QUIET_EXPECTED_SHARE,STAGE_BYTES_TOUCH,STAGE_BYTES_DESKTOP,PREFETCH_NEAR,PREFETCH_APPROACH,PREFETCH_CHECK_SECONDS,PREFETCH_RETRY_MS,STAGE_LINGER_MS,STAGE_IDLE_MS,STAGE_DROP_PER_CHECK}=await import('../src/v03/next-map-prefetch.js');
const {VILLAGE_LOD_COVERAGE}=await import('../src/village-lod.js');
const {HELD_FRAME_FADE_MS}=await import('../src/v03/held-frame.js');
const {parseHTML}=await import('linkedom');
const {MAP_PORTALS,mapPortals,mapForCharacter}=await import('../src/map-route.js');

const finish=work=>{let step=work.next(),yields=0;while(!step.done){yields++;step=work.next();}return {plan:step.value,yields};};
const level=(n,name)=>({level:n,resources:[`./content/${name}-${n}.gltf`]});
const config={height:4,bounds:[2,4,2]};
const asset=(name,levels=[0,1,2],extra={})=>({config:{...config,...extra},levels:levels.map(n=>level(n,name))});
const place=(assetId,x,z,extra={})=>({id:assetId+x+z,asset:assetId,kind:'prop',x,z,yaw:0,scale:1,...extra});
// A view in which a 2.7 m radius prop crosses the mid threshold a few metres out.
const view={minZ:1,screenArea:1,reach:0,scale:1};

test('arrival plan keeps the demand rules: range, LOD level by distance, next finer level near its threshold',()=>{
  const assets=new Map([['near',asset('near')],['far',asset('far')],['out',asset('out')]]);
  const mid=VILLAGE_LOD_COVERAGE.mid,far=VILLAGE_LOD_COVERAGE.far;
  assert.ok(Number.isFinite(far)&&far>0,'the far threshold drives this fixture');
  // radius is fixed by the config; solve the distance at which coverage equals a value.
  const radius=Math.hypot(2*.55+.35,4*.55+.25,2*.55+.35),at=coverage=>radius*view.minZ/Math.sqrt(coverage*view.screenArea/Math.PI);
  const farDistance=at(far*.5),range=farDistance+5;
  const {plan}=finish(arrivalSceneryPlan({assets,arrival:{x:0,z:0},view,range,placements:[
    place('near',0,Number.isFinite(mid)?at(mid*4):1),place('far',farDistance,0),place('out',0,range+12+radius+1),
  ]}));
  const levels=id=>plan.filter(entry=>entry.id===id).map(entry=>entry.level).sort();
  assert.deepEqual(levels('out'),[],'beyond the demand range plus its 12 m margin');
  assert.ok(levels('far').includes(2)&&!levels('far').includes(0));
  if(Number.isFinite(mid))assert.ok(levels('near').includes(0));
  assert.equal(plan[0].id,'near','most wanted first');
  assert.deepEqual(planResources(plan).length,new Set(planResources(plan)).size);
});

test('arrival plan takes every level the camera arm can reach, and falls back to a level the device ships',()=>{
  const assets=new Map([['prop',asset('prop')],['touch',asset('touch',[1,2])]]);
  const radius=Math.hypot(2*.55+.35,4*.55+.25,2*.55+.35),far=VILLAGE_LOD_COVERAGE.far;
  const at=coverage=>radius*view.minZ/Math.sqrt(coverage*view.screenArea/Math.PI),edge=at(far);
  // With a 17 m arm the camera may stand either side of the far threshold.
  const wide={...view,reach:17},{plan}=finish(arrivalSceneryPlan({assets,arrival:{x:0,z:0},view:wide,range:edge+40,placements:[place('prop',edge,0),place('touch',.5,0)]}));
  const prop=plan.filter(entry=>entry.id==='prop').map(entry=>entry.level);
  assert.ok(prop.includes(2)&&prop.some(n=>n<2),'both sides of the threshold: '+prop);
  const touch=plan.filter(entry=>entry.id==='touch').map(entry=>entry.level);
  assert.ok(touch.includes(1)&&!touch.includes(0),'no level 0 on this device: '+touch);
});

test('arrival plan: unknown screen size asks for the coarsest level only; cave structure always includes its far level; work is sliced',()=>{
  const assets=new Map([['prop',asset('prop')],['wall',asset('wall',[0,1,2],{essentialStructural:true})]]);
  const blind=finish(arrivalSceneryPlan({assets,arrival:{x:0,z:0},view:{minZ:1,screenArea:NaN,reach:0},range:50,placements:[place('prop',1,0)]})).plan;
  assert.deepEqual(blind.map(entry=>entry.level),[2]);
  const cave=finish(arrivalSceneryPlan({assets,arrival:{x:0,z:0},view,range:50,cave:true,placements:[place('wall',.2,0)]})).plan;
  assert.ok(cave.some(entry=>entry.level===2)&&cave.some(entry=>entry.level===0));
  const many=Array.from({length:ARRIVAL_PLAN_SLICE*3+5},(_,i)=>place('prop',i%7,i%5));
  assert.equal(finish(arrivalSceneryPlan({assets,arrival:{x:0,z:0},view,range:50,placements:many})).yields,3);
  assert.deepEqual(finish(arrivalSceneryPlan({assets,arrival:{x:0,z:0},view,range:50,placements:[place('missing',0,0)]})).plan,[]);
});

// ---- runtime -------------------------------------------------------------
const MODEL=n=>`https://prefetch.test/assets/content/${String(n).padStart(64,'0')}.gltf`;
function harness({mapId='village',allowed=()=>true,fail=null,models=[],stageBytes=0,holdFrom=null,warmTerrain=async()=>true,holdable=true,cover=undefined}={}){
  let clock=0;const calls=[],queues=[],containers=[],lost=[];
  // The still picture of the map being left (held-frame.js), as a record of what was asked of it.
  const frame={held:false,holds:0,rendered:0,released:[],holdable,hold(render){this.holds++;if(!this.holdable)return false;render();this.held=true;return true;},release(fadeMs){if(this.held)this.released.push(fadeMs);this.held=false;},dispose(){this.held=false;}};
  const world={mapId,gameplayV03:true,v03:{playing:true,story:{sceneActive:false}},scene:{onDisposeObservable:{addOnce:fn=>fn,remove(){}},getEngine:()=>({onContextLostObservable:{add:fn=>{lost.push(fn);return fn;},remove(){}}})}};
  // Each staged model carries one 1024x1024 texture at 8 bits a pixel with mips.
  const loadContainer=async(model,scene,{signal})=>{await null;if(signal.aborted)throw signal.reason;
    // From this model on the read never finishes by itself; only an abort ends it.
    if(holdFrom!==null&&containers.length>=holdFrom)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    const container={model:model.href,disposed:0,textures:[{getInternalTexture:()=>({width:1024,height:1024,format:37808,generateMipMaps:true})}],dispose(){this.disposed++;}};containers.push(container);return container;};
  const prefetch=createNextMapPrefetch({world,base:new URL('https://prefetch.test/assets/'),now:()=>clock,allowed,loadContainer,stageBytes,pause:async()=>{},warmTerrain,heldFrame:frame,renderFrame:()=>{frame.rendered++;},...(cover?{cover}:null),
    resources:async(w,portal,base,{signal})=>{calls.push({portal,signal});await null;if(fail?.())throw new Error('network down');return {paths:['./content/'+'a'.repeat(64)+'.gltf','./content/'+'b'.repeat(64)+'.ktx2'],sizes:{},index:null,models};},
    downloads:()=>{const queue={cancelled:0,paths:null,release:null,cancel(){this.cancelled++;this.release?.(Object.assign(new Error('aborted'),{name:'AbortError'}));},
      prepare(paths,onProgress){this.paths=paths;onProgress({total:10,cached:4,loaded:0});return new Promise((resolve,reject)=>{this.finish=()=>resolve({total:10,cached:4,loaded:10,storageAvailable:true});this.release=reject;});}};queues.push(queue);return queue;}});
  const step=(position,busy=false)=>{clock+=PREFETCH_CHECK_SECONDS*1000;prefetch.update(PREFETCH_CHECK_SECONDS,position,busy);};
  return {world,prefetch,calls,queues,containers,lost,frame,step,advance:ms=>{clock+=ms;},settle:async()=>{for(let i=0;i<40;i++)await null;}};
}
const road=MAP_PORTALS.village,toward=d=>({x:road.x,z:road.z-d});

test('prefetch starts once on approach, downloads on its own queue, and reports plain numbers',async()=>{
  const h=harness();
  const still=harness();
  still.step(toward(PREFETCH_APPROACH-1));still.step(toward(PREFETCH_APPROACH-1));still.step(toward(PREFETCH_APPROACH+2));
  assert.equal(still.calls.length,0,'standing still or walking away is not an approach');
  h.step(toward(PREFETCH_APPROACH+20));h.step(toward(PREFETCH_APPROACH+19));
  assert.equal(h.calls.length,0,'outside the approach distance');
  h.step(toward(PREFETCH_APPROACH-3));
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].portal.destination,'warrior-plains');
  await h.settle();
  assert.deepEqual(h.queues[0].paths,['./content/'+'a'.repeat(64)+'.gltf','./content/'+'b'.repeat(64)+'.ktx2']);
  assert.equal(h.prefetch.inspect().active,'warrior-plains');
  for(let d=PREFETCH_APPROACH-4;d>10;d-=2)h.step(toward(d));
  assert.equal(h.calls.length,1,'one run while it is in flight');
  h.queues[0].finish();await h.settle();
  const report=h.prefetch.inspect();
  assert.equal(report.completed,1);assert.equal(report.active,null);
  assert.deepEqual({...report.recent[0],startedAtMs:0,ms:0},{destination:'warrior-plains',state:'complete',startedAtMs:0,ms:0,files:2,bytes:10,cachedBytes:4,loadedBytes:10,stored:true,terrain:true,staged:0,stagedBytes:0,stageFull:false,error:null});
  assert.equal(h.queues[0].cancelled,1,'the finished queue is released');
  h.step(toward(30));h.step(toward(5));
  assert.equal(h.calls.length,1,'once per destination per visit');
  assert.doesNotThrow(()=>JSON.stringify(report));
});

test('prefetch starts inside the near distance whatever the heading, never while busy',async()=>{
  const h=harness();
  h.step(toward(PREFETCH_NEAR-1),true);h.step(toward(PREFETCH_NEAR-1),true);
  assert.equal(h.calls.length,0,'loading, travel or the current map waiting on its own downloads');
  h.step(toward(PREFETCH_NEAR-1));
  assert.equal(h.calls.length,1);
});

test('travel cancels the run; the road just arrived by stays quiet until the player has left it once',async()=>{
  const h=harness();
  h.step(toward(PREFETCH_NEAR-1));await h.settle();
  h.prefetch.cancel();await h.settle();
  assert.equal(h.calls[0].signal.aborted,true);assert.ok(h.queues[0].cancelled>=1);
  assert.equal(h.prefetch.inspect().recent[0].state,'cancelled');assert.equal(h.prefetch.inspect().cancelled,1);
  // Arrive on the plains by the village road.
  h.world.mapId='great-plains';const back=mapPortals('great-plains').find(portal=>portal.destination==='warrior-v3');
  h.step({x:back.x,z:back.z});h.step({x:back.x+3,z:back.z});
  assert.equal(h.calls.length,1,'standing at the gate after arriving is not an approach');
  h.step({x:back.x+PREFETCH_APPROACH+5,z:back.z});h.step({x:back.x+PREFETCH_NEAR-2,z:back.z});
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].portal.destination,'warrior-v3');
  // The other road of this map is independent.
  const forest=mapPortals('great-plains').find(portal=>portal.destination==='warrior-v4');
  await h.settle();h.queues[1].finish();await h.settle();
  h.step({x:forest.x,z:forest.z+PREFETCH_NEAR-2});await h.settle();
  assert.equal(h.calls.at(-1).portal.destination,'warrior-v4');
});

test('data saver skips the visit; a failed run may try once more later; a disposed prefetch does nothing',async()=>{
  const saver=harness({allowed:()=>'save-data'});
  saver.step(toward(PREFETCH_NEAR-1));saver.step(toward(PREFETCH_NEAR-2));
  assert.equal(saver.calls.length,0);assert.equal(saver.prefetch.inspect().skipped,1);assert.equal(saver.prefetch.inspect().recent[0].error,'save-data');
  let down=true;const h=harness({fail:()=>down});
  h.step(toward(PREFETCH_NEAR-1));await h.settle();
  assert.equal(h.prefetch.inspect().failed,1);assert.equal(h.prefetch.inspect().recent[0].error,'network down');
  h.step(toward(PREFETCH_NEAR-2));assert.equal(h.calls.length,1,'not at once');
  h.advance(PREFETCH_RETRY_MS);h.step(toward(PREFETCH_NEAR-3));await h.settle();
  assert.equal(h.calls.length,2);assert.equal(h.prefetch.inspect().failed,2);
  down=false;h.advance(PREFETCH_RETRY_MS*2);h.step(toward(PREFETCH_NEAR-4));
  assert.equal(h.calls.length,2,'one retry per destination per visit');
  h.prefetch.dispose();h.step(toward(1));assert.equal(h.calls.length,2);
});

// ---- staged containers -----------------------------------------------------
const ONE=1024*1024*4/3;
async function stagedHarness(count,options={}){
  const h=harness({models:Array.from({length:count},(_,i)=>MODEL(i)),stageBytes:ONE*2.5,...options});
  h.step(toward(PREFETCH_NEAR-1));await h.settle();h.queues[0].finish();await h.settle();
  return h;
}

test('after the files, arrival models are staged most wanted first up to the byte limit; the loader takes them for good',async()=>{
  const h=await stagedHarness(6);
  assert.deepEqual(h.containers.map(c=>c.model),[MODEL(0),MODEL(1),MODEL(2)],'read in plan order');
  assert.deepEqual(h.containers.map(c=>c.disposed),[0,0,1],'the one that would pass the limit is let go at once');
  const report=h.prefetch.inspect();
  assert.equal(report.stagedModels,2);assert.ok(report.stagedBytes<=report.stageLimit,'never above the limit');assert.equal(report.stagedFor,'warrior-plains');
  assert.equal(report.recent[0].state,'complete');assert.equal(report.recent[0].staged,2);assert.equal(report.recent[0].stageFull,true);
  assert.equal(h.prefetch.take(new URL(MODEL(1)),'village'),null,'the map being left streams models too and must not take the next map\'s');
  assert.equal(h.prefetch.take(new URL(MODEL(1))),null);assert.equal(h.prefetch.inspect().stagedModels,2);
  assert.equal(h.prefetch.take(new URL(MODEL(9)),'great-plains'),null);
  const taken=h.prefetch.take(new URL(MODEL(1)),'great-plains');
  assert.equal(taken,h.containers[1]);assert.equal(h.prefetch.take(MODEL(1),'great-plains'),null,'handed over once');
  assert.equal(Math.round(h.prefetch.inspect().stagedBytes),Math.round(ONE));assert.equal(taken.disposed,0,'the taker owns it now');
  assert.ok(h.prefetch.verifiedUrls('great-plains').has('https://prefetch.test/assets/content/'+'a'.repeat(64)+'.gltf'));
  assert.equal(h.prefetch.verifiedUrls('village'),null);
});

test('travel keeps what is staged for that destination; leftovers are disposed a little after arrival',async()=>{
  const h=await stagedHarness(3,{stageBytes:ONE*20});
  h.prefetch.travel('warrior-plains');
  h.world.mapId='great-plains';h.advance(STAGE_IDLE_MS-2000);h.step({x:0,z:0});
  assert.equal(h.prefetch.inspect().stagedModels,3,'kept through the load');
  assert.equal(h.prefetch.take(MODEL(0),'great-plains'),h.containers[0]);
  h.prefetch.arrived();assert.equal(h.prefetch.verifiedUrls('great-plains'),null);
  h.advance(STAGE_LINGER_MS-1000);h.step({x:0,z:0});assert.equal(h.prefetch.inspect().stagedModels,2);
  assert.equal(h.prefetch.take(MODEL(1),'great-plains'),h.containers[1],'streaming may still take one');
  h.advance(2000);h.step({x:0,z:0});
  assert.equal(h.prefetch.inspect().stagedModels,0);
  assert.deepEqual(h.containers.map(c=>c.disposed),[0,0,1],'only the untaken one is disposed');
  // Many leftovers go a few at a time: this runs during play.
  const many=await stagedHarness(7,{stageBytes:ONE*20});many.prefetch.travel('warrior-plains');many.world.mapId='great-plains';many.step({x:0,z:0});many.prefetch.arrived();
  many.advance(STAGE_LINGER_MS+1);many.step({x:0,z:0});
  assert.equal(many.containers.filter(c=>c.disposed).length,STAGE_DROP_PER_CHECK);
  for(let i=0;i<4;i++)many.step({x:0,z:0});
  assert.equal(many.containers.filter(c=>c.disposed).length,7);assert.equal(many.prefetch.inspect().stagedModels,0);assert.equal(many.prefetch.inspect().stagedFor,null);
});

test('every other way out disposes staged containers: another destination, walking away, error, lost context, disposal',async()=>{
  const other=await stagedHarness(2);other.prefetch.travel('warrior-v4');
  assert.deepEqual(other.containers.map(c=>c.disposed),[1,1]);assert.equal(other.prefetch.inspect().stagedModels,0);
  const idle=await stagedHarness(2);
  for(let i=0;i<5;i++){idle.advance(STAGE_IDLE_MS/2);idle.step(toward(PREFETCH_NEAR-1));}
  assert.equal(idle.prefetch.inspect().stagedModels,2,'still by the road');
  idle.step(toward(PREFETCH_APPROACH+30));idle.advance(STAGE_IDLE_MS+1000);idle.step(toward(PREFETCH_APPROACH+31));idle.step(toward(PREFETCH_APPROACH+31));
  assert.deepEqual(idle.containers.map(c=>c.disposed),[1,1]);
  const failed=await stagedHarness(2);failed.prefetch.cancel();
  assert.deepEqual(failed.containers.map(c=>c.disposed),[1,1]);assert.equal(failed.prefetch.verifiedUrls('great-plains'),null);
  const lost=await stagedHarness(2);for(const fire of lost.lost)fire();
  assert.deepEqual(lost.containers.map(c=>c.disposed),[1,1]);
  const gone=await stagedHarness(2);gone.prefetch.dispose();
  assert.deepEqual(gone.containers.map(c=>c.disposed),[1,1]);
  const wrongMap=await stagedHarness(2);wrongMap.prefetch.travel('warrior-plains');wrongMap.world.mapId='witch-cave';wrongMap.step({x:0,z:0});
  assert.deepEqual(wrongMap.containers.map(c=>c.disposed),[1,1],'arrived somewhere else');
});

test('travel during staging stops it and disposes the model that was still loading',async()=>{
  const h=harness({models:[MODEL(0),MODEL(1),MODEL(2)],stageBytes:ONE*5,holdFrom:1});
  h.step(toward(PREFETCH_NEAR-1));await h.settle();h.queues[0].finish();await h.settle();
  assert.equal(h.prefetch.inspect().recent[0].state,'staging');assert.equal(h.prefetch.inspect().stagedModels,1);
  h.prefetch.travel('warrior-plains');await h.settle();
  const report=h.prefetch.inspect();
  assert.equal(report.recent[0].state,'cancelled');assert.equal(report.active,null);
  assert.equal(report.stagedModels,1,'the finished one stays for the loader');
  assert.deepEqual(h.containers.map(c=>c.disposed),[0]);
});

test('work for a road the player has left gives way to the road being approached',async()=>{
  const h=harness({mapId:'great-plains',models:[MODEL(0),MODEL(1)],stageBytes:ONE*20,holdFrom:1});
  const [home,forest]=mapPortals('great-plains');
  h.step({x:home.x,z:home.z+PREFETCH_NEAR-2});await h.settle();h.queues[0].finish();await h.settle();
  assert.equal(h.prefetch.inspect().active,'warrior-v3');assert.equal(h.prefetch.inspect().stagedModels,1);
  // Still near the first road: the second cannot interrupt.
  assert.ok(Math.hypot(forest.x-home.x,forest.z-home.z)>PREFETCH_APPROACH*2,'the two plains roads are far apart');
  h.step({x:forest.x,z:forest.z+PREFETCH_NEAR-2});await h.settle();
  assert.equal(h.calls.at(-1).portal.destination,'warrior-v4');
  assert.equal(h.calls[0].signal.aborted,true,'the run for the road left behind was stopped');
  assert.deepEqual(h.containers.slice(0,1).map(c=>c.disposed),[1],'and its staged model disposed');
  const report=h.prefetch.inspect();assert.equal(report.active,'warrior-v4');assert.notEqual(report.stagedFor,'warrior-v3');
});

test('the road being left is measured in the same check as the road approached, whichever comes first in the list',async()=>{
  // Forest: the plains road is listed before the cave portal. A run for the cave is under way
  // and the player crosses out of its approach distance in the very check that the plains road
  // comes into reach, then stands still.
  const h=harness({mapId:'monster-forest',models:[MODEL(0),MODEL(1)],stageBytes:ONE*20,holdFrom:1});
  const [plains,cave]=mapPortals('monster-forest');
  h.step({x:cave.x,z:cave.z+PREFETCH_NEAR-2});await h.settle();h.queues[0].finish();await h.settle();
  assert.equal(h.prefetch.inspect().active,'warrior-v5');
  const dx=plains.x-cave.x,dz=plains.z-cave.z,length=Math.hypot(dx,dz),at=d=>({x:cave.x+dx/length*d,z:cave.z+dz/length*d});
  assert.ok(length-PREFETCH_APPROACH-1<PREFETCH_APPROACH,'both roads can be within reach of one spot');
  h.step(at(PREFETCH_APPROACH-1));await h.settle();
  assert.equal(h.prefetch.inspect().active,'warrior-v5','still near the cave');
  h.step(at(PREFETCH_APPROACH+1.5));await h.settle();
  assert.equal(h.prefetch.inspect().active,'warrior-plains','given way in this check, not the next');
  h.step(at(PREFETCH_APPROACH+1.5));await h.settle();assert.equal(h.prefetch.inspect().active,'warrior-plains');
});

// ---- terrain ahead -----------------------------------------------------------
test('every shipped terrain built a row at a time equals the one built in one call',async()=>{
  const {mapTerrainFactory}=await import('../src/map-terrain-factory.js');
  for(const [mapId,edition] of [['village',true],['great-plains',true],['great-plains',false],['monster-forest',true],['witch-cave',true]]){
    const factory=mapTerrainFactory(mapId,edition),whole=factory(),work=factory.sliced();
    let step=work.next(),rows=0;while(!step.done){rows++;step=work.next();}
    const sliced=step.value;
    assert.equal(rows,whole.subdivisions,`${mapId}: one step a row`);
    assert.deepEqual(Object.keys(sliced),Object.keys(whole),mapId+': same fields in the same order (the cache checks them)');
    for(const key of Object.keys(whole))if(key!=='heights')assert.equal(sliced[key],whole[key],mapId+' '+key);
    assert.equal(sliced.heights.length,whole.heights.length);
    let differing=0;for(let i=0;i<whole.heights.length;i++)if(sliced.heights[i]!==whole.heights[i])differing++;
    assert.equal(differing,0,mapId+': identical heights');
    assert.equal(sliced.heightAt(3,-7),whole.heightAt(3,-7));
  }
});

test('a warmed terrain is the one the map change reads from the cache; no row form or a refusal leaves the old path',async()=>{
  const {cachedMapTerrain,warmMapTerrain}=await import('../src/map-terrain-cache.js'),{TerrainHeightField}=await import('../src/terrain.js');
  const engine={isDisposed:false,onDisposeObservable:{addOnce(){}}},field={size:8,subdivisions:8,height:(x,z)=>x*2+z};
  let whole=0;const factory=()=>{whole++;return new TerrainHeightField(field);};factory.sliced=()=>TerrainHeightField.rows(field);
  let steps=0;const run=async work=>{let step=work.next();while(!step.done){steps++;await null;step=work.next();}return step.value;};
  assert.equal(await warmMapTerrain(engine,factory,run),true);assert.equal(steps,8);
  const read=cachedMapTerrain(engine,factory);
  assert.equal(whole,0,'the map change did not build it again');assert.equal(read.heightAt(1,1),new TerrainHeightField(field).heightAt(1,1));
  read.heights[0]=99;assert.notEqual(cachedMapTerrain(engine,factory).heights[0],99,'every reader gets its own array');
  steps=0;assert.equal(await warmMapTerrain(engine,factory,run),true);assert.equal(steps,0,'already cached: nothing to do');
  const plain=()=>new TerrainHeightField(field);assert.equal(await warmMapTerrain(engine,plain,run),false);
  const other=()=>new TerrainHeightField(field);other.sliced=()=>TerrainHeightField.rows(field);
  await assert.rejects(warmMapTerrain(engine,other,async()=>{throw new Error('stopped');}),/stopped/);
  assert.equal(cachedMapTerrain(engine,other).heights.length,81,'a stopped build leaves the normal path');
});

test('a terrain built by the worker is adopted as the one the map change reads; anything else is refused',async()=>{
  const {mapTerrainFactory,terrainMessage}=await import('../src/map-terrain-factory.js'),{cachedMapTerrain,adoptMapTerrain,mapTerrainCached}=await import('../src/map-terrain-cache.js');
  for(const mapId of ['village','great-plains','monster-forest','witch-cave']){
    const engine={isDisposed:false,onDisposeObservable:{addOnce(){}}},factory=mapTerrainFactory(mapId,true),whole=factory();
    const sent=terrainMessage(mapId,true),posted=structuredClone(sent,{transfer:[sent.heights.buffer]});
    assert.equal(sent.heights.length,0,'the heights leave the worker without a copy');
    assert.equal(adoptMapTerrain(engine,factory,posted),true,mapId);assert.equal(mapTerrainCached(engine,factory),true);
    const read=cachedMapTerrain(engine,factory);
    assert.deepEqual(Object.keys(read),Object.keys(whole));
    for(const key of Object.keys(whole))if(key!=='heights')assert.equal(read[key],whole[key],mapId+' '+key);
    assert.deepEqual(read.heights,whole.heights,mapId+': identical heights');
    assert.equal(read.constructor,whole.constructor);assert.equal(read.heightAt(-12.3,40.1),whole.heightAt(-12.3,40.1));
  }
  const engine={isDisposed:false,onDisposeObservable:{addOnce(){}}},factory=mapTerrainFactory('village',true),good=()=>terrainMessage('village',true);
  assert.equal(adoptMapTerrain(engine,factory,null),false);
  assert.equal(adoptMapTerrain(engine,factory,{...good(),heights:new Float32Array(9)}),false,'wrong size');
  assert.equal(adoptMapTerrain(engine,factory,{...good(),heights:[1,2,3]}),false);
  const bent=good();bent.entries=bent.entries.map(([key,value])=>[key,key==='step'?value*2:value]);assert.equal(adoptMapTerrain(engine,factory,bent),false,'fields that disagree');
  const extra=good();extra.entries.push(['hook',{}]);assert.equal(adoptMapTerrain(engine,factory,extra),false,'only plain numbers are kept');
  assert.equal(mapTerrainCached(engine,factory),false);
  assert.equal(adoptMapTerrain({isDisposed:true,onDisposeObservable:{addOnce(){}}},factory,good()),false);
});

test('the worker is asked once and ended; a failed, late or stopped worker leaves the row-by-row build or nothing',async()=>{
  const {warmNextMapTerrain}=await import('../src/v03/next-map-prefetch.js'),{mapTerrainFactory,terrainMessage}=await import('../src/map-terrain-factory.js'),{mapTerrainCached}=await import('../src/map-terrain-cache.js');
  const frames=[],scene={isDisposed:false,getEngine:()=>engine,onBeforeRenderObservable:{addOnce(fn){frames.push(fn);}}};
  let engine;const fresh=()=>{engine={isDisposed:false,onDisposeObservable:{addOnce(){}}};return {scene,gameplayV03:true};};
  const fake=answer=>{const made=[];return {made,create:()=>{const worker={ended:0,asked:[],terminate(){this.ended++;},postMessage(message){this.asked.push(message);queueMicrotask(()=>answer(this,message));}};made.push(worker);return worker;}};};
  let world=fresh(),ok=fake((worker,message)=>worker.onmessage?.({data:terrainMessage(message.mapId,message.gameplayV03)}));
  assert.equal(await warmNextMapTerrain(world,'monster-forest',{createWorker:ok.create}),true);
  assert.deepEqual(ok.made[0].asked,[{mapId:'monster-forest',gameplayV03:true}]);assert.equal(ok.made[0].ended,1);
  assert.equal(mapTerrainCached(engine,mapTerrainFactory('monster-forest',true)),true);
  assert.equal(await warmNextMapTerrain(world,'monster-forest',{createWorker:()=>{throw new Error('must not start another');}}),true,'already cached');
  // A stop ends the worker and builds nothing.
  world=fresh();const silent=fake(()=>{}),stop=new AbortController(),stopped=warmNextMapTerrain(world,'village',{signal:stop.signal,createWorker:silent.create});
  await null;stop.abort();await assert.rejects(stopped,{name:'AbortError'});
  assert.equal(silent.made[0].ended,1);assert.equal(mapTerrainCached(engine,mapTerrainFactory('village',true)),false);
  // No worker, a worker error, a wrong answer or a late one: the row form on the frame budget.
  const drive=setInterval(()=>{for(const frame of frames.splice(0))frame();},1);
  try{
    for(const [name,options] of [['no worker',{createWorker:()=>{throw new Error('no Worker here');}}],
      ['worker error',{createWorker:fake(worker=>worker.onerror?.({preventDefault(){}})).create}],
      ['wrong map',{createWorker:fake(worker=>worker.onmessage?.({data:terrainMessage('witch-cave',true)})).create}],
      ['late',{createWorker:silent.create,timeoutMs:5}]]){
      world=fresh();assert.equal(await warmNextMapTerrain(world,'village',options),true,name);
      assert.equal(mapTerrainCached(engine,mapTerrainFactory('village',true)),true,name);
    }
  }finally{clearInterval(drive);}
  assert.ok(silent.made.every(worker=>worker.ended===1),'every worker was ended');
});

test('the run builds the destination terrain beside the transfer; its failure does not fail the run',async()=>{
  const seen=[];const h=await stagedHarness(1,{warmTerrain:async(world,mapId,{signal})=>{seen.push([mapId,signal.aborted]);return true;}});
  assert.deepEqual(seen,[['great-plains',false]]);assert.equal(h.prefetch.inspect().recent[0].terrain,true);
  const broken=await stagedHarness(1,{warmTerrain:async()=>{throw new Error('no terrain');}});
  const record=broken.prefetch.inspect().recent[0];
  assert.equal(record.state,'complete');assert.equal(record.terrain,false);assert.equal(record.staged,1);
});

// ---- travel without the loading screen ---------------------------------------
// One change to the map, taking `ms`, with the loading screen (what the first crossing of a session is).
const crossed=(h,ms,destination='warrior-plains')=>{h.prefetch.travel(destination);h.advance(ms);h.prefetch.arrived(true);};
test('a road crossed in play with its map staged, whose last change was short, goes without the loading screen; anything else shows it at once',async()=>{
  const road={boundary:{to:'warrior-plains'}};
  const h=await stagedHarness(2);
  assert.equal(h.prefetch.quietFor('warrior-plains',road),0,'no change to that map timed yet this session: the screen');
  assert.equal(h.frame.holds,0,'and the picture is not copied for nothing');
  crossed(h,QUIET_TRAVEL_MS*QUIET_EXPECTED_SHARE+1);
  assert.equal(h.prefetch.quietFor('warrior-plains',road),0,'the last change ran too long to promise a quiet one');
  crossed(h,QUIET_TRAVEL_MS*QUIET_EXPECTED_SHARE);
  assert.deepEqual(h.prefetch.inspect().lastTravelMs,{'warrior-plains':QUIET_TRAVEL_MS*QUIET_EXPECTED_SHARE});
  assert.equal(h.prefetch.quietFor('warrior-plains',{minimap:true,playerTravelFrom:'warrior-v3'}),0,'the minimap is not a road walked across');
  assert.equal(h.prefetch.quietFor('warrior-v4',{boundary:{to:'warrior-v4'}}),0,'nothing staged for that map');
  h.world.v03.story.sceneActive=true;assert.equal(h.prefetch.quietFor('warrior-plains',road),0,'a story scene keeps its screen');h.world.v03.story.sceneActive=false;
  h.world.v03.playing=false;assert.equal(h.prefetch.quietFor('warrior-plains',road),0);h.world.v03.playing=true;
  assert.equal(h.prefetch.quietActive,false);assert.equal(h.frame.holds,0);
  // The picture being left is drawn once more and held before anything is taken apart.
  assert.equal(h.prefetch.quietFor('warrior-plains',road),QUIET_TRAVEL_MS);assert.equal(h.prefetch.quietActive,true);
  assert.deepEqual([h.frame.holds,h.frame.rendered,h.frame.held,h.prefetch.inspect().heldFrame],[1,1,true,true]);
  h.prefetch.travel('warrior-plains');h.advance(700);h.prefetch.arrived(false);
  assert.equal(h.prefetch.quietActive,false);assert.deepEqual(h.frame.released,[HELD_FRAME_FADE_MS],'it dissolves into the finished arrival');
  let report=h.prefetch.inspect();assert.deepEqual([report.quietTravels,report.quietArrivals,report.quietCurtains],[1,1,0]);assert.equal(report.lastTravelMs['warrior-plains'],700);
  // The screen came on after all: the still goes at once, under it.
  const slow=await stagedHarness(2);crossed(slow,500);slow.prefetch.quietFor('warrior-plains',road);slow.prefetch.travel('warrior-plains');slow.advance(3000);slow.prefetch.arrived(true);
  report=slow.prefetch.inspect();assert.deepEqual([report.quietTravels,report.quietArrivals,report.quietCurtains],[1,0,1]);assert.deepEqual(slow.frame.released,[0]);
  assert.equal(slow.prefetch.quietFor('warrior-plains',road),0,'and the next change to that map shows its screen at once');
  // The screen comes on while the change is still running: the still goes then, not at the arrival.
  const late=await stagedHarness(2);crossed(late,500);late.prefetch.quietFor('warrior-plains',road);late.prefetch.travel('warrior-plains');late.advance(QUIET_TRAVEL_MS);
  late.prefetch.screenShown();assert.deepEqual([late.frame.held,late.frame.released],[false,[0]]);
  late.advance(9000);late.prefetch.arrived(true);assert.deepEqual(late.frame.released,[0],'nothing left to take down at the arrival');assert.equal(late.prefetch.inspect().quietCurtains,1);
  // A failed change, or leaving the game, takes the still down with it.
  const failed=await stagedHarness(2);crossed(failed,500);assert.equal(failed.prefetch.quietFor('warrior-plains',road),QUIET_TRAVEL_MS);failed.prefetch.cancel();
  assert.equal(failed.prefetch.quietActive,false);assert.deepEqual(failed.frame.released,[0]);
  // No picture can be held (no canvas, a refused copy): the screen as before.
  const blind=await stagedHarness(2,{holdable:false});crossed(blind,500);assert.equal(blind.prefetch.quietFor('warrior-plains',road),0);assert.equal(blind.prefetch.quietActive,false);
  const empty=harness();crossed(empty,500);assert.equal(empty.prefetch.quietFor('warrior-plains',road),0,'not staged: the screen as before');
  assert.equal(quietBudget(''),QUIET_TRAVEL_MS);assert.equal(quietBudget('?quiet=0'),0);assert.equal(quietBudget('?quiet=300'),300);assert.equal(quietBudget('?quiet=99999'),5000);assert.equal(quietBudget('?quiet=x'),QUIET_TRAVEL_MS);
});

test('while a map change is covered, preparations yield tasks and not frames; the moment it is shown they wait on frames again',async()=>{
  // Its own copy of the module: other tests leave map changes unfinished, and the cover with them.
  const {createBossPreparation,coverPreparation,preparationCovered,COVERED_BUDGET_MS}=await import('../src/boss-preparation.js?covered-test');
  assert.equal(preparationCovered(),false);
  let frames=0;const had=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame];
  globalThis.requestAnimationFrame=fn=>{frames++;return setTimeout(()=>fn(0),1);};globalThis.cancelAnimationFrame=id=>clearTimeout(id);
  try{
    // 40 boundaries with work between them that overruns the 1.5 ms play budget every time.
    let clock=0;const work=async job=>{for(let i=0;i<40;i++){await job.pause();clock+=2;}};
    const open=createBossPreparation({now:()=>clock});await work(open);
    assert.equal(frames,40,'in play every overrun waits a frame');assert.equal(open.stats.yields,40);
    frames=0;const uncover=coverPreparation();assert.equal(preparationCovered(),true);
    const covered=createBossPreparation({now:()=>clock});await work(covered);
    assert.equal(frames,0,'covered: no frame is waited for');
    assert.ok(covered.stats.yields>=40*2/COVERED_BUDGET_MS-1&&covered.stats.yields<=40*2/COVERED_BUDGET_MS+2,'it still yields, once a covered slice ('+covered.stats.yields+')');
    // A generator run: many blocks a slice, no frame between slices.
    const rows=function*(){for(let i=0;i<600;i++)yield i;return 'done';};
    const run=createBossPreparation({now:()=>clock});assert.equal(await run.run(rows()),'done');assert.equal(frames,0);assert.ok(run.stats.slices<=4,'600 blocks in a few slices ('+run.stats.slices+')');
    // A caller's own frame is kept; a preparation that is not incremental never yielded anyway.
    let own=0;const custom=createBossPreparation({now:()=>clock,frame:async()=>{own++;}});await work(custom);assert.equal(own,40);assert.equal(frames,0);
    // Shown: the same preparation, still running, is gentle again at its next boundary.
    const late=createBossPreparation({now:()=>clock});await late.pause();clock+=2;uncover();uncover();assert.equal(preparationCovered(),false);
    await late.pause();assert.equal(frames,1);
    // Two holders: covered until both let go.
    const a=coverPreparation(),b=coverPreparation();a();assert.equal(preparationCovered(),true);b();assert.equal(preparationCovered(),false);
  }finally{[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=had;if(!had[0]){delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}}
});

test('a map change covers preparations from its start until the arrival is shown or it fails',async()=>{
  let held=0;const h=harness({cover:()=>{held++;let mine=true;return ()=>{if(mine){mine=false;held--;}};}});
  assert.equal(held,0);
  h.prefetch.travel('warrior-plains');assert.equal(held,1);
  h.prefetch.travel('warrior-plains');assert.equal(held,1,'a retry holds one cover, not two');
  h.prefetch.arrived(true);assert.equal(held,0);
  h.prefetch.travel('warrior-v4');h.prefetch.cancel();assert.equal(held,0,'a failed change');
  h.prefetch.travel('warrior-v4');h.prefetch.dispose();assert.equal(held,0,'the scene went');
  assert.match(readFileSync(new URL('../src/v03/next-map-prefetch.js',import.meta.url),'utf8'),/cover=coverPreparation,/,'the game holds the real one');
});

test('the held picture: one still copy over the game canvas, under the HUD, emptied when it goes',async()=>{
  const {createHeldFrame,HELD_FRAME_PIXELS}=await import('../src/v03/held-frame.js');
  const {document}=parseHTML('<html><body><div id="app"><canvas id="viewport"></canvas><div class="hud"></div><section id="loading"></section></div></body></html>');
  const canvas=document.getElementById('viewport');canvas.width=1688;canvas.height=780;
  const drawn=[];let context2d=true;
  const create=document.createElement.bind(document);
  document.createElement=name=>{const node=create(name);if(name==='canvas')node.getContext=(kind,options)=>context2d?{drawImage:(...args)=>drawn.push([kind,options.alpha,args[0]===canvas,...args.slice(1)])}:null;return node;};
  const timers=[];const frame=createHeldFrame({canvas,setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimer:id=>{if(timers[id-1])timers[id-1].cleared=true;}});
  const order=[];
  assert.equal(frame.hold(()=>order.push('render')),true);assert.equal(frame.held,true);
  assert.deepEqual(order,['render'],'the canvas is drawn in the same task, before the copy');
  assert.deepEqual(drawn,[['2d',false,true,0,0,1688,780]]);
  const still=canvas.nextElementSibling;
  assert.equal(still.tagName,'CANVAS');assert.equal(still.nextElementSibling.className,'hud','the HUD and the loading screen stay above');
  assert.equal(still.getAttribute('aria-hidden'),'true');assert.match(still.getAttribute('style'),/pointer-events:\s*none/);assert.match(still.getAttribute('style'),/position:\s*absolute/);
  assert.deepEqual([still.width,still.height],[1688,780]);
  // Dissolve: only opacity changes; the copy is emptied after the fade.
  frame.release(180);assert.equal(frame.held,false);
  assert.match(still.getAttribute('style'),/opacity:\s*0/);assert.match(still.getAttribute('style'),/transition:\s*opacity 180ms linear/);
  assert.equal(still.parentNode.id,'app');assert.equal(timers[0].ms,214);
  timers[0].fn();assert.equal(still.parentNode,null);assert.deepEqual([still.width,still.height],[0,0]);
  // At once (the loading screen covers it); a new hold replaces one still fading; reduced motion never fades.
  frame.hold();frame.release(0);assert.equal(document.querySelectorAll('canvas').length,1);
  frame.hold();frame.release(180);frame.hold();assert.equal(document.querySelectorAll('canvas').length,2,'the fading one went when the next was taken');
  document.documentElement.dataset.mfMotion='reduced';frame.release(180);assert.equal(document.querySelectorAll('canvas').length,1);delete document.documentElement.dataset.mfMotion;
  // Nothing to hold: no size yet, a refused context, a render that throws, no canvas.
  canvas.width=0;assert.equal(frame.hold(),false);canvas.width=1688;
  context2d=false;assert.equal(frame.hold(),false);context2d=true;
  assert.equal(frame.hold(()=>{throw new Error('context lost');}),false);assert.equal(frame.held,false);
  assert.equal(document.querySelectorAll('canvas').length,1);
  assert.equal(createHeldFrame({canvas:null}).hold(),false);
  // A very large drawing buffer is copied smaller.
  canvas.width=4000;canvas.height=3000;drawn.length=0;assert.equal(frame.hold(),true);
  const big=canvas.nextElementSibling;assert.ok(big.width*big.height<=HELD_FRAME_PIXELS*1.01);assert.ok(Math.abs(big.width/big.height-4/3)<.01);
  frame.dispose();assert.equal(document.querySelectorAll('canvas').length,1);
});


test('the loading screen can be held back: a short load never shows it, a long one shows it from then on, a failure at once',async()=>{
  const {createLoadingView}=await import('../src/loading-view.js');
  const {document}=parseHTML(readFileSync(new URL('../moonforest-0.3.html',import.meta.url),'utf8')),view=createLoadingView(document,{clipboard:null});
  const overlay=document.getElementById('loading'),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let generation=view.begin('warrior-plains');
  assert.equal(overlay.hidden,false);assert.equal(view.shown,true,'as before without the option');view.reveal(generation);assert.equal(overlay.hidden,true);
  let told=0;generation=view.begin('warrior-plains',{deferMs:40,onShow:()=>{told++;}});
  assert.equal(overlay.hidden,true);assert.equal(view.shown,false);assert.equal(document.documentElement.dataset.loading,undefined);
  view.preparing(undefined,generation);assert.equal(overlay.hidden,true,'progress updates do not bring it on');
  assert.equal(view.reveal(generation),true);await sleep(70);
  assert.equal(overlay.hidden,true,'revealed in time: never shown');assert.equal(view.shown,false);assert.equal(told,0);
  generation=view.begin('warrior-plains',{deferMs:20,onShow:()=>{told++;}});await sleep(60);
  assert.equal(told,1,'the caller is told once when the deferred screen comes on');
  assert.equal(overlay.hidden,false,'ran long: shown from then on');assert.equal(view.shown,true);assert.equal(document.documentElement.dataset.loading,'true');
  view.reveal(generation);assert.equal(overlay.hidden,true);
  generation=view.begin('warrior-plains',{deferMs:5000,onShow:()=>{told++;}});view.fail('맵 이동을 완료하지 못했습니다','x',{error:new Error('x')});
  assert.equal(overlay.hidden,false,'a failure is shown at once');assert.equal(view.shown,true);
  view.begin('warrior-v3',{onShow:()=>{told++;}});assert.equal(overlay.hidden,false);assert.equal(told,1,'a failure, or a screen shown at once, tells nobody');
});

test('the staging budget is smaller on a phone and can be set or switched off from the address',()=>{
  assert.equal(stageBudget('',true),STAGE_BYTES_TOUCH);assert.equal(stageBudget('?character=warrior-v3',false),STAGE_BYTES_DESKTOP);
  assert.ok(STAGE_BYTES_TOUCH<STAGE_BYTES_DESKTOP);
  assert.equal(stageBudget('?stage=0',false),0);assert.equal(stageBudget('?stage=64',true),64*2**20);
  assert.equal(stageBudget('?stage=9999',true),512*2**20);assert.equal(stageBudget('?stage=abc',true),STAGE_BYTES_TOUCH);assert.equal(stageBudget('?stage=-4',true),STAGE_BYTES_TOUCH);
});

// ---- the shipped maps ------------------------------------------------------
test('on the shipped maps the prefetch list covers the real start plan from every heading',async t=>{
  const base=new URL('../public/assets/',import.meta.url);
  // The size index is generated with the local asset build; a bare checkout (CI) has none.
  if(!existsSync(new URL('resource-index.json',base))){t.skip('public/assets/resource-index.json is not in this checkout');return;}
  const old={location:globalThis.location,fetch:globalThis.fetch};
  globalThis.location={href:'https://prefetch.test/game/?character=warrior-plains',pathname:'/game/moonforest-0.3.html',search:''};
  globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);return new Response(readFileSync(new URL(name,base)));};
  t.after(()=>Object.assign(globalThis,old));
  const {createWorld,replaceWorldMap,mapScenePlacements}=await import('../src/world.js');
  const {prepareVillageStart}=await import('../src/village-streamed-environment.js');
  const {prepareFixedLayouts}=await import('../src/fixed-layouts.js');
  await prepareFixedLayouts(['village','great-plains']);
  const index=JSON.parse(readFileSync(new URL('resource-index.json',base))),mobile=JSON.parse(readFileSync(new URL('v03-mobile-village-exterior.json',base)));
  const sizes={...index.files,...mobile.extraFileSizes},bytes=paths=>{let n=0;for(const path of paths)n+=sizes[path.split('/').at(-1)]??0;return n;};
  const routes=[['warrior-v3','warrior-plains'],['warrior-plains','warrior-v3'],['warrior-v4','warrior-plains'],['warrior-plains','warrior-v4'],['warrior-v4','warrior-v5'],['warrior-v5','warrior-v4']];
  const root=new URL('https://prefetch.test/assets/');
  for(const touch of [true,false]){
    const engine=new NullEngine({renderWidth:1448,renderHeight:668}),world=createWorld(engine,{plains:true,village:true,touchDevice:touch,gameplayV03:true});
    t.after(()=>engine.dispose());
    const clear=()=>{for(const record of world.villagePrepared?.records??[])record.root.dispose();world.villagePrepared=null;};
    for(const [from,to] of routes){
      const portal=mapPortals(mapForCharacter(from)).find(candidate=>candidate.destination===to),arrival=portal.arrival,mapId=mapForCharacter(to);
      for(const radius of [8.5,17]){
        // The list is made on the map being left, with the camera the player has there.
        clear();replaceWorldMap(world,from);world.camera.radius=radius;world.camera.getViewMatrix();world.camera.getProjectionMatrix();
        const list=await nextMapResources(world,portal,root,{pause:async()=>{}}),predicted=new Set(list.paths),models=new Set(list.models);
        assert.equal(models.size,list.models.length);
        // Walking in along the road: how much of the first models staged does the real plan use?
        {
          clear();replaceWorldMap(world,to);
          const back=mapPortals(mapId).find(candidate=>mapForCharacter(candidate.destination)===mapForCharacter(from)),hx=arrival.x-back.x,hz=arrival.z-back.z;
          const y=world.terrain.heightAt(arrival.x,arrival.z)+1.4,target=new Vector3(arrival.x,y,arrival.z);
          world.camera.setTarget(target);world.camera.radius=radius;world.camera.beta=1.205;world.camera.alpha=Math.atan2(-hz,-hx);world.camera.getViewMatrix();world.camera.getProjectionMatrix();
          world.caveFog?.update?.(target,0,true);
          const real=await prepareVillageStart(world),asked=new Set(real.plan.map(request=>new URL(real.assets.get(request.id).levels.find(level=>level.level===request.level).model,real.url).href));
          const first=list.models.slice(0,asked.size),used=first.filter(href=>asked.has(href)).length;
          t.diagnostic(`${touch?'touch':'pc'} ${from}->${to} r${radius}: real plan ${asked.size} models, staging list ${list.models.length}, first ${asked.size} staged hit ${used}`);
          assert.ok(used>=asked.size*.5,`${from}->${to}: the first staged models should mostly be the ones the arrival view needs (${used}/${asked.size})`);
        }
        clear();replaceWorldMap(world,to);
        assert.equal(mapScenePlacements(mapId,true),world.placements,`${mapId}: one source of placements`);
        for(let turn=0;turn<8;turn++){
          clear();
          const y=world.terrain.heightAt(arrival.x,arrival.z)+1.4,target=new Vector3(arrival.x,y,arrival.z);
          world.camera.setTarget(target);world.camera.radius=radius;world.camera.beta=1.205;world.camera.alpha=turn*Math.PI/4;world.camera.getViewMatrix();world.camera.getProjectionMatrix();
          world.caveFog?.update?.(target,0,true);
          const real=await prepareVillageStart(world);
          assert.ok(real.resources.length>20,'the real plan is not empty');
          const missing=real.resources.filter(path=>!predicted.has(path));
          assert.deepEqual(missing,[],`${touch?'touch':'pc'} ${from}->${to} r${radius} turn ${turn}: ${(bytes(missing)/1e6).toFixed(2)} MB not prefetched`);
          // The loader asks for exactly these model URLs; each must be one it could have staged.
          const asked=real.plan.map(request=>new URL(real.assets.get(request.id).levels.find(level=>level.level===request.level).model,real.url).href);
          assert.deepEqual(asked.filter(href=>!models.has(href)),[],`${from}->${to} r${radius} turn ${turn}: models not in the staging list`);
        }
        // The cave list also carries its resident (Elena), as the foreground load does.
        t.diagnostic(`${touch?'touch':'pc'} ${from}->${to} r${radius}: ${predicted.size} files ${(bytes(predicted)/1e6).toFixed(1)} MB`);
        assert.ok(bytes(predicted)<(touch?26e6:40e6),`${touch?'touch':'pc'} ${from}->${to}: ${(bytes(predicted)/1e6).toFixed(1)} MB is more than one arrival should pull`);
        for(const path of predicted)assert.ok(Number.isSafeInteger(list.sizes[path.split('/').at(-1)]),'every path has a size: '+path);
      }
    }
  }
});

test('a map\'s first load shares one preparation with long slices; streaming during play keeps the frame rule',async()=>{
  const {createMapMaterialPreparation}=await import('../src/map-shader-cache.js');
  const {INITIAL_PREPARATION_MS,INITIAL_PREPARATION_TIMEOUT_MS}=await import('../src/village-streamed-environment.js');
  // 60 checks of 1 ms each: how many times does the preparation stop and wait?
  const waits=async options=>{let clock=0,count=0;const job=createMapMaterialPreparation(null,{now:()=>clock,wait:()=>{count++;return Promise.resolve();},...options});for(let i=0;i<60;i++){await job.pause();clock+=1;}return count;};
  const play=await waits({}),load=await waits({budgetMs:INITIAL_PREPARATION_MS,timeoutMs:INITIAL_PREPARATION_TIMEOUT_MS});
  assert.ok(play>=25,'during play: about 1.5 ms of work, then a wait ('+play+')');
  assert.ok(load<=play/3,'first load: '+load+' waits against '+play);
  assert.ok(INITIAL_PREPARATION_TIMEOUT_MS>=300000,'one preparation spans the whole load, slow first visits included');
  const loader=readFileSync(new URL('../src/village-streamed-environment.js',import.meta.url),'utf8');
  assert.match(loader,/const initialPreparation=world\.gameplayV03\?createMapMaterialPreparation\(world\.scene,\{cancelled:\(\)=>disposed,budgetMs:INITIAL_PREPARATION_MS,timeoutMs:INITIAL_PREPARATION_TIMEOUT_MS,/);
  assert.match(loader,/if\(initializing&&initialPreparation\)materialOptions\.preparation=initialPreparation;/,'only while the map first loads');
  assert.equal(loader.split('createMapMaterialPreparation(').length-1,1,'no per-model preparation is made for the first load');
});

test('shipped placements loaded behind the loading screen share one long-slice preparation; in play each load keeps the frame rule',async()=>{
  const source=readFileSync(new URL('../src/authored-placement-runtime.js',import.meta.url),'utf8');
  const method=source.match(/\n _loadPreparation\(generation\)\{[\s\S]*?\n \}\n/)?.[0];assert.ok(method,'the runtime decides per load');
  const {createInitialMapPreparation}=await import('../src/map-shader-cache.js');
  const make=new Function('createInitialMapPreparation','return ({'+method.trim().replace(/^_loadPreparation/,'_loadPreparation')+'});')(createInitialMapPreparation);
  const runtime={...make,generation:3,scene:null,_current(generation){return generation===this.generation;},world:{gameplayV03:true,villageStreaming:{active:false}}};
  const first=runtime._loadPreparation(3);
  assert.ok(first&&typeof first.pause==='function');assert.equal(runtime._loadPreparation(3),first,'one preparation for every model of this load');
  runtime.generation=4;const next=runtime._loadPreparation(4);assert.notEqual(next,first,'a new map load gets its own');
  runtime.world.villageStreaming.active=true;assert.equal(runtime._loadPreparation(4),undefined,'in play: the frame rule');assert.equal(runtime._initialPreparation,null);
  runtime.world.villageStreaming.active=false;runtime.world.gameplayV03=false;assert.equal(runtime._loadPreparation(4),undefined,'0.2 unchanged');
  assert.match(source,/const preparation=this\._loadPreparation\(generation\);await lifetime\.run\(\(\)=>prepareMapMaterials\(meshes,\{cancelled:\(\)=>entry\.disposed\|\|!this\._current\(generation\),preparation\}\)\);/);
  assert.match(source,/this\.outlines\.prepare\(this\._sources\(entry\),\{cancelled:\(\)=>entry\.disposed\|\|!this\._current\(generation\),preparation\}\);/);
});

test('main connects the prefetch behind the 0.3 edition; travel keeps staged models, reload and failure drop them',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.equal(main.split('world.nextMapPrefetch?.cancel();world.cancelResourceDownloads?.();').length-1,2,'full reload and transition error');
  assert.match(main,/world\.nextMapPrefetch\?\.travel\(new URL\(href,location\.href\)\.searchParams\.get\('character'\)\);world\.cancelResourceDownloads\?\.\(\);/);
  assert.match(main,/loadingView\.reveal\(mapLoadingGeneration\);showMinimap\(\);world\.nextMapPrefetch\?\.arrived\(loadingView\.shown\);/);
  assert.match(main,/const quiet=world\.nextMapPrefetch\?\.quietFor\?\.\(new URL\(href,location\.href\)\.searchParams\.get\('character'\),context\)\?\?0;/);
  assert.match(main,/loadingView\.begin\(new URL\(href,location\.href\)\.searchParams\.get\('character'\),quiet\?\{deferMs:quiet,onShow:\(\)=>world\.nextMapPrefetch\?\.screenShown\?\.\(\)\}:undefined\);/,'the screen coming on takes the held picture down');
  assert.match(main,/if\(!quiet\)input\.reset\(\);cancelAttackInput\(\);/,'a held stick keeps moving the player across the road');
  assert.match(main,/if\(world\.gameplayV03\)\(world\.nextMapPrefetch\?\?=createNextMapPrefetch\(\{world,base:/);
  assert.match(main,/nextMapPrefetch:world\?\.nextMapPrefetch\?\.inspect\(\)\?\?null/);
  const loader=readFileSync(new URL('../src/village-streamed-environment.js',import.meta.url),'utf8');
  assert.match(loader,/lifetime\.check\(\);\r?\n\s+const model=new URL\(config\.model,url\),staged=world\.nextMapPrefetch\?\.take\?\.\(model,world\.mapId\)\?\?null;/,'never take after the load was released');
  const source=readFileSync(new URL('../src/v03/next-map-prefetch.js',import.meta.url),'utf8');
  for(const forbidden of ['SceneLoader','instantiateModelsToScene','new Texture','createEffect','requestAnimationFrame','setInterval','setEnabled'])assert.ok(!source.includes(forbidden),forbidden);
});
