import {sceneryDistanceState,sceneryEnvironmentSnapshot as snapshot,sameSceneryGeneration as same,sameSceneryEnvironment as sameStamp,sameScenerySource as sameSource,sceneryDistanceRange as cinematicSceneryRange} from './scenery-distance-state.js';
export {sceneryDistanceScale as cinematicSceneryScale,sceneryDistanceRange as cinematicSceneryRange,registerSceneryDistanceSource as registerCinematicSceneryLod} from './scenery-distance-state.js';

// Inherited by the existing authored-placement world proxies. No global game
// preference is overwritten and no scene/mesh scan runs in the frame loop.
const {owner:override,sources}=sceneryDistanceState;
const validPercent=value=>typeof value==='number'&&Number.isInteger(value)&&value>=100&&value<=240;
function invalidate(world){
 if(world.villageVisibility)world.villageVisibility.timer=0;
 if(world.villageOutlines)world.villageOutlines.next=0;
 if(world.villageStreaming){world.villageStreaming.next=0;world.villageStreaming.demand?.invalidate();}
 if(world.caveFog?.coverDistanceEye)world.caveFog.coverDistanceEye.fill(NaN);
}
function scaleMesh(owner,mesh){
 if(mesh.isDisposed?.())return;
 let saved=owner.lods.get(mesh);if(!saved){saved=new Map();owner.lods.set(mesh,saved);}
 const scale=owner.percent/100;
 for(const level of mesh.getLODLevels()){
  const key='distanceOrScreenCoverage' in level?'distanceOrScreenCoverage':'distance';
  if(!Number.isFinite(level[key]))continue;
  if(!saved.has(level))saved.set(level,{key,value:level[key]});
  const original=saved.get(level).value;
  level[key]=mesh.useLODScreenCoverage?original/(scale*scale):original*scale;
 }
 // The public setter re-sorts native levels after a late tier joins a source.
 mesh.useLODScreenCoverage=mesh.useLODScreenCoverage;
}
export function acquireCinematicSceneryDistance(world,{isCurrent=()=>true}={}){
 if(!world?.scene)throw new TypeError('Scenery distance requires the current world');
 const origin=snapshot(world),owner={world,isCurrent,closed:false,percent:undefined,saved:null,lastAssignedFog:null,lods:new Map()};
 owner.applyMesh=mesh=>scaleMesh(owner,mesh);
 function restore(){
  if(world[override]!==owner)return false;
  delete world[override];
  const {saved}=owner,current=same(world,saved);
  // Old objects may still be retiring after a map handoff. Clean only the
  // sources that retain this owner's original stamp, never a reused new source.
  for(const [mesh,levels]of owner.lods)if(!mesh.isDisposed?.()&&sameStamp(sources.get(world)?.get(mesh),saved)){for(const [level,value]of levels)if(mesh.getLODLevels().includes(level))level[value.key]=value.value;mesh.useLODScreenCoverage=mesh.useLODScreenCoverage;}
  // A character reload can retain the map while invalidating the tool lease.
  // Retire only our still-owned atmosphere; never overwrite another owner's
  // fog, a replacement map, or a later generation's camera state.
  const fog=owner.lastAssignedFog,fogOwned=sameSource(world,saved)&&fog&&world.scene.fogStart===fog.start&&world.scene.fogEnd===fog.end;
  if(fogOwned){world.scene.fogStart=saved.fogStart;world.scene.fogEnd=saved.fogEnd;}
  if(current)world.camera.maxZ=saved.maxZ;
  owner.lods.clear();owner.saved=null;owner.lastAssignedFog=null;owner.percent=undefined;if(current||fogOwned)invalidate(world);return current;
 }
 const api={
  apply(percent){
   if(percent!==undefined&&!validPercent(percent))throw new RangeError('Cutscene scenery distance must be an integer from100 to240');
   if(owner.closed||!same(world,origin)||isCurrent()===false)return false;
   if(percent===undefined){restore();return true;}
   if(world[override]&&world[override]!==owner)world[override].api.release();
   if(!owner.saved){
    const saved=snapshot(world),selected=world.mapId==='great-plains'&&Number.isFinite(world.plainsViewDistance)&&world.plainsViewDistance>=1&&world.plainsViewDistance<=2.4?world.plainsViewDistance:1;
    Object.assign(saved,{fogStart:world.scene.fogStart,fogEnd:world.scene.fogEnd,fogBaseStart:world.scene.fogStart/selected,fogBaseEnd:world.scene.fogEnd/selected,maxZ:world.camera.maxZ});owner.saved=saved;
   }
   if(world[override]===owner&&owner.percent===percent)return true;
   owner.percent=percent;world[override]=owner;
   const range=cinematicSceneryRange(world);world.scene.fogStart=range.fogStart;world.scene.fogEnd=range.fogEnd;owner.lastAssignedFog={start:range.fogStart,end:range.fogEnd};world.camera.maxZ=Math.max(owner.saved.maxZ??0,range.meshCull+32,range.fogEnd+32);
   for(const [mesh,value]of sources.get(world)??[]){if(mesh.isDisposed?.()){sources.get(world).delete(mesh);continue;}if(sameSource(world,value))scaleMesh(owner,mesh);}
   invalidate(world);return true;
  },
  release(){if(owner.closed)return false;owner.closed=true;return restore();},
  inspect(){return {active:world[override]===owner&&!owner.closed,percent:owner.percent??null,scale:(owner.percent??100)/100,lodSources:owner.lods.size,mapId:origin.mapId,rafOwned:false,observerOwned:false};},
 };
 owner.api=api;return api;
}
