import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from './village-plains-outskirts.js';
import {PLAINS_PLACEMENTS} from './great-plains-layout.js';
import {FOREST_PLACEMENTS} from './monster-forest-layout.js';
import {CAVE_PLACEMENTS} from './witch-cave-layout.js';
import {CHAPTER_POINTS} from './chapter-quest-points.js';
import {editableBasePlacement} from './editable-asset-index.js';
import {normalizeInteraction} from './interaction-data.js';
import {ITEM_DROP_MODELS} from './item-drop-data.js';
import {normalizeChestItems} from './chest-reward-data.js';

export const PLACEMENT_COORDINATE_SYSTEM='RH_Y_UP_METRES';
export const PLACEMENT_MAPS=Object.freeze(['village','great-plains','monster-forest','witch-cave']);
const layouts={village:[...VILLAGE_PLACEMENTS,...VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS],'great-plains':PLAINS_PLACEMENTS,'monster-forest':FOREST_PLACEMENTS,'witch-cave':CAVE_PLACEMENTS};
const copy=value=>structuredClone(value);
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
export class PlacementValidationError extends Error {
 constructor(path,message,code='INVALID_PLACEMENT'){super(`${path}: ${message}`);this.name='PlacementValidationError';this.path=path;this.code=code;}
}
const fail=(path,message,code)=>{throw new PlacementValidationError(path,message,code);};
function object(value,path,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(path,'expected a plain object');
 for(const key of Object.keys(value))if(!keys.includes(key))fail(path+'.'+key,'unknown field');
}
function finite(value,path,max=10000){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>max)fail(path,`expected a finite number within ±${max}`);return value;}
function vector(value,length,path,max=10000){if(!Array.isArray(value)||value.length!==length)fail(path,`expected ${length} numbers`);return value.map((n,i)=>finite(n,`${path}[${i}]`,max));}
function identifier(value,path){if(typeof value!=='string'||!idPattern.test(value))fail(path,'invalid stable ID');return value;}
function catalogEntries(catalog){return Array.isArray(catalog)?catalog:catalog?.entries??[];}
export function placementCatalogAsset(catalog,assetId,version){
 const entries=catalogEntries(catalog).filter(entry=>entry.assetId===assetId&&(version===undefined||(entry.version??entry.assetVersion)===version));
 if(entries.length!==1)fail('assetVersion',entries.length?'ambiguous asset version':'unknown asset ID/version','ASSET_VERSION_CONFLICT');
 return entries[0];
}
function fingerprintNumber(value){const scaled=value*1e6,lower=Math.floor(scaled);return (Math.abs(scaled-lower-.5)<1e-5?lower+1:Math.round(scaled))/1e6;}
function canonical(value,quantize=false){if(Array.isArray(value))return '['+value.map(item=>canonical(item,quantize)).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],quantize)).join(',')+'}';return JSON.stringify(quantize&&typeof value==='number'&&Number.isFinite(value)?fingerprintNumber(value):value);}
function revision(value,quantize=false){let hash=0xcbf29ce484222325n;for(const char of canonical(value,quantize)){hash^=BigInt(char.codePointAt(0));hash=BigInt.asUintN(64,hash*0x100000001b3n);}return 'base-v1-'+hash.toString(16).padStart(16,'0');}
// Audited 2026-11-05: the supplied work's 15 touched native sources match the
// current layout exactly and all actual terrain supports validate. These two
// old fingerprints are compatible ONLY with this exact canonical layout. A
// later structural/asset/layout change must fail closed rather than rebase it.
function compatiblePlainsRevision(base,previous){return base.mapId==='great-plains'&&base.baseRevision==='base-v1-6fc3db2cf9acf956'&&['base-v1-b2818f0d0797c28a','base-v1-765c947dda5b0795'].includes(previous);}

export function basePlacementEditability(mapId,source,asset){
 return editableBasePlacement(mapId,source,asset);
}

