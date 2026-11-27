// Bounded, scene-lifetime keep for released actor source containers
// (2026-11-27). The 0.3 village cast is 7 Tripo rigs of 98,432 animation keys
// each; every village visit parsed all of them again once the previous visit
// released them (Node, PC: 214-259 ms and ~131 MB of short-lived objects per
// visit). A released source that finished loading is parked here instead and
// revived by the next actor of the same asset; the oldest is disposed once the
// pool is over its budget.
//
// Lifetime: a pool belongs to one scene (WeakMap), and a parked entry is a
// scene-level source container with its own derived materials: never a map
// node, a map lifetime or a load signal. Nothing here keeps a list snapshot.
const pools=new WeakMap();
const MIB=1024*1024;
// Budgets in MiB of estimated retained JS/GPU-side bytes. iPhone Safari has a
// process memory ceiling (1.5 GB-class kills seen before), so it parks nothing.
// Android touch fits the whole 7-rig cast (estimated 120.6 MiB, Node).
export const ACTOR_SOURCE_CACHE_BUDGETS=Object.freeze({desktop:256,touch:128,ios:0});
export function actorSourceCacheProfile(nav=globalThis.navigator){
 const ua=String(nav?.userAgent??'');
 if(/iPhone|iPad|iPod/.test(ua)||(nav?.platform==='MacIntel'&&nav?.maxTouchPoints>1))return 'ios';
 return (nav?.maxTouchPoints??0)>0&&/Android|Mobile/.test(ua)?'touch':'desktop';
}
let defaultBudget=null;
export function setActorSourceCacheBudget(mib){defaultBudget=Number.isFinite(mib)&&mib>=0?mib:null;}
function budgetBytes(){return (defaultBudget??ACTOR_SOURCE_CACHE_BUDGETS[actorSourceCacheProfile()])*MIB;}
// Calibrated in Node on the cast rigs: 18.7 MB retained per rig with 69.8k kept
// keys and 10.2k vertices (keys dominate). Textures are not counted (GPU).
export function estimateSourceBytes(container){
 let keys=0,vertices=0;
 for(const group of container?.animationGroups??[])for(const row of group.targetedAnimations)keys+=row.animation.getKeys?.().length??0;
 for(const mesh of container?.meshes??[])vertices+=mesh.getTotalVertices?.()??0;
 return keys*240+vertices*128;
}
function poolFor(scene){
 let pool=pools.get(scene);
 if(!pool){pool={entries:new Map(),bytes:0,parked:0,revived:0,evicted:0,rejected:0};pools.set(scene,pool);}
 return pool;
}
// Park a released source. owner: the factory (keys are per factory). finish: disposes it.
// Returns false when it was not kept (the caller disposes it as before).
export function parkActorSource(scene,owner,key,entry,finish){
 if(!scene||scene.isDisposed)return false;
 const pool=poolFor(scene),limit=budgetBytes(),bytes=estimateSourceBytes(entry.container);
 if(!(bytes>0)||bytes>limit){pool.rejected++;return false;}
 const id=owner.id+'|'+key;
 const previous=pool.entries.get(id);if(previous){pool.entries.delete(id);pool.bytes-=previous.bytes;previous.finish();}
 pool.entries.set(id,{owner,entry,bytes,finish});pool.bytes+=bytes;pool.parked++;
 for(const [oldest,row] of pool.entries){if(pool.bytes<=limit)break;pool.entries.delete(oldest);pool.bytes-=row.bytes;pool.evicted++;row.finish();}
 return pool.entries.has(id);
}
export function reviveActorSource(scene,owner,key){
 const pool=pools.get(scene),id=owner.id+'|'+key,row=pool?.entries.get(id);
 if(!row)return null;
 pool.entries.delete(id);pool.bytes-=row.bytes;pool.revived++;return row.entry;
}
// A factory that goes away disposes its parked sources.
export function releaseActorSources(scene,owner){
 const pool=pools.get(scene);if(!pool)return;
 for(const [id,row] of pool.entries)if(row.owner===owner){pool.entries.delete(id);pool.bytes-=row.bytes;row.finish();}
}
export function inspectActorSourceCache(scene){
 const pool=pools.get(scene);
 return {budgetMiB:Math.round(budgetBytes()/MIB),profile:defaultBudget===null?actorSourceCacheProfile():'override',
  sources:pool?.entries.size??0,estimatedMiB:pool?Math.round(pool.bytes/MIB*10)/10:0,parked:pool?.parked??0,revived:pool?.revived??0,evicted:pool?.evicted??0,rejected:pool?.rejected??0};
}
