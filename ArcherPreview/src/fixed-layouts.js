// Fixed map layouts are generated ahead of time (scripts/build-fixed-layouts.mjs
// from village-layout.js and great-plains-layout.js) and each region's result
// is loaded only when that region is entered. Before 2026-11-24 the game ran
// both generators on every page start (PC Node: 58 ms village, 150 ms plains).
//
// A map load awaits prepareFixedLayouts(...) and the world then reads
// fixedPlacements(...) synchronously. The data lives as long as the page, like
// the generated module constants did, and a region never visited is never
// fetched. In a browser build an unprepared read is an error (the generators are
// not shipped); Node scripts and tests fall back to the generators themselves.
import {fallbackPlacements} from '#fixed-layout-fallback';

const LOADERS=Object.freeze({
 village:()=>import('./generated/village-placements.js'),
 'great-plains':()=>import('./generated/great-plains-placements.js'),
});
const loaded=new Map(),pending=new Map();
const now=()=>globalThis.performance?.now?.()??Date.now();
export const FIXED_LAYOUT_IDS=Object.freeze(Object.keys(LOADERS));
// Diagnostics: prepared/fallbacks count loads, loadMs is each region's fetch and
// parse time, lastWait is how long the last awaited prepare actually blocked
// (a fetch started early can finish before its map load awaits it).
export const fixedLayoutStats={prepared:0,fallbacks:0,loadMs:{},lastWait:null};

// Which layouts a map needs: only the village and the plains have one (the
// forest and the cave keep their small hand-written layouts, and the archer
// training ground uses neither).
export function fixedLayoutsFor({village=false,plains=false,forest=false,cave=false}={}){
 return plains?['great-plains']:village&&!forest&&!cave?['village']:[];
}
export function fixedLayoutsForCharacter(character){
 return character==='warrior-plains'?['great-plains']:character==='warrior-v3'?['village']:[];
}

function prepareOne(id){
 const load=LOADERS[id];if(!load)return Promise.reject(new Error('Unknown fixed layout: '+id));
 if(loaded.has(id))return Promise.resolve(loaded.get(id));
 let task=pending.get(id);
 if(!task){
  const started=now();
  task=load().then(module=>{
   const data=module.default;if(!Array.isArray(data))throw new Error('Fixed layout data is missing: '+id);
   if(!loaded.has(id)){loaded.set(id,data);fixedLayoutStats.prepared++;}
   fixedLayoutStats.loadMs[id]=Math.round((now()-started)*10)/10;
   return loaded.get(id);
  }).finally(()=>pending.delete(id));
  pending.set(id,task);
 }
 return task;
}
// Resolves once every listed region is loaded; returns the milliseconds it waited.
export async function prepareFixedLayouts(ids){
 const list=[...new Set(ids??[])];if(!list.length)return 0;
 const started=now();
 await Promise.all(list.map(prepareOne));
 const ms=Math.round((now()-started)*10)/10;
 fixedLayoutStats.lastWait={ids:list.join(','),ms};
 return ms;
}
export function isFixedLayoutReady(id){return loaded.has(id);}

// The placements of a prepared region, in the generator's order (IDs and order
// are part of saves and editor documents).
export function fixedPlacements(id){
 const data=loaded.get(id);if(data)return data;
 if(!LOADERS[id])throw new Error('Unknown fixed layout: '+id);
 const generated=fallbackPlacements(id);
 fixedLayoutStats.fallbacks++;loaded.set(id,generated);
 return generated;
}
// Tools that ship the data in their own lazy chunk register it here, so the
// game and the tool share one copy.
export function installFixedLayout(id,data){
 if(!LOADERS[id])throw new Error('Unknown fixed layout: '+id);
 if(!Array.isArray(data))throw new Error('Fixed layout data must be a placement list: '+id);
 if(!loaded.has(id)){loaded.set(id,data);fixedLayoutStats.prepared++;}
 return loaded.get(id);
}
export const villagePlacements=()=>fixedPlacements('village');
export const plainsPlacements=()=>fixedPlacements('great-plains');