export function createBasePlacementManifest(mapId,{catalog,placements=layouts[mapId]}={}){
 if(!PLACEMENT_MAPS.includes(mapId)||!Array.isArray(placements))fail('mapId','unsupported map');
 const seen=new Set(),instances=placements.map(source=>{
  if(seen.has(source.id))fail('base.instanceId','duplicate authored ID: '+source.id);seen.add(source.id);
  const candidates=catalogEntries(catalog).filter(entry=>entry.assetId===source.asset),entry=candidates.find(entry=>entry.runtime?.manifest?.endsWith('/'+mapId+'.json'))??candidates[0];
  const yaw=source.yaw??0;
  return {instanceId:source.id,assetId:source.asset,assetVersion:entry?.version??entry?.assetVersion??'base-layout',readOnly:true,reason:source.pad||source.essentialStructural||['wall','building','fence'].includes(source.kind)?'Base terrain pads, structures or baked collision require regenerated derived data.':'The immutable base map is preserved; create an independent overlay copy to edit.',transform:{position:[source.x,source.elevation??0,source.z],rotation:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],scale:source.scale??1},source:copy(source)};
 });
 // Editor capabilities do not change the immutable-layout revision. Old saved
 // overlays still refer to the exact same source transforms and stable IDs.
 // Procedural plains coordinates may differ in insignificant final bits across
 // JS engines. Quantize only fingerprint inputs, never geometry or saved poses.
 // Other maps retain their existing revision contract and saved-work format.
 const baseRevision=revision({mapId,instances},mapId==='great-plains');
 for(const instance of instances){const asset=catalogEntries(catalog).find(entry=>entry.assetId===instance.assetId&&(entry.version??entry.assetVersion)===instance.assetVersion),policy=basePlacementEditability(mapId,instance.source,asset);Object.assign(instance,policy,{readOnly:!policy.editable});}
 const protectedIds=[...seen,...CHAPTER_POINTS.filter(point=>point.map===mapId).map(point=>point.id)];
 return {version:1,mapId,coordinateSystem:PLACEMENT_COORDINATE_SYSTEM,baseRevision,instances,protectedIds:[...new Set(protectedIds)]};
}
export function createEmptyPlacementDocument(baseManifest){return {version:1,mapId:baseManifest.mapId,baseRevision:baseManifest.baseRevision,revision:0,coordinateSystem:PLACEMENT_COORDINATE_SYSTEM,instances:[]};}

// Uniform editing preserves a native length/depth aspect, but aspect metadata
// must never bypass the same effective size budget as ordinary uniform scale.
export function placementScaleRange(asset,source,aspect=[1,1,1]){
 const placement=asset.placement,scale=source?(source.scale??1):0,unit=asset.units?.metersPerSourceUnit??1,size=asset.bounds?.size??[],native=source?[source.length&&size[0]?source.length/(size[0]*unit):scale,scale,source.depth&&size[2]?source.depth/(size[2]*unit):scale]:[0,0,0],max=placement.scaleMax??10;
 return {min:Math.min(placement.scaleMin??.1,source?scale*.1:Infinity),max:Math.min(Math.max(max,scale),...aspect.map((ratio,index)=>Math.max(max,native[index])/ratio))};
}

