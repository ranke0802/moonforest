import {ASSET_CATALOG} from './asset-catalog.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';

function keyHash(value){let a=2166136261,b=2246822519;for(const char of value){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b^char.charCodeAt(0),3266489917);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export function cinematicDefinitionId(entry){return 'cinematic.'+entry.assetId.slice(0,40)+'.'+keyHash(entry.assetId+'@'+entry.version);}
// Metadata only. A new deployed manifest/catalog entry automatically becomes a
// visual choice; no model request or combat actor is created by this import.
export function getCinematicDefinitions(catalog=ASSET_CATALOG){
 const definitions={...ACTOR_DEFINITIONS};
 for(const entry of catalog.entries){
  if(Object.values(definitions).some(def=>def.assetId===entry.assetId&&def.assetVersion===entry.version))continue;
  const id=cinematicDefinitionId(entry);if(definitions[id])throw new Error('Cinematic definition ID conflict');
  definitions[id]={definitionVersion:1,actorDefinitionId:id,label:entry.name??entry.assetId,assetId:entry.assetId,assetVersion:entry.version,category:entry.category,cinematic:true,cinematicStatic:![entry.geometry,...(entry.geometry.lods??[])].some(level=>level.skinned||level.clips||level.morphTargets),encounterType:'cinematic-visual',animation:{...Object.fromEntries((entry.geometry.clipNames??[]).filter(Boolean).map(name=>[name,name])),...(entry.npc?.defaultClip?{idle:entry.npc.defaultClip}:{})},population:{maxPooled:20,idleSeconds:30,estimatedBytes:Math.max(1024*1024,(entry.geometry.vertices??0)*64+(entry.geometry.bones??0)*64)},runtime:entry.runtime,bounds:entry.bounds};
 }
 return definitions;
}
export function listCinematicAssets(catalog=ASSET_CATALOG){return Object.values(getCinematicDefinitions(catalog)).flatMap(definition=>{const entry=catalog.entries.find(row=>row.assetId===definition.assetId&&row.version===definition.assetVersion);return entry?[{assetId:entry.assetId,version:entry.version,assetVersion:entry.version,category:definition.category,label:definition.label,actorDefinitionId:definition.actorDefinitionId,contentHash:entry.contentHash,entry}]:[];});}

// Private capability view for the unpublished runtime: free visuals only.
// Canonical catalog review/publish/collision eligibility is never changed.
export function cinematicStaticCatalog(catalog){return {...catalog,entries:catalog.entries.map(entry=>![entry.geometry,...(entry.geometry.lods??[])].some(level=>level.skinned||level.clips||level.morphTargets)?{...entry,cinematicVisualOnly:true,sourceReviewStatus:entry.reviewStatus,reviewStatus:'approved',placement:{...entry.placement,supported:true,baked:false,collision:'none',defaultCollision:'none',surfaces:['free'],solidSurfaces:[],reason:null}}:entry)};}
export function cinematicStaticManifest(manifest,url){const single=new URL(url).pathname.split('/').at(-1).replace(/\.json$/,''),assets=manifest.assets??{[single]:manifest};return {...manifest,assets:Object.fromEntries(Object.entries(assets).map(([id,config])=>{const first={...config.lods?.find(row=>row.level===0),level:0,model:config.model??config.lods?.find(row=>row.level===0)?.model??config.lods?.[0]?.model,resources:config.resources??config.lods?.[0]?.resources},lods=[first,...[1,2].map(level=>config.lods?.find(row=>row.level===level)??{...(config.lods?.at(-1)??first),level})];return [id,{...config,geometryLod:true,lods,mobileNear:config.mobileNear??lods[0]}];}))};}
