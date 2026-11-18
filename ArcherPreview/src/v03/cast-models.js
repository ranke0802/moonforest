// Story cast with real models. Roles reuse the resident sheets the dialogue
// portraits already cast (driver = blacksmith, chief = merchant, innkeeper =
// farmer). Models load through the NPC world runtime, so they get exactly the
// NPC toon bands, outline and interior ink the rest of the game uses. Roles
// without a model (or any load failure) keep the block placeholder.
import {ACTOR_VISUALS,createActorVisual} from './placeholder-actor.js';
import {CAST_ENTRIES} from './cast-catalog.js';

export const CAST_MODELS=Object.freeze({
 driver:'moonforest-tripo-blacksmith',
 innkeeper:'moonforest-tripo-farmer',
 elder:'moonforest-tripo-elder-woman',
 herbalist:'moonforest-tripo-herbalist',
 youth:'moonforest-tripo-youth',
 chief:'moonforest-tripo-merchant',
 'chief-son':'moonforest-tripo-vigilante',
});
const MODEL_HEIGHT=1.85;
const quatY=yaw=>[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];

export function createCastVisuals({getWorld,fallback=createActorVisual,loadRuntime}={}){
 let runtime=null,runtimeScene=null,serial=0;
 const load=loadRuntime??(async world=>{
  const [{createNpcWorld},{ASSET_CATALOG}]=await Promise.all([import('../npc-world.js'),import('../asset-catalog.js')]);
  const own=new Set(CAST_ENTRIES.map(entry=>entry.assetId));
  const catalog={...ASSET_CATALOG,entries:[...ASSET_CATALOG.entries.filter(entry=>!own.has(entry.assetId)),...CAST_ENTRIES]};
  return createNpcWorld({world,catalog,getCatalog:()=>catalog,hydrate:async()=>[],storage:null,onError:error=>{if(error?.name!=='AbortError')console.warn('[MoonForest 0.3] cast model',error);}});
 });
 function ensure(){
  const world=getWorld();
  if(!runtime||runtimeScene!==world.scene){runtimeScene=world.scene;runtime=Promise.resolve(load(world));}
  return runtime;
 }
 function create(scene,key,{id=key}={}){
  const assetId=CAST_MODELS[key];
  if(!assetId)return fallback(scene,key,{id});
  const spec=ACTOR_VISUALS[key]??{label:key,height:1.7},scale=(spec.height??1.7)/MODEL_HEIGHT;
  const instanceId=`v03-cast-${String(id).replace(/[^A-Za-z0-9._:-]/g,'-')}-${++serial}`;
  let pose=null,ready=false,disposed=false,npc=null,block=null;
  const transform=()=>({position:pose.position,rotation:quatY(pose.yaw),scale});
  const swapToBlock=error=>{
   if(disposed||block)return;console.warn('[MoonForest 0.3] cast model unavailable',key,error);
   block=fallback(scene,key,{id});if(pose)block.place(...pose.position,pose.yaw);
  };
  void ensure().then(async world=>{
   npc=world;if(disposed)return;if(!pose)await new Promise(resolve=>{create.waiters.set(instanceId,resolve);});
   if(disposed)return;
   await world.add(assetId,{instanceId,...transform(),clipId:'Idle_Stand',loop:true,persist:false});
   if(disposed){world.remove(instanceId,{persist:false});return;}
   ready=true;world.setTransform(instanceId,transform());
  }).catch(swapToBlock);
  return {
   id,key,label:spec.label,placeholder:false,height:spec.height??1.7,
   place(x,y,z,yaw=0){
    pose={position:[x,y,z],yaw};
    if(block)return block.place(x,y,z,yaw);
    const waiting=create.waiters.get(instanceId);if(waiting){create.waiters.delete(instanceId);waiting();}
    if(ready)npc.setTransform(instanceId,transform());
   },
   dispose(){
    disposed=true;block?.dispose();
    const waiting=create.waiters.get(instanceId);if(waiting){create.waiters.delete(instanceId);waiting();}
    if(npc)try{npc.remove(instanceId,{persist:false});}catch{}
   },
  };
 }
 create.waiters=new Map();
 create.preload=()=>ensure().catch(()=>{});
 return create;
}