export function validatePlacementDocument(document,{catalog,baseManifest,expectedRevision,maxInstances=128}={}){
 object(document,'document',['version','mapId','baseRevision','revision','coordinateSystem','instances','removedBaseIds','terrainPatches']);
 if(document.version!==1)fail('version','unsupported document version');
 if(!PLACEMENT_MAPS.includes(document.mapId))fail('mapId','unsupported map');
 if(document.coordinateSystem!==PLACEMENT_COORDINATE_SYSTEM)fail('coordinateSystem','expected '+PLACEMENT_COORDINATE_SYSTEM);
 if(typeof document.baseRevision!=='string'||!/^base-v1-[0-9a-f]{16}$/.test(document.baseRevision))fail('baseRevision','invalid base revision');
 if(!Number.isSafeInteger(document.revision)||document.revision<0)fail('revision','expected a nonnegative safe integer');
 if(expectedRevision!==undefined&&document.revision!==expectedRevision)fail('revision','document revision conflict','REVISION_CONFLICT');
 baseManifest??=createBasePlacementManifest(document.mapId,{catalog});
 if(baseManifest.mapId!==document.mapId||baseManifest.baseRevision!==document.baseRevision&&!compatiblePlainsRevision(baseManifest,document.baseRevision))fail('baseRevision','base map revision conflict','BASE_REVISION_CONFLICT');
 if(!Array.isArray(document.instances)||document.instances.length>maxInstances)fail('instances',`expected at most ${maxInstances} instances`);
 if(document.terrainPatches!==undefined){
  if(!Array.isArray(document.terrainPatches)||document.terrainPatches.length>32)fail('terrainPatches','expected at most 32 terrain patches');
  if(document.mapId==='witch-cave'&&document.terrainPatches.length)fail('terrainPatches','동굴 지형은 평탄화를 지원하지 않습니다.');
  const patchIds=new Set();for(const [i,patch]of document.terrainPatches.entries()){
   const path=`terrainPatches[${i}]`;object(patch,path,['id','x','z','halfWidth','halfDepth','height','blend']);identifier(patch.id,path+'.id');if(patchIds.has(patch.id))fail(path+'.id','duplicate patch ID');patchIds.add(patch.id);
   for(const key of ['x','z','height'])finite(patch[key],path+'.'+key,200);
   for(const key of ['halfWidth','halfDepth'])if(finite(patch[key],path+'.'+key,30)<.5)fail(path+'.'+key,'expected at least 0.5');
   if(finite(patch.blend,path+'.blend',15)<.5)fail(path+'.blend','expected at least 0.5');
  }
 }
 const protectedIds=new Set(baseManifest.protectedIds??baseManifest.instances.map(row=>row.instanceId)),baseRows=new Map(baseManifest.instances.map(row=>[row.instanceId,row])),baseIds=new Set(baseRows.keys()),seen=new Set();
 const removedBaseIds=document.removedBaseIds??[];
 if(!Array.isArray(removedBaseIds)||removedBaseIds.length>baseRows.size)fail('removedBaseIds','expected original placement IDs');
 const removed=new Set();for(const id of removedBaseIds){identifier(id,'removedBaseIds');if(removed.has(id)||!baseRows.get(id)?.editable)fail('removedBaseIds','duplicate or noneditable original placement');removed.add(id);}
 const instances=document.instances.map((instance,index)=>{
  const path=`instances[${index}]`;object(instance,path,['instanceId','assetId','assetVersion','transform','attachment','collision','sourceInstanceId','interaction','chest']);
  const instanceId=identifier(instance.instanceId,path+'.instanceId');
  const sourceInstanceId=instance.sourceInstanceId===undefined?undefined:identifier(instance.sourceInstanceId,path+'.sourceInstanceId'),source=sourceInstanceId===undefined?null:baseRows.get(sourceInstanceId);
  if(sourceInstanceId!==undefined){if(sourceInstanceId!==instanceId)fail(path+'.sourceInstanceId','base replacement must keep its original stable ID');if(!source?.editable)fail(path+'.sourceInstanceId',source?.reason??'unknown or locked base placement','READ_ONLY_BASE');if(instance.assetId!==source.assetId||instance.assetVersion!==source.assetVersion)fail(path+'.assetId','base replacement must retain its source asset and version');}
  if(seen.has(instanceId)||removed.has(instanceId)||(protectedIds.has(instanceId)&&!source))fail(path+'.instanceId','duplicate or protected/removed base ID');seen.add(instanceId);
  const assetId=identifier(instance.assetId,path+'.assetId');
  if(typeof instance.assetVersion!=='string'||instance.assetVersion.length>200)fail(path+'.assetVersion','invalid asset version');
  const asset=placementCatalogAsset(catalog,assetId,instance.assetVersion),placement=asset.placement;
  if(!placement?.supported||placement.baked||placement.collision==='structural-baked')fail(path+'.assetId',placement?.reason??'asset does not support static object placement','READ_ONLY_ASSET');
  object(instance.transform,path+'.transform',['position','rotation','scale','aspect','frontYaw']);
  const position=vector(instance.transform.position,3,path+'.transform.position'),rotation=vector(instance.transform.rotation,4,path+'.transform.rotation',1),length=Math.hypot(...rotation);
  if(Math.abs(length-1)>1e-5)fail(path+'.transform.rotation','expected a normalized quaternion');
  const scale=finite(instance.transform.scale,path+'.transform.scale',100);
  const aspect=instance.transform.aspect===undefined?undefined:vector(instance.transform.aspect,3,path+'.transform.aspect',100);if(aspect?.some(value=>value<=0))fail(path+'.transform.aspect','expected positive native aspect ratios');
  const frontYaw=instance.transform.frontYaw===undefined?undefined:finite(instance.transform.frontYaw,path+'.transform.frontYaw');
  const scaleRange=placementScaleRange(asset,source?.source,aspect);if(scale+1e-6<scaleRange.min||scale-1e-6>scaleRange.max)fail(path+'.transform.scale','outside approved uniform scale range');
  object(instance.attachment,path+'.attachment',['surface','normal','offset','supportId']);
  const {surface}=instance.attachment;
  if(!['ground','wall','ceiling','free'].includes(surface)||(surface!=='free'&&!placement.surfaces?.includes(surface)))fail(path+'.attachment.surface','unsupported surface');
  const normal=vector(instance.attachment.normal,3,path+'.attachment.normal',1);
  if(Math.abs(Math.hypot(...normal)-1)>1e-5)fail(path+'.attachment.normal','expected a normalized surface normal');
  if(surface==='ground'&&normal[1]<.3||surface==='wall'&&Math.abs(normal[1])>.8||surface==='ceiling'&&normal[1]>-.3)fail(path+'.attachment.normal','normal does not match surface type');
  const offset=finite(instance.attachment.offset,path+'.attachment.offset',source?200:20),supportId=instance.attachment.supportId??(surface==='ground'?'terrain':null);
  if(surface==='free'&&instance.attachment.supportId!==undefined&&instance.attachment.supportId!==null)fail(path+'.attachment.supportId','free placement must not retain a support reference');
  if(surface!=='free'&&supportId!=='terrain'&&(!baseIds.has(supportId)||removed.has(supportId)))fail(path+'.attachment.supportId','support must be terrain or an existing base placement; removed supports are unavailable');
  if((surface==='wall'||surface==='ceiling')&&supportId==='terrain')fail(path+'.attachment.supportId','wall/ceiling requires an immutable base mesh support');
  if(!['solid','none'].includes(instance.collision))fail(path+'.collision','expected solid or none');
  if(instance.collision==='solid'&&(surface!=='ground'||placement.collision!=='independent-static'||placement.solidSurfaces&&!placement.solidSurfaces.includes(surface)))fail(path+'.collision','solid collision is certified only for ground-attached independent props');
  let interaction;try{interaction=normalizeInteraction(instance.interaction);}catch(error){fail(path+'.interaction',error.message);}
  let chest;if(instance.chest!==undefined){if(assetId!=='chest-common')fail(path+'.chest','chest settings require a chest');object(instance.chest,path+'.chest',['tier','item','items']);const {tier,item=''}=instance.chest;if(!Number.isInteger(tier)||tier<1||tier>5)fail(path+'.chest.tier','expected chest grade 1 to 5');if(typeof item!=='string'||item!==''&&!Object.hasOwn(ITEM_DROP_MODELS,item))fail(path+'.chest.item','unknown chest reward');let items;try{items=normalizeChestItems(instance.chest.items);}catch(error){fail(path+'.chest.items',error.message);}chest={tier,item,...(items!==undefined?{items}:{})};}
  return {instanceId,assetId,assetVersion:instance.assetVersion,transform:{position,rotation,scale,...(aspect?{aspect}:{}),...(frontYaw!==undefined?{frontYaw}:{})},attachment:{surface,normal,offset,...(supportId?{supportId}:{})},collision:instance.collision,...(sourceInstanceId!==undefined?{sourceInstanceId}:{}),...(interaction?{interaction}:{}),...(chest?{chest}:{})};
 });
 const overridden=new Set(instances.map(instance=>instance.sourceInstanceId).filter(Boolean));for(const instance of instances)if(overridden.has(instance.attachment.supportId))fail('attachment.supportId','이 소품에 붙인 장식을 먼저 옮겨 주세요. 편집 중인 기존 소품은 고정 지지면으로 사용할 수 없어요.');
 return {...copy(document),baseRevision:baseManifest.baseRevision,instances};
}

