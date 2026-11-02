import {villageRenderRange} from './village-policy.js';

export const PLAINS_VIEW_DISTANCE_KEY='moonforest-plains-view-distance-v1';
export const PLAINS_VIEW_DISTANCE_STEPS=Object.freeze([1,1.1,1.2,1.3]);
export function normalizePlainsViewDistance(value){
  const number=Number(value);
  return PLAINS_VIEW_DISTANCE_STEPS.includes(number)?number:1;
}
export function readPlainsViewDistance(storage){
  try{return normalizePlainsViewDistance(storage?.getItem(PLAINS_VIEW_DISTANCE_KEY));}catch{return 1;}
}
export function plainsRenderRange(world,touch=world.touchDevice){
  const base=villageRenderRange(touch);
  if(world.mapId!=='great-plains')return base;
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
export function setupPlainsViewDistanceControl({select,storage,onChange=()=>{}}){
  let value=readPlainsViewDistance(storage);
  const apply=next=>{value=normalizePlainsViewDistance(next);select.value=String(value);onChange(value);};
  apply(value);
  const change=()=>{apply(select.value);try{storage?.setItem(PLAINS_VIEW_DISTANCE_KEY,String(value));}catch{/* The choice still applies this session. */}};
  select.addEventListener('change',change);
  return {get value(){return value;},dispose:()=>select.removeEventListener('change',change)};
}
