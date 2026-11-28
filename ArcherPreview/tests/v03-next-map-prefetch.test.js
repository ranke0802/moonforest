import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {NullEngine,Vector3} from '@babylonjs/core';

globalThis.matchMedia??=()=>({matches:true});
{const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};}

const {arrivalSceneryPlan,planResources,ARRIVAL_PLAN_SLICE}=await import('../src/v03/next-map-plan.js');
const {createNextMapPrefetch,nextMapResources,stageBudget,STAGE_BYTES_TOUCH,STAGE_BYTES_DESKTOP,PREFETCH_NEAR,PREFETCH_APPROACH,PREFETCH_CHECK_SECONDS,PREFETCH_RETRY_MS,STAGE_LINGER_MS,STAGE_IDLE_MS,STAGE_DROP_PER_CHECK}=await import('../src/v03/next-map-prefetch.js');
const {VILLAGE_LOD_COVERAGE}=await import('../src/village-lod.js');
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
function harness({mapId='village',allowed=()=>true,fail=null,models=[],stageBytes=0,holdFrom=null}={}){
  let clock=0;const calls=[],queues=[],containers=[],lost=[];
  const world={mapId,gameplayV03:true,scene:{onDisposeObservable:{addOnce:fn=>fn,remove(){}},getEngine:()=>({onContextLostObservable:{add:fn=>{lost.push(fn);return fn;},remove(){}}})}};
  // Each staged model carries one 1024x1024 texture at 8 bits a pixel with mips.
  const loadContainer=async(model,scene,{signal})=>{await null;if(signal.aborted)throw signal.reason;
    // From this model on the read never finishes by itself; only an abort ends it.
    if(holdFrom!==null&&containers.length>=holdFrom)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    const container={model:model.href,disposed:0,textures:[{getInternalTexture:()=>({width:1024,height:1024,format:37808,generateMipMaps:true})}],dispose(){this.disposed++;}};containers.push(container);return container;};
  const prefetch=createNextMapPrefetch({world,base:new URL('https://prefetch.test/assets/'),now:()=>clock,allowed,loadContainer,stageBytes,pause:async()=>{},
    resources:async(w,portal,base,{signal})=>{calls.push({portal,signal});await null;if(fail?.())throw new Error('network down');return {paths:['./content/'+'a'.repeat(64)+'.gltf','./content/'+'b'.repeat(64)+'.ktx2'],sizes:{},index:null,models};},
    downloads:()=>{const queue={cancelled:0,paths:null,release:null,cancel(){this.cancelled++;this.release?.(Object.assign(new Error('aborted'),{name:'AbortError'}));},
      prepare(paths,onProgress){this.paths=paths;onProgress({total:10,cached:4,loaded:0});return new Promise((resolve,reject)=>{this.finish=()=>resolve({total:10,cached:4,loaded:10,storageAvailable:true});this.release=reject;});}};queues.push(queue);return queue;}});
  const step=(position,busy=false)=>{clock+=PREFETCH_CHECK_SECONDS*1000;prefetch.update(PREFETCH_CHECK_SECONDS,position,busy);};
  return {world,prefetch,calls,queues,containers,lost,step,advance:ms=>{clock+=ms;},settle:async()=>{for(let i=0;i<40;i++)await null;}};
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
  assert.deepEqual({...report.recent[0],startedAtMs:0,ms:0},{destination:'warrior-plains',state:'complete',startedAtMs:0,ms:0,files:2,bytes:10,cachedBytes:4,loadedBytes:10,stored:true,staged:0,stagedBytes:0,stageFull:false,error:null});
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
  assert.deepEqual(h.containers.map(c=>c.model),[MODEL(0),MODEL(1),MODEL(2)],'three fit the limit, in plan order');
  const report=h.prefetch.inspect();
  assert.equal(report.stagedModels,3);assert.equal(Math.round(report.stagedBytes),4194304);assert.equal(report.stagedFor,'warrior-plains');
  assert.equal(report.recent[0].state,'complete');assert.equal(report.recent[0].staged,3);assert.equal(report.recent[0].stageFull,true);
  assert.equal(h.prefetch.take(new URL(MODEL(9))),null);
  const taken=h.prefetch.take(new URL(MODEL(1)));
  assert.equal(taken,h.containers[1]);assert.equal(h.prefetch.take(MODEL(1)),null,'handed over once');
  assert.equal(Math.round(h.prefetch.inspect().stagedBytes),Math.round(ONE*2));assert.equal(taken.disposed,0,'the taker owns it now');
  assert.ok(h.prefetch.verifiedUrls('great-plains').has('https://prefetch.test/assets/content/'+'a'.repeat(64)+'.gltf'));
  assert.equal(h.prefetch.verifiedUrls('village'),null);
});

test('travel keeps what is staged for that destination; leftovers are disposed a little after arrival',async()=>{
  const h=await stagedHarness(3);
  h.prefetch.travel('warrior-plains');
  h.world.mapId='great-plains';h.advance(STAGE_IDLE_MS-2000);h.step({x:0,z:0});
  assert.equal(h.prefetch.inspect().stagedModels,3,'kept through the load');
  assert.equal(h.prefetch.take(MODEL(0)),h.containers[0]);
  h.prefetch.arrived();assert.equal(h.prefetch.verifiedUrls('great-plains'),null);
  h.advance(STAGE_LINGER_MS-1000);h.step({x:0,z:0});assert.equal(h.prefetch.inspect().stagedModels,2);
  assert.equal(h.prefetch.take(MODEL(1)),h.containers[1],'streaming may still take one');
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

test('main connects the prefetch behind the 0.3 edition; travel keeps staged models, reload and failure drop them',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.equal(main.split('world.nextMapPrefetch?.cancel();world.cancelResourceDownloads?.();').length-1,2,'full reload and transition error');
  assert.match(main,/world\.nextMapPrefetch\?\.travel\(new URL\(href,location\.href\)\.searchParams\.get\('character'\)\);world\.cancelResourceDownloads\?\.\(\);/);
  assert.match(main,/loadingView\.reveal\(mapLoadingGeneration\);showMinimap\(\);world\.nextMapPrefetch\?\.arrived\(\);/);
  assert.match(main,/if\(world\.gameplayV03\)\(world\.nextMapPrefetch\?\?=createNextMapPrefetch\(\{world,base:/);
  assert.match(main,/nextMapPrefetch:world\?\.nextMapPrefetch\?\.inspect\(\)\?\?null/);
  const loader=readFileSync(new URL('../src/village-streamed-environment.js',import.meta.url),'utf8');
  assert.match(loader,/lifetime\.check\(\);\r?\n\s+const model=new URL\(config\.model,url\),staged=world\.nextMapPrefetch\?\.take\?\.\(model\)\?\?null;/,'never take after the load was released');
  const source=readFileSync(new URL('../src/v03/next-map-prefetch.js',import.meta.url),'utf8');
  for(const forbidden of ['SceneLoader','instantiateModelsToScene','new Texture','createEffect','requestAnimationFrame','setInterval','setEnabled'])assert.ok(!source.includes(forbidden),forbidden);
});
