import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from './village-plains-outskirts.js';
import {PLAINS_PLACEMENTS} from './great-plains-layout.js';
import {FOREST_PLACEMENTS} from './monster-forest-layout.js';
import {CAVE_PLACEMENTS} from './witch-cave-layout.js';
import {CHAPTER_POINTS} from './chapter-quest-points.js';

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
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function revision(value){let hash=0xcbf29ce484222325n;for(const char of canonical(value)){hash^=BigInt(char.codePointAt(0));hash=BigInt.asUintN(64,hash*0x100000001b3n);}return 'base-v1-'+hash.toString(16).padStart(16,'0');}

export function createBasePlacementManifest(mapId,{catalog,placements=layouts[mapId]}={}){
 if(!PLACEMENT_MAPS.includes(mapId)||!Array.isArray(placements))fail('mapId','unsupported map');
 const seen=new Set(),instances=placements.map(source=>{
  if(seen.has(source.id))fail('base.instanceId','duplicate authored ID: '+source.id);seen.add(source.id);
  const candidates=catalogEntries(catalog).filter(entry=>entry.assetId===source.asset),entry=candidates.find(entry=>entry.runtime?.manifest?.endsWith('/'+mapId+'.json'))??candidates[0];
  const yaw=source.yaw??0;
  return {instanceId:source.id,assetId:source.asset,assetVersion:entry?.version??entry?.assetVersion??'base-layout',readOnly:true,reason:source.pad||source.essentialStructural||['wall','building','fence'].includes(source.kind)?'Base terrain pads, structures or baked collision require regenerated derived data.':'The immutable base map is preserved; create an independent overlay copy to edit.',transform:{position:[source.x,source.elevation??0,source.z],rotation:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],scale:source.scale??1},source:copy(source)};
 });
 const protectedIds=[...seen,...CHAPTER_POINTS.filter(point=>point.map===mapId).map(point=>point.id)];
 return {version:1,mapId,coordinateSystem:PLACEMENT_COORDINATE_SYSTEM,baseRevision:revision({mapId,instances}),instances,protectedIds:[...new Set(protectedIds)]};
}
export function createEmptyPlacementDocument(baseManifest){return {version:1,mapId:baseManifest.mapId,baseRevision:baseManifest.baseRevision,revision:0,coordinateSystem:PLACEMENT_COORDINATE_SYSTEM,instances:[]};}

export function validatePlacementDocument(document,{catalog,baseManifest,expectedRevision,maxInstances=128}={}){
 object(document,'document',['version','mapId','baseRevision','revision','coordinateSystem','instances']);
 if(document.version!==1)fail('version','unsupported document version');
 if(!PLACEMENT_MAPS.includes(document.mapId))fail('mapId','unsupported map');
 if(document.coordinateSystem!==PLACEMENT_COORDINATE_SYSTEM)fail('coordinateSystem','expected '+PLACEMENT_COORDINATE_SYSTEM);
 if(typeof document.baseRevision!=='string'||!/^base-v1-[0-9a-f]{16}$/.test(document.baseRevision))fail('baseRevision','invalid base revision');
 if(!Number.isSafeInteger(document.revision)||document.revision<0)fail('revision','expected a nonnegative safe integer');
 if(expectedRevision!==undefined&&document.revision!==expectedRevision)fail('revision','document revision conflict','REVISION_CONFLICT');
 baseManifest??=createBasePlacementManifest(document.mapId,{catalog});
 if(baseManifest.mapId!==document.mapId||baseManifest.baseRevision!==document.baseRevision)fail('baseRevision','base map revision conflict','BASE_REVISION_CONFLICT');
 if(!Array.isArray(document.instances)||document.instances.length>maxInstances)fail('instances',`expected at most ${maxInstances} instances`);
 const protectedIds=new Set(baseManifest.protectedIds??baseManifest.instances.map(row=>row.instanceId)),baseIds=new Set(baseManifest.instances.map(row=>row.instanceId)),seen=new Set();
 const instances=document.instances.map((instance,index)=>{
  const path=`instances[${index}]`;object(instance,path,['instanceId','assetId','assetVersion','transform','attachment','collision']);
  const instanceId=identifier(instance.instanceId,path+'.instanceId');
  if(seen.has(instanceId)||protectedIds.has(instanceId))fail(path+'.instanceId','duplicate or protected base/quest ID');seen.add(instanceId);
  const assetId=identifier(instance.assetId,path+'.assetId');
  if(typeof instance.assetVersion!=='string'||instance.assetVersion.length>200)fail(path+'.assetVersion','invalid asset version');
  const asset=placementCatalogAsset(catalog,assetId,instance.assetVersion),placement=asset.placement;
  if(asset.reviewStatus!=='approved'||!placement?.supported||placement.baked||placement.collision==='structural-baked')fail(path+'.assetId',placement?.reason??'asset is not an approved editable independent prop','READ_ONLY_ASSET');
  object(instance.transform,path+'.transform',['position','rotation','scale']);
  const position=vector(instance.transform.position,3,path+'.transform.position'),rotation=vector(instance.transform.rotation,4,path+'.transform.rotation',1),length=Math.hypot(...rotation);
  if(Math.abs(length-1)>1e-5)fail(path+'.transform.rotation','expected a normalized quaternion');
  const scale=finite(instance.transform.scale,path+'.transform.scale',100);
  if(scale<(placement.scaleMin??.1)||scale>(placement.scaleMax??10))fail(path+'.transform.scale','outside approved uniform scale range');
  object(instance.attachment,path+'.attachment',['surface','normal','offset','supportId']);
  const {surface}=instance.attachment;
  if(!['ground','wall','ceiling','free'].includes(surface)||(surface!=='free'&&!placement.surfaces?.includes(surface)))fail(path+'.attachment.surface','unsupported surface');
  const normal=vector(instance.attachment.normal,3,path+'.attachment.normal',1);
  if(Math.abs(Math.hypot(...normal)-1)>1e-5)fail(path+'.attachment.normal','expected a normalized surface normal');
  if(surface==='ground'&&normal[1]<.3||surface==='wall'&&Math.abs(normal[1])>.8||surface==='ceiling'&&normal[1]>-.3)fail(path+'.attachment.normal','normal does not match surface type');
  const offset=finite(instance.attachment.offset,path+'.attachment.offset',20),supportId=instance.attachment.supportId??(surface==='ground'?'terrain':null);
  if(surface==='free'&&instance.attachment.supportId!==undefined&&instance.attachment.supportId!==null)fail(path+'.attachment.supportId','free placement must not retain a support reference');
  if(surface!=='free'&&supportId!=='terrain'&&!baseIds.has(supportId))fail(path+'.attachment.supportId','support must be terrain or an immutable base placement; overlay parenting is unsupported');
  if((surface==='wall'||surface==='ceiling')&&supportId==='terrain')fail(path+'.attachment.supportId','wall/ceiling requires an immutable base mesh support');
  if(!['solid','none'].includes(instance.collision))fail(path+'.collision','expected solid or none');
  if(instance.collision==='solid'&&(surface!=='ground'||placement.collision!=='independent-static'||placement.solidSurfaces&&!placement.solidSurfaces.includes(surface)))fail(path+'.collision','solid collision is certified only for ground-attached independent props');
  return {instanceId,assetId,assetVersion:instance.assetVersion,transform:{position,rotation,scale},attachment:{surface,normal,offset,...(supportId?{supportId}:{})},collision:instance.collision};
 });
 return {...copy(document),instances};
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