export class PlacementHistory {
 constructor(document,{catalog,baseManifest,maxEntries=100}={}){this.options={catalog,baseManifest};this.maxEntries=Math.max(2,Math.min(1000,Math.floor(maxEntries)));this.snapshots=[validatePlacementDocument(document,this.options)];this.index=0;this.current=copy(this.snapshots[0]);}
 get document(){return copy(this.current);}
 get canUndo(){return this.index>0;}
 get canRedo(){return this.index+1<this.snapshots.length;}
 commit(next,{expectedRevision=this.current.revision}={}){
  if(expectedRevision!==this.current.revision)fail('revision','history revision conflict','REVISION_CONFLICT');
  const document=validatePlacementDocument({...next,revision:this.current.revision+1},this.options);
  this.snapshots.splice(this.index+1);this.snapshots.push(copy(document));if(this.snapshots.length>this.maxEntries)this.snapshots.shift();this.index=this.snapshots.length-1;this.current=document;return this.document;
 }
 undo(){if(!this.canUndo)return this.document;this.index--;this.current={...copy(this.snapshots[this.index]),revision:this.current.revision+1};return this.document;}
 redo(){if(!this.canRedo)return this.document;this.index++;this.current={...copy(this.snapshots[this.index]),revision:this.current.revision+1};return this.document;}
}
