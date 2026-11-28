import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {NullEngine,Vector3} from '@babylonjs/core';

globalThis.matchMedia??=()=>({matches:true});
{const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};}

const {arrivalSceneryPlan,planResources,ARRIVAL_PLAN_SLICE}=await import('../src/v03/next-map-plan.js');
const {createNextMapPrefetch,nextMapResources,PREFETCH_NEAR,PREFETCH_APPROACH,PREFETCH_CHECK_SECONDS,PREFETCH_RETRY_MS}=await import('../src/v03/next-map-prefetch.js');
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
function harness({mapId='village',allowed=()=>true,fail=null}={}){
  let clock=0;const calls=[],queues=[];
  const world={mapId,gameplayV03:true,scene:{onDisposeObservable:{addOnce:fn=>fn,remove(){}}}};
  const prefetch=createNextMapPrefetch({world,base:new URL('https://prefetch.test/assets/'),now:()=>clock,allowed,
    resources:async(w,portal,base,{signal})=>{calls.push({portal,signal});await null;if(fail?.())throw new Error('network down');return {paths:['./content/a.gltf','./content/b.ktx2'],sizes:{},index:null};},
    downloads:()=>{const queue={cancelled:0,paths:null,release:null,cancel(){this.cancelled++;this.release?.(Object.assign(new Error('aborted'),{name:'AbortError'}));},
      prepare(paths,onProgress){this.paths=paths;onProgress({total:10,cached:4,loaded:0});return new Promise((resolve,reject)=>{this.finish=()=>resolve({total:10,cached:4,loaded:10,storageAvailable:true});this.release=reject;});}};queues.push(queue);return queue;}});
  const step=(position,busy=false)=>{clock+=PREFETCH_CHECK_SECONDS*1000;prefetch.update(PREFETCH_CHECK_SECONDS,position,busy);};
  return {world,prefetch,calls,queues,step,advance:ms=>{clock+=ms;},settle:async()=>{for(let i=0;i<6;i++)await null;}};
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
  assert.deepEqual(h.queues[0].paths,['./content/a.gltf','./content/b.ktx2']);
  assert.equal(h.prefetch.inspect().active,'warrior-plains');
  for(let d=PREFETCH_APPROACH-4;d>10;d-=2)h.step(toward(d));
  assert.equal(h.calls.length,1,'one run while it is in flight');
  h.queues[0].finish();await h.settle();
  const report=h.prefetch.inspect();
  assert.equal(report.completed,1);assert.equal(report.active,null);
  assert.deepEqual({...report.recent[0],startedAtMs:0,ms:0},{destination:'warrior-plains',state:'complete',startedAtMs:0,ms:0,files:2,bytes:10,cachedBytes:4,loadedBytes:10,stored:true,error:null});
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
        const list=await nextMapResources(world,portal,root,{pause:async()=>{}}),predicted=new Set(list.paths);
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
        }
        // The cave list also carries its resident (Elena), as the foreground load does.
        t.diagnostic(`${touch?'touch':'pc'} ${from}->${to} r${radius}: ${predicted.size} files ${(bytes(predicted)/1e6).toFixed(1)} MB`);
        assert.ok(bytes(predicted)<(touch?26e6:40e6),`${touch?'touch':'pc'} ${from}->${to}: ${(bytes(predicted)/1e6).toFixed(1)} MB is more than one arrival should pull`);
        for(const path of predicted)assert.ok(Number.isSafeInteger(list.sizes[path.split('/').at(-1)]),'every path has a size: '+path);
      }
    }
  }
});

test('main connects the prefetch behind the 0.3 edition and cancels it wherever travel cancels downloads',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.equal(main.split('world.nextMapPrefetch?.cancel();world.cancelResourceDownloads?.();').length-1,2);
  assert.match(main,/if\(world\.gameplayV03\)\(world\.nextMapPrefetch\?\?=createNextMapPrefetch\(\{world,base:/);
  assert.match(main,/nextMapPrefetch:world\?\.nextMapPrefetch\?\.inspect\(\)\?\?null/);
  const source=readFileSync(new URL('../src/v03/next-map-prefetch.js',import.meta.url),'utf8');
  for(const forbidden of ['SceneLoader','instantiateModelsToScene','new Texture','createEffect','requestAnimationFrame','setInterval'])assert.ok(!source.includes(forbidden),forbidden);
});
