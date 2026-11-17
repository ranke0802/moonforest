import {villageRenderRange} from './village-policy.js';
import {sceneryDistanceRange as cinematicSceneryRange} from './scenery-distance-state.js';

export const PLAINS_VIEW_DISTANCE_KEY='moonforest-plains-view-distance-v2';
export const PLAINS_VIEW_DISTANCE_DEFAULT=2.4;
export const PLAINS_VIEW_DISTANCE_STEPS=Object.freeze(Array.from({length:15},(_,i)=>(10+i)/10));
export function normalizePlainsViewDistance(value){
  const number=Number(value);
  return PLAINS_VIEW_DISTANCE_STEPS.includes(number)?number:PLAINS_VIEW_DISTANCE_DEFAULT;
}
export function readPlainsViewDistance(storage){
  try{
    const saved=storage?.getItem(PLAINS_VIEW_DISTANCE_KEY);
    if(saved!==null&&saved!==undefined)return normalizePlainsViewDistance(saved);
    // A new epoch applies the requested 240% once, including old 100/200%
    // defaults. Subsequent explicit choices under this key remain untouched.
    try{storage?.setItem(PLAINS_VIEW_DISTANCE_KEY,String(PLAINS_VIEW_DISTANCE_DEFAULT));}catch{}
    return PLAINS_VIEW_DISTANCE_DEFAULT;
  }catch{return PLAINS_VIEW_DISTANCE_DEFAULT;}
}
export function plainsRenderRange(world,touch=world.touchDevice){
  const cinematic=cinematicSceneryRange(world,touch);if(cinematic)return cinematic;
  const base=villageRenderRange(touch);
  // Frame guard (touch): the village may pull its range in a little.
  const guard=world.mapId==='village'&&world.adaptiveRangeScale>0&&world.adaptiveRangeScale<1?world.adaptiveRangeScale:1;
  if(world.mapId!=='great-plains')return guard===1?base:{...base,fogStart:base.fogStart*guard,fogEnd:base.fogEnd*guard,cellCull:base.cellCull*guard,meshCull:base.meshCull*guard};
  const scale=normalizePlainsViewDistance(world.plainsViewDistance);
  if(scale===1)return base;
  return {...base,fogStart:base.fogStart*scale,fogEnd:base.fogEnd*scale,cellCull:base.cellCull*scale,meshCull:base.meshCull*scale};
}
// Map replacement restores its own atmosphere first; call this after replacement.
export function applyPlainsViewDistance(world,value){
  if(!world)return;
  world.plainsViewDistance=normalizePlainsViewDistance(value);
  if(world.mapId!=='great-plains'||world.villageOverview)return;
  const range=plainsRenderRange(world);
  world.scene.fogStart=range.fogStart;world.scene.fogEnd=range.fogEnd;
  if(world.villageVisibility)world.villageVisibility.timer=0;
  world.villageStreaming?.demand?.invalidate();
}
// Frame guard: scale the village render range (1 = authored range).
export function applyAdaptiveRange(world,scale,force=false){
  if(!world||(!force&&world.adaptiveRangeScale===scale)||(force&&scale===1&&!(world.adaptiveRangeScale<1)))return;
  world.adaptiveRangeScale=scale;
  if(world.mapId!=='village'||world.villageOverview)return;
  const range=plainsRenderRange(world);
  world.scene.fogStart=range.fogStart;world.scene.fogEnd=range.fogEnd;
  if(world.villageVisibility)world.villageVisibility.timer=0;
  world.villageStreaming?.demand?.invalidate();
}
export function setupPlainsViewDistanceControl({select,storage,onChange=()=>{}}){
  let value=readPlainsViewDistance(storage);
  const apply=next=>{value=normalizePlainsViewDistance(next);select.value=String(value);onChange(value);};
  apply(value);
  const change=()=>{apply(select.value);try{storage?.setItem(PLAINS_VIEW_DISTANCE_KEY,String(value));}catch{/* The choice still applies this session. */}};
  select.addEventListener('change',change);
  return {get value(){return value;},dispose:()=>select.removeEventListener('change',change)};
}
