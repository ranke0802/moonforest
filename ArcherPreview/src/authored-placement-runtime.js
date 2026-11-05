import {TransformNode,Vector3,Quaternion,Ray,VertexBuffer} from '@babylonjs/core';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,placementCatalogAsset,PlacementValidationError} from './placement-document.js';
import {loadMapContainer} from './map-container.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';
import {instantiateStaticMap} from './static-map-instances.js';
import {prepareVillageInstancing} from './village-instancing.js';
import {applyVillageToon} from './village-toon.js';
import {prepareTreeOcclusion,TreeOcclusion} from './tree-occlusion.js';
import {configureVillageSurfaceCulling,installVillageGeometry} from './village-streamed-environment.js';
import {villageLodSources,hasVillageGeometry} from './village-lod.js';
import {VillageGeometryStreaming} from './village-demand.js';
import {VillageTextureStreaming} from './village-texture-streaming.js';
import {VillageVisibility,cellKey} from './village-visibility.js';
import {VillageOutlines} from './village-outlines.js';
import {initializeVillageKtx2} from './village-ktx2.js';
import {initializeVillageMeshopt} from './village-meshopt.js';
import {prepareMapMaterials} from './map-shader-cache.js';
import {villageObstacles} from './village-layout.js';
import {laboratoryLegacySource} from './cave-laboratory-geometry.js';
import {caveFogRootEnabled} from './cave-fog-of-war.js';

const geometry=container=>container.meshes.filter(mesh=>mesh.getTotalVertices?.()>0);
const clone=value=>structuredClone(value);
const CELL=4;

// Inherit every original navigator method, including cave baked clearance.
// Only owned obstacle/index/path-cache fields change on a COMMIT. Eligible
// source colliders can be replaced by exact ID; baked clearance stays intact.
export function createAuthoredPlacementNavigation(base,obstacles,revision,{removedIds=[],force=false}={}){
 const removed=new Set(removedIds);if(!obstacles.length&&!removed.size&&!force)return base;
 const retained=base.obstacles.filter(obstacle=>!removed.has(obstacle.id)),navigation=Object.create(base);navigation.obstacles=[...retained,...obstacles];navigation.grids=new Map();navigation.gridMetadata=new WeakMap();navigation.pathsBuilt=base.pathsBuilt??0;
 if(base.cells){
  navigation.cells=removed.size?new Map():new Map(base.cells);navigation.obstacleCells=new WeakMap();navigation.segmentCellPruningSafe=base.segmentCellPruningSafe;
  if(!removed.size)for(const obstacle of retained){const metadata=base.obstacleCells?.get(obstacle);if(metadata)navigation.obstacleCells.set(obstacle,metadata);}
  for(const [index,obstacle]of (removed.size?navigation.obstacles:obstacles).entries()){
   const extent=obstacle.radius+1.5,minX=Math.floor((obstacle.x-extent)/CELL),minZ=Math.floor((obstacle.z-extent)/CELL);
   navigation.obstacleCells.set(obstacle,{x:minX,z:minZ,order:removed.size?index:retained.length+index});
   for(let x=minX;x<=Math.floor((obstacle.x+extent)/CELL);x++)for(let z=minZ;z<=Math.floor((obstacle.z+extent)/CELL);z++){
    const key=`${x}:${z}`;navigation.cells.set(key,[...(navigation.cells.get(key)??[]),obstacle]);
   }
  }
 }
 const routeRevisions=new WeakMap();
 navigation.steer=function(from,goal,radius,cache,dt,limit){
  if(cache&&routeRevisions.get(cache)!==revision){cache.route=null;cache.age=Infinity;routeRevisions.set(cache,revision);}
  return base.steer.call(this,from,goal,radius,cache,dt,limit);
 };
 return navigation;
}

export class AuthoredPlacementRuntime {
 constructor(world,{catalog,loadContainer=loadMapContainer,readManifest=readMapManifest,initialize=async()=>{await initializeVillageKtx2();await initializeVillageMeshopt();},onCommit=()=>{},limits={},baseUrl,publish=true}={}){
  this.world=world;this.scene=world.scene;this.mapId=world.mapId;this.ground=world.ground;this.catalog=catalog;this.loadContainer=loadContainer;this.readManifest=readManifest;this.initialize=initialize;this.onCommit=onCommit;
  this.publish=publish;this.baseUrl=new URL(baseUrl??import.meta.env?.BASE_URL??'/',globalThis.location?.href??'http://localhost/');
  this.baseManifest=createBasePlacementManifest(this.mapId,{catalog,placements:world.placements});this.document=createEmptyPlacementDocument(this.baseManifest);this.applied=false;
  this.limits={instances:Math.min(128,limits.instances??128),assets:Math.min(8,limits.assets??8)};
  this.records=new Map();this.assets=new Map();this.renderRecords=[];this.previewRecord=null;this.existingPreview=null;this.baseNavigation=world.navigation;this.navigation=null;this.suppressedBase=new Map();this.baseObstacleOwnership=new Map();
  this.controller=new AbortController();this.generation=0;this.request=0;this.previewRequest=0;this.disposed=false;this.lifetimes=new Set();this.pending=new Set();this.stats={commits:0,previews:0,sourceLoads:0,sourceReleases:0,instancesCreated:0,instancesDisposed:0,geometryPending:0};
  this.proxy=Object.create(world);this.proxy.environment=this.stats;
  this.streaming=new VillageGeometryStreaming(this.proxy,this.renderRecords,request=>this._loadTier(this.assets.get(request.id),request.level),request=>{const entry=this.assets.get(request.id);return !entry||!entry.levels.some(level=>level.level===request.level)||hasVillageGeometry(entry,request.level);},this.stats);this.proxy.villageStreaming=this.streaming;this.streaming.active=true;
  this.textureStreaming=new VillageTextureStreaming(this.proxy,this.assets,this.renderRecords,new URL('assets/village.json',this.baseUrl),this.stats);
  const textures=this.textureStreaming,loadTexture=textures.loadTexture.bind(textures),loadTextures=textures.load.bind(textures);
  textures.load=async id=>{const owner=this.assets.get(id);this.textureOwner=owner;try{return await loadTextures(id);}finally{if(this.assets.get(id)!==owner&&textures.resident.has(id))textures.release(id);}};
  textures.loadTexture=(...args)=>this.assets.get(textures.pending)!==this.textureOwner?Promise.reject(mapLoadAbortError()):loadTexture(...args);
  this.observer=this.scene.onBeforeRenderObservable.add(()=>this.update(Math.max(0,this.scene.getEngine().getDeltaTime()/1000),this.lastPlayer));
  this.disposeObserver=this.scene.onDisposeObservable.addOnce(()=>this.dispose());
 }
 _current(generation=this.generation){return !this.disposed&&generation===this.generation&&!this.scene.isDisposed&&this.world.scene===this.scene&&this.world.mapId===this.mapId&&this.world.ground===this.ground;}
 _check(generation){if(!this._current(generation))throw mapLoadAbortError();}
 _baseRecord(id){return this.world.villageRenderRecords?.find(record=>record.placement.id===id);}
 _baseFacing(id){const record=this._baseRecord(id);if(!record?.root||record.root.isDisposed())throw new Error('기존 소품을 준비하고 있어요. 잠시 뒤 다시 선택해 주세요.');return record.facing??record.root.getChildren().find(node=>node.name===record.root.name+'-front')??record.root;}
 _baseVisualFrame(id){return this._baseFacing(id).computeWorldMatrix(true);}
 _originalObstacles(id){
  if(!this.baseObstacleOwnership.has(id)){const source=this.baseManifest.instances.find(row=>row.instanceId===id)?.source,ids=new Set(this.mapId==='village'&&source?villageObstacles([source]).map(obstacle=>obstacle.id):[id]);this.baseObstacleOwnership.set(id,this.baseNavigation.obstacles.filter(obstacle=>ids.has(obstacle.id)||this.mapId==='witch-cave'&&(obstacle.id.startsWith(id+'-post')||obstacle.id.startsWith(id+'-brace'))||this.mapId==='monster-forest'&&id==='witch-cave'&&obstacle.id.startsWith('cave-rock-')));}
  return this.baseObstacleOwnership.get(id);
 }
 createBaseOverride(id){
  this._check();const source=this.baseManifest.instances.find(row=>row.instanceId===id);if(!source?.editable)throw new Error(source?.reason??'이 기존 대상은 편집할 수 없어요.');
  const asset=placementCatalogAsset(this.catalog,source.assetId,source.assetVersion),scale=new Vector3(),rotation=new Quaternion(),position=new Vector3();
  const native=this._baseRecord(id);this._baseVisualFrame(id);
  if(!native.root.computeWorldMatrix(true).decompose(scale,rotation,position)||[scale.x,scale.y,scale.z].some(value=>value<=0))throw new Error('기존 대상의 크기를 읽을 수 없어요.');
  const unit=asset.units.metersPerSourceUnit,ground=this.world.terrain.heightAt(position.x,position.z),aspect=[scale.x/scale.y,1,scale.z/scale.y];
  const nativeFacing=this._baseFacing(id),frontYaw=nativeFacing===native.root?0:nativeFacing.rotation.y;
  const instance={instanceId:id,sourceInstanceId:id,assetId:source.assetId,assetVersion:source.assetVersion,transform:{position:[position.x,ground,position.z],rotation:rotation.normalize().asArray(),scale:scale.y/unit,...(aspect.some(value=>Math.abs(value-1)>1e-6)?{aspect}:{}),...(Math.abs(frontYaw-(asset.forwardYaw??0))>1e-6?{frontYaw}:{})},attachment:{surface:'ground',normal:[0,1,0],offset:position.y-ground,supportId:'terrain'},collision:this._originalObstacles(id).length||this.mapId==='witch-cave'&&asset.placement.defaultCollision!=='none'?'solid':'none'};
  const valid=validatePlacementDocument({...createEmptyPlacementDocument(this.baseManifest),instances:[instance]},{catalog:this.catalog,baseManifest:this.baseManifest}).instances[0];this.validateSurface(valid);return valid;
 }
 _baseCollisionParts(record,instance){
  const original=this._originalObstacles(instance.sourceInstanceId),old=this._baseVisualFrame(instance.sourceInstanceId),next=record.facing.getWorldMatrix();
  if(old.m.every((value,index)=>Math.abs(value-next.m[index])<1e-5))return original.map(obstacle=>({...obstacle,instanceId:instance.instanceId}));
  const inverse=old.clone().invert(),delta=inverse.multiply(next),bx=Vector3.TransformNormal(new Vector3(1,0,0),delta),by=Vector3.TransformNormal(new Vector3(0,1,0),delta),bz=Vector3.TransformNormal(new Vector3(0,0,1),delta),uniform=bx.length(),upright=Math.abs(bx.y)+Math.abs(bz.y)+Math.abs(by.x)+Math.abs(by.z)<1e-5&&Math.abs(bz.length()-uniform)<1e-5&&Math.abs(Vector3.Dot(bx,bz))<1e-5&&by.y>0;
  return original.map(obstacle=>{
   if(upright){const ground=this.world.terrain.heightAt(obstacle.x,obstacle.z),center=Vector3.TransformCoordinates(new Vector3(obstacle.x,ground,obstacle.z),delta),top=Vector3.TransformCoordinates(new Vector3(obstacle.x,ground+(obstacle.height??2),obstacle.z),delta),part={...obstacle,instanceId:instance.instanceId,x:center.x,z:center.z,radius:obstacle.radius*uniform,height:Math.max(0,top.y-this.world.terrain.heightAt(center.x,center.z)),source:'transformed-original-collider'};if(obstacle.shape==='box')Object.assign(part,{halfWidth:obstacle.halfWidth*uniform,halfDepth:obstacle.halfDepth*uniform,yaw:(obstacle.yaw??0)+Math.atan2(-bx.z,bx.x)});return part;}
   const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity),yaw=obstacle.yaw??0,c=Math.cos(yaw),s=Math.sin(yaw),hx=obstacle.shape==='box'?obstacle.halfWidth:obstacle.radius,hz=obstacle.shape==='box'?obstacle.halfDepth:obstacle.radius,ground=this.world.terrain.heightAt(obstacle.x,obstacle.z);
   for(let bits=0;bits<8;bits++){const x=(bits&1?1:-1)*hx,z=(bits&2?1:-1)*hz,point=new Vector3(obstacle.x+c*x+s*z,ground+(bits&4?obstacle.height??2:0),obstacle.z-s*x+c*z);Vector3.TransformCoordinatesToRef(point,inverse,point);Vector3.TransformCoordinatesToRef(point,next,point);min.minimizeInPlace(point);max.maximizeInPlace(point);}
   const center=min.add(max).scale(.5);return {id:obstacle.id,instanceId:instance.instanceId,shape:'box',x:center.x,z:center.z,yaw:0,halfWidth:Math.max(.0001,(max.x-min.x)/2),halfDepth:Math.max(.0001,(max.z-min.z)/2),radius:Math.hypot(max.x-min.x,max.z-min.z)/2,height:Math.max(0,max.y-this.world.terrain.heightAt(center.x,center.z)),source:'transformed-original-collider'};
  });
 }
 _trunkObstacle(record,body){
  const matrix=record.root.getWorldMatrix(),start=Vector3.TransformCoordinates(Vector3.FromArray(body.offset??[0,0,0]),matrix),end=Vector3.TransformCoordinates(Vector3.FromArray(body.offset??[0,0,0]).add(new Vector3(0,body.height,0)),matrix),radius=body.radius*record.instance.transform.scale*Math.max(record.instance.transform.aspect?.[0]??1,record.instance.transform.aspect?.[2]??1);
  if(Math.hypot(end.x-start.x,end.z-start.z)<1e-6)return {id:'authored-'+record.instance.instanceId,instanceId:record.instance.instanceId,x:start.x,z:start.z,radius,height:Math.max(start.y,end.y)-this.world.terrain.heightAt(start.x,start.z),source:'existing-certified-tree-trunk'};
  const x=(start.x+end.x)/2,z=(start.z+end.z)/2,halfWidth=Math.abs(end.x-start.x)/2+radius,halfDepth=Math.abs(end.z-start.z)/2+radius;return {id:'authored-'+record.instance.instanceId,instanceId:record.instance.instanceId,shape:'box',x,z,yaw:0,halfWidth,halfDepth,radius:Math.hypot(halfWidth,halfDepth),height:Math.max(start.y,end.y)+radius-this.world.terrain.heightAt(x,z),source:'conservative-tilted-tree-trunk'};
 }
 _suppressBase(ids){
  const wanted=new Set(ids);for(const [record,previous]of this.suppressedBase)if(!wanted.has(record.placement.id)){if(record.authoredSuppressionOwner===this){if(previous===undefined)delete record.authoredSuppressed;else record.authoredSuppressed=previous;delete record.authoredSuppressionOwner;if(!record.root.isDisposed())record.root.setEnabled(caveFogRootEnabled(record));}this.suppressedBase.delete(record);}
  for(const id of wanted){const record=this._baseRecord(id);if(!record||this.suppressedBase.has(record))continue;this.suppressedBase.set(record,record.authoredSuppressed);record.authoredSuppressionOwner=this;record.authoredSuppressed=true;record.root.setEnabled(false);const visibility=this.world.villageVisibility;visibility?.shadowFade?.active.delete(record);visibility?.shadowFade?.desired.delete(record);visibility?.castRecords?.delete(record);record.shadowCaster=false;for(const mesh of record.meshes){visibility?.cast?.delete(mesh);this.world.shadows?.removeShadowCaster(mesh,false);}}
  const visibility=this.world.villageVisibility;if(visibility){visibility.timer=0;visibility.shadowTimer=0;}if(this.world.villageOutlines)this.world.villageOutlines.next=0;
 }
 _key(instance){return instance.assetId+'@'+instance.assetVersion;}
 async _acquire(instance){
  const key=this._key(instance);let entry=this.assets.get(key);
  if(!entry){
   if(this.assets.size>=this.limits.assets)throw new Error('Placement asset cache limit reached');
   const catalog=placementCatalogAsset(this.catalog,instance.assetId,instance.assetVersion);
   entry={key,catalog,config:null,levels:[],tiers:new Map(),baseLevel:Infinity,containers:new Set(),refs:0,disposed:false,controller:new AbortController(),loads:new Map()};this.assets.set(key,entry);
   const generation=this.generation;
   entry.pending=(async()=>{
    const lifetime=new MapLoadLifetime({signal:entry.controller.signal,stage:'placement-manifest'});this.lifetimes.add(lifetime);
    try{
     this._check(generation);this.initialized??=this.initialize();await lifetime.wait(this.initialized);this._check(generation);
     entry.url=new URL(catalog.runtime.manifest,this.baseUrl);const manifest=await lifetime.wait(this.readManifest(entry.url));this._check(generation);
     const config=manifest.assets?.[catalog.runtime.assetKey];if(!config)throw new Error('Placement asset missing from runtime manifest');
     if(new URL(config.lods?.[0]?.model??config.model,entry.url).href!==new URL(catalog.runtime.model,this.baseUrl).href)throw new Error('Placement catalog/runtime asset version conflict');
     entry.config=config;entry.levels=config.geometryLod?villageLodSources(config,this.world.touchDevice):config.lods?.length?config.lods:[{...config,level:0}];
     await this._loadTier(entry,0);this._check(generation);return entry;
    }finally{lifetime.close();this.lifetimes.delete(lifetime);}
   })();entry.pending.catch(()=>{});
  }
  entry.refs++;
  try{await entry.pending;this._check();return entry;}catch(error){this._release(entry);throw error;}
 }
 async _loadTier(entry,level){
  if(!entry||entry.disposed)throw mapLoadAbortError();
  if(hasVillageGeometry(entry,level))return;
  if(entry.loads.has(level))return entry.loads.get(level);
  const config=entry.levels.find(row=>row.level===level);if(!config)throw new Error('Placement LOD is unavailable: '+level);
  const generation=this.generation,lifetime=new MapLoadLifetime({signal:entry.controller.signal,stage:'model'});this.lifetimes.add(lifetime);
  const pending=(async()=>{
   let container;
   try{
    this._check(generation);const model=new URL(config.model,entry.url);
    await lifetime.run(()=>this.world.prefetchResources?.(config.resources,{initial:false}));
    container=await lifetime.run(()=>this.loadContainer(model,this.scene,{signal:lifetime.signal,lifetime}),{onLate:value=>value?.dispose()});
    this._check(generation);lifetime.check();if(entry.disposed)throw mapLoadAbortError();
    if(container.skeletons?.length||container.animationGroups?.length||container.morphTargetManagers?.length)throw new Error('Editable placement asset must be static');
    const meshes=geometry(container);if(!meshes.length)throw new Error('Editable placement asset has no geometry');
    if(this.world.cave&&entry.config.category==='rock')for(const mesh of meshes)if(mesh.material)mesh.material.metadata={...mesh.material.metadata,caveRockTone:true,caveRockPaletteOnly:entry.config.surfaceStyle==='cave-palette',caveLegacyLaboratoryClip:laboratoryLegacySource(entry.catalog.assetId)};
    prepareVillageInstancing(meshes);applyVillageToon(meshes,this.world.lighting);prepareTreeOcclusion(meshes);
    for(const mesh of meshes){
     if(mesh.skeleton||mesh.morphTargetManager||mesh.hasThinInstances)throw new Error('Unsupported deformed placement mesh');
     mesh.isPickable=false;mesh.metadata={...mesh.metadata,villageLodLevel:level};configureVillageSurfaceCulling(mesh,{cave:this.world.cave,assetId:entry.catalog.assetId,category:entry.config.category});
     this.world.caveAtmosphere?.attachMaterial(mesh.material);this.world.caveFog?.attach(mesh.material);
    }
    this.world.lighting?.registerMeshes(meshes);await lifetime.run(()=>prepareMapMaterials(meshes,{cancelled:()=>entry.disposed||!this._current(generation)}));
    this._check(generation);lifetime.check();entry.containers.add(container);installVillageGeometry(entry,container,level,this.world);this.stats.sourceLoads++;container=null;
    if(this.outlines){for(const source of this._sources(entry))this.outlines.sourceFor(source);await this.outlines.prepare(this._sources(entry),{cancelled:()=>entry.disposed||!this._current(generation)});}
    if(this.records.size){for(const record of this.records.values())if(record.entry===entry)this._setTransform(record,record.instance);this._rebuildVisibility();}
   }catch(error){container?.dispose();throw error;}
   finally{lifetime.close();this.lifetimes.delete(lifetime);entry.loads.delete(level);}
  })();entry.loads.set(level,pending);this.pending.add(pending);pending.then(()=>this.pending.delete(pending),()=>this.pending.delete(pending));return pending;
 }
 _sources(entry){return [...new Set([...(entry.baseMeshes??[]),...[...entry.tiers.values()].flatMap(tier=>tier.meshes)])];}
 _release(entry){
  if(--entry.refs>0||entry.disposed)return;entry.disposed=true;entry.controller.abort(mapLoadAbortError());this.assets.delete(entry.key);
  this.textureStreaming.wanted.delete(entry.key);this.textureStreaming.lastWanted.delete(entry.key);this.textureStreaming.seenSince.delete(entry.key);this.textureStreaming.replacementSince.delete(entry.key);
  if(this.textureStreaming.pending===entry.key)for(const cancel of [...this.textureStreaming.textureWaiters])cancel();
  if(this.textureStreaming.resident.has(entry.key))this.textureStreaming.release(entry.key);
  for(const mesh of this._sources(entry))if(!mesh.isDisposed())mesh.dispose(false,false);
  for(const container of entry.containers)container.dispose();entry.containers.clear();this.stats.sourceReleases++;
 }
 validateSurface(instance){
  const point=Vector3.FromArray(instance.transform.position),normal=Vector3.FromArray(instance.attachment.normal),{surface}=instance.attachment;
  if(surface==='free')return {point,normal};
  const supportId=instance.attachment.supportId??'terrain';
  if(supportId==='terrain'){
   const height=this.world.terrain.heightAt(point.x,point.z);
   if(Math.abs(point.y-height)>.08)throw new PlacementValidationError('attachment','ground anchor must be on the actual terrain surface');
   const e=.05,terrainNormal=new Vector3(this.world.terrain.heightAt(point.x-e,point.z)-this.world.terrain.heightAt(point.x+e,point.z),2*e,this.world.terrain.heightAt(point.x,point.z-e)-this.world.terrain.heightAt(point.x,point.z+e)).normalize();
   if(Vector3.Dot(normal,terrainNormal)<.8&&!(instance.sourceInstanceId&&normal.x===0&&normal.y===1&&normal.z===0))throw new PlacementValidationError('attachment.normal','normal does not match terrain support');
   return {point,normal,supportId};
  }
  const support=this.world.villageRenderRecords?.find(record=>record.placement.id===supportId);
  if(!support?.meshes.length)throw new PlacementValidationError('attachment.supportId','immutable base support geometry is not loaded');
  const ray=new Ray(point.add(normal.scale(.3)),normal.negate(),.6);let best=null;
  for(const mesh of support.meshes){const local=Ray.Transform(ray,mesh.getWorldMatrix().clone().invert()),hit=mesh.intersects(local,false);if(hit.hit&&(!best||hit.distance<best.distance))best=hit;}
  if(!best?.pickedPoint||Vector3.Distance(best.pickedPoint,point)>.08)throw new PlacementValidationError('attachment','anchor is not on the immutable support geometry');
  const hitNormal=best.getNormal(true);
  if(!hitNormal||Vector3.Dot(hitNormal.normalize(),normal)<.8)throw new PlacementValidationError('attachment.normal','normal does not match the outward immutable support geometry');
  return {point,normal,supportId};
 }
 _makeRecord(instance,entry){
  const root=new TransformNode('authored-'+instance.instanceId,this.scene),facing=new TransformNode(root.name+'-asset',this.scene);root.setEnabled(false);facing.parent=root;
  try{
   const created=instantiateStaticMap(entry.source,name=>root.name+'-'+name);for(const node of created.rootNodes)node.parent=facing;
   const meshes=root.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0);
   for(const mesh of meshes){mesh.isPickable=true;mesh.metadata={...mesh.metadata,placementInstanceId:instance.instanceId,authoredPlacement:true};}
   root.metadata={placementInstanceId:instance.instanceId,authoredPlacement:true};
   const record={root,facing,meshes,entry,instance:clone(instance),placement:{id:instance.instanceId,asset:entry.key,kind:entry.catalog.placement.sourceKind??'prop',scale:instance.transform.scale},blocksPlayerView:['tree','rock'].includes(entry.catalog.placement.sourceKind)};
   this._setTransform(record,instance);this.stats.instancesCreated++;return record;
  }catch(error){root.dispose();this._release(entry);throw error;}
 }
 _setTransform(record,instance){
  const {root,facing,entry}=record,{normal,point}=this.validateSurface(instance);
  root.unfreezeWorldMatrix();for(const node of root.getDescendants())node.unfreezeWorldMatrix?.();
  root.position.copyFrom(point.add(normal.scale(instance.attachment.offset)));root.rotationQuaternion=Quaternion.FromArray(instance.transform.rotation);root.scaling.copyFromFloats(...(instance.transform.aspect??[1,1,1]).map(value=>value*instance.transform.scale));
  const unit=entry.catalog.units.metersPerSourceUnit,pivot=entry.catalog.pivot?.offset??[0,0,0];
  facing.scaling.setAll(unit);facing.rotation.y=instance.transform.frontYaw??entry.catalog.forwardYaw??entry.config.frontYawOffset??0;facing.position.set(-pivot[0]*unit,-pivot[1]*unit,-pivot[2]*unit);
  root.computeWorldMatrix(true);facing.computeWorldMatrix(true);
  if(instance.attachment.surface!=='free'&&!instance.sourceInstanceId){
   // A transformed local AABB can have empty corners below the real surface.
   // Anchor the actual static vertex stream, avoiding visibly floating tilted
   // props; collision/culling may still use conservative affine bounds.
   let projection=Infinity;const point=new Vector3();
   for(const mesh of record.meshes){
    mesh.computeWorldMatrix(true);const positions=mesh.getVerticesData(VertexBuffer.PositionKind),matrix=mesh.getWorldMatrix();
    if(!positions?.length)throw new Error('Placement support needs readable static position data');
    for(let i=0;i<positions.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(positions[i],positions[i+1],positions[i+2],matrix,point);projection=Math.min(projection,(point.x-root.position.x)*normal.x+(point.y-root.position.y)*normal.y+(point.z-root.position.z)*normal.z);}
   }
   const delta=Vector3.TransformNormal(normal.scale(-projection),root.getWorldMatrix().clone().invert());facing.position.addInPlace(delta);facing.computeWorldMatrix(true);
  }
  const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const mesh of record.meshes){mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;min.minimizeInPlace(box.minimumWorld);max.maximizeInPlace(box.maximumWorld);mesh.freezeWorldMatrix();}
  facing.freezeWorldMatrix();root.freezeWorldMatrix();record.min=min;record.max=max;const center=min.add(max).scale(.5);record.bounds={min,max,center,radius:Vector3.Distance(min,max)*.5};
  record.instance=clone(instance);Object.assign(record.placement,{x:root.position.x,z:root.position.z,scale:instance.transform.scale});
  record.placement.id=instance.instanceId;root.metadata.placementInstanceId=instance.instanceId;for(const mesh of record.meshes)mesh.metadata.placementInstanceId=instance.instanceId;
  const body=entry.catalog.placement.body;
  record.obstacles=instance.collision!=='solid'?[]:instance.sourceInstanceId?this._baseCollisionParts(record,instance):this.world.cave?[]:body?.shape==='trunk-capsule'?[this._trunkObstacle(record,body)]:[{id:'authored-'+instance.instanceId,instanceId:instance.instanceId,shape:'box',x:center.x,z:center.z,yaw:0,halfWidth:Math.max(.0001,(max.x-min.x)/2),halfDepth:Math.max(.0001,(max.z-min.z)/2),radius:Math.hypot(max.x-min.x,max.z-min.z)/2,height:Math.max(0,max.y-this.world.terrain.heightAt(center.x,center.z)),source:'transformed-mesh-conservative-XZ-bounds'}];record.obstacle=record.obstacles[0]??null;
 }
 _disposeRecord(record){if(!record||record.disposed)return;record.disposed=true;for(const mesh of record.meshes)this.world.shadows?.removeShadowCaster(mesh,false);record.root.dispose(false,false);this._release(record.entry);this.stats.instancesDisposed++;}
 _refreshRecords(){this.renderRecords.splice(0,this.renderRecords.length,...this.records.values(),...(this.previewRecord?[this.previewRecord]:[]));this.streaming.demand.invalidate();this.textureStreaming.nextCheck=0;}
 _rebuildVisibility(){this.visibility?.dispose();this.visibility=new VillageVisibility(this.proxy,[...this.records.values()],{touch:this.world.touchDevice});for(const record of this.records.values())record.visibilityKey=cellKey(record.placement.x,record.placement.z);this.world.caveFog?.updateRecords([...this.records.values()]);this.treeOcclusion=this.publish?new TreeOcclusion([...this.records.values()].filter(record=>record.blocksPlayerView).map(record=>record.root)):null;}
 _relocateVisibility(record){
  const visibility=this.visibility;if(!visibility)return;
  const oldKey=record.visibilityKey,nextKey=cellKey(record.placement.x,record.placement.z),old=visibility.cells.get(oldKey),index=visibility.records.indexOf(record);
  const bounds=cell=>{
   cell.min=new Vector3(Infinity,Infinity,Infinity);cell.max=new Vector3(-Infinity,-Infinity,-Infinity);
   for(const item of cell.records){cell.min.minimizeInPlace(item.min);cell.max.maximizeInPlace(item.max);}
   cell.center=cell.min.add(cell.max).scale(.5);cell.radius=Vector3.Distance(cell.min,cell.max)*.5;
  };
  if(oldKey!==nextKey){
   if(old){const at=old.records.indexOf(record);if(at>=0){old.records.splice(at,1);old.indices.splice(at,1);}if(old.records.length)bounds(old);else visibility.cells.delete(oldKey);}
   let next=visibility.cells.get(nextKey);if(!next){next={records:[],indices:[],active:null};visibility.cells.set(nextKey,next);}
   next.records.push(record);next.indices.push(index);record.cellActive=next.active!==false;bounds(next);
  }else if(old)bounds(old);
  record.visibilityKey=nextKey;visibility.stats.cells=visibility.cells.size;visibility.timer=0;visibility.shadowTimer=0;visibility.fogRevision=undefined;
  this.streaming.demand.invalidate();this.textureStreaming.nextCheck=0;if(this.outlines)this.outlines.next=0;
 }
 async _rebuildRendering(){
  this.outlines?.dispose();this.outlines=new VillageOutlines(this.proxy,this.renderRecords,this.stats);await this.outlines.prepare(undefined,{cancelled:()=>!this._current()});this._rebuildVisibility();this.outlines.next=0;
 }
 async _prepareOutlines(records){
  const retained=new Set([...this.records.values()].flatMap(record=>record.meshes)),saved=[];
  for(const record of records)for(const mesh of record.meshes)if(retained.has(mesh)&&mesh.instancedBuffers?.villageInk)saved.push([mesh,mesh.instancedBuffers.villageInk.clone()]);
  const restore=()=>{for(const [mesh,ink]of saved)mesh.instancedBuffers.villageInk.copyFrom(ink);};
  let outlines;
  try{
   outlines=new VillageOutlines(this.proxy,records,this.stats);
   // Compile a staged owner without allowing it to render or update old ink.
   this.scene.onBeforeRenderObservable.remove(outlines.observer);outlines.observer=null;outlines.drawing=true;restore();
   await outlines.prepare(undefined,{cancelled:()=>!this._current()});return outlines;
  }catch(error){outlines?.dispose();restore();throw error;}
 }
 async preview(instance){
  if(this.records.has(instance.instanceId))return this.previewExisting(instance);
  this._check();const temporary={...this.document,instances:[instance]};const valid=validatePlacementDocument(temporary,{catalog:this.catalog,baseManifest:this.baseManifest,maxInstances:1}).instances[0];this.validateSurface(valid);
  const request=++this.previewRequest;
  if(this.previewRecord&&this._key(this.previewRecord.instance)===this._key(valid)){
   this._setTransform(this.previewRecord,valid);this.previewRecord.root.setEnabled(true);this.streaming.demand.invalidate();if(this.outlines)this.outlines.next=0;this.stats.previews++;return this.previewRecord;
  }
  const entry=await this._acquire(valid);
  if(!this._current()||request!==this.previewRequest){this._release(entry);throw mapLoadAbortError();}
  this.outlines?.dispose();this.outlines=null;this._disposeRecord(this.previewRecord);this.previewRecord=this._makeRecord(valid,entry);this.previewRecord.root.setEnabled(true);this._refreshRecords();await this._rebuildRendering();this.stats.previews++;return this.previewRecord;
 }
 async previewExisting(instance){
  this._check();const record=this.records.get(instance.instanceId);if(!record)throw new Error('Committed placement is not available for preview');
  const valid=validatePlacementDocument({...this.document,instances:[instance]},{catalog:this.catalog,baseManifest:this.baseManifest,maxInstances:1}).instances[0];this.validateSurface(valid);
  if(this._key(valid)!==this._key(record.instance))throw new Error('Asset replacement requires a committed transaction');
  if(this.existingPreview?.record!==record){this.clearPreview();this.existingPreview={record,instance:clone(record.instance),enabled:record.root.isEnabled()};}
  this._setTransform(record,valid);this._relocateVisibility(record);record.root.setEnabled(true);this.stats.previews++;return record;
 }
 clearExistingPreview(){
  const preview=this.existingPreview;if(!preview)return;this.existingPreview=null;
  if(!this._current()||preview.record.disposed)return;
  this._setTransform(preview.record,preview.instance);this._relocateVisibility(preview.record);preview.record.root.setEnabled(preview.enabled);this.update(0,this.lastPlayer);
 }
 sampleFreeTransforms(rows){
  this._check();
  const instances=rows.map(row=>{
   const record=this.records.get(row.instanceId);if(!record||record.instance.collision!=='none'||record.instance.attachment.surface!=='free')throw new Error('Absolute sampling requires owned free, non-colliding visuals');
   return {...clone(record.instance),transform:{position:row.position,rotation:row.rotation,scale:row.scale}};
  });
  const valid=validatePlacementDocument({...this.document,instances},{catalog:this.catalog,baseManifest:this.baseManifest,maxInstances:this.limits.instances});
  for(const instance of valid.instances){const record=this.records.get(instance.instanceId);this._setTransform(record,instance);this._relocateVisibility(record);record.root.setEnabled(true);}
 }
 clearPreview(){
  this.clearExistingPreview();
  this.previewRequest=(this.previewRequest??0)+1;
  if(!this.previewRecord)return;
  this.outlines?.dispose();this.outlines=null;this._disposeRecord(this.previewRecord);this.previewRecord=null;this._refreshRecords();
  if(this._current()){this.outlines=new VillageOutlines(this.proxy,this.renderRecords,this.stats);this.outlines.next=0;}
 }
 async apply(document,{expectedRevision=this.document.revision}={}){
  this.clearExistingPreview();
  this._check();if(expectedRevision!==this.document.revision)throw new PlacementValidationError('revision','runtime revision conflict','REVISION_CONFLICT');
  const next=validatePlacementDocument(document,{catalog:this.catalog,baseManifest:this.baseManifest,maxInstances:this.limits.instances});
  if(!this.publish&&(next.removedBaseIds?.length||next.instances.some(instance=>instance.collision!=='none'||instance.sourceInstanceId)))throw new Error('Nonpublishing scene visuals cannot own collision or base replacements');
  if(this.applied&&next.revision<=this.document.revision){if(JSON.stringify(next)===JSON.stringify(this.document))return clone(this.document);throw new PlacementValidationError('revision','commits require a newer document revision','REVISION_CONFLICT');}
  for(const instance of next.instances)this.validateSurface(instance);
  const generation=this.generation,request=++this.request,staged=new Map(),created=[];let preparedOutlines,editedCaveClearance;
  try{
   for(const instance of next.instances){
    const old=this.records.get(instance.instanceId);
    if(old&&this._key(old.instance)===this._key(instance)){staged.set(instance.instanceId,old);continue;}
    const entry=await this._acquire(instance);this._check(generation);
    if(request!==this.request){this._release(entry);throw mapLoadAbortError();}
    const record=this._makeRecord(instance,entry);created.push(record);staged.set(instance.instanceId,record);
   }
   preparedOutlines=await this._prepareOutlines([...staged.values()]);
   if(this.world.cave&&this.publish&&(next.removedBaseIds?.length||next.instances.some(instance=>instance.sourceInstanceId||instance.collision==='solid'))){const {prepareEditedCaveClearance}=await import('./editor-cave-collision.js');this._check(generation);if(request!==this.request)throw mapLoadAbortError();editedCaveClearance=prepareEditedCaveClearance(this,next,staged);}
   for(const instance of next.instances)this.validateSurface(instance);
   this._check(generation);if(request!==this.request)throw mapLoadAbortError();
  }catch(error){preparedOutlines?.dispose();for(const record of created)this._disposeRecord(record);throw error;}
  this.outlines?.dispose();this.outlines=null;this.visibility?.dispose();this.visibility=null;
  for(const instance of next.instances){const record=staged.get(instance.instanceId);this._setTransform(record,instance);record.root.setEnabled(true);}
  for(const [id,record]of this.records)if(staged.get(id)!==record)this._disposeRecord(record);
  this._disposeRecord(this.previewRecord);this.previewRecord=null;this.previewRequest=(this.previewRequest??0)+1;
  this.records=staged;this.document=next;this.applied=true;this._refreshRecords();
  const obstacles=[...this.records.values()].flatMap(record=>record.obstacles??(record.obstacle?[record.obstacle]:[])),revision=(this.world.placementRevision??0)+1;
  if(this.publish){const replacements=[...next.instances.map(instance=>instance.sourceInstanceId).filter(Boolean),...(next.removedBaseIds??[])],removedIds=replacements.flatMap(id=>this._originalObstacles(id).map(obstacle=>obstacle.id));this.navigation=createAuthoredPlacementNavigation(this.baseNavigation,obstacles,revision,{removedIds,force:!!editedCaveClearance});if(editedCaveClearance)this.navigation.clearanceAt=editedCaveClearance.clearanceAt;this._suppressBase(replacements);this.world.navigation=this.navigation;this.world.placementRevision=revision;this.world.authoredPlacementRecords=[...this.records.values()];this.world.placementOverlay=clone(next);if(this.world.cave)this._publishCaveCollision(editedCaveClearance);}
  this.stats.commits++;
  this.outlines=preparedOutlines;this.outlines.drawing=false;this.outlines.next=0;this.outlines.observer=this.scene.onBeforeRenderObservable.add(()=>this.outlines?.update(performance.now()));this._rebuildVisibility();
  this.update(0,this.lastPlayer);await this.onCommit({document:clone(next),records:this.records,obstacles,revision});return clone(next);
 }
 update(dt=0,player){
  if(!this._current())return;this.lastPlayer=player??this.lastPlayer;
  const position=this.world.toolLease?.active?this.world.camera.getTarget():this.lastPlayer?.position??this.world.camera.target??this.world.camera.getTarget();
  this.visibility?.update(this.world.camera.globalPosition,position,Math.max(0,Number.isFinite(dt)?dt:0));
  if(this.treeOcclusion){if(this.world.toolLease?.active){for(const tree of this.treeOcclusion.trees){tree.coverage=tree.target=1;for(const mesh of tree.meshes)if(mesh.instancedBuffers)mesh.instancedBuffers.treeCoverage=1;}}else this.treeOcclusion.update(this.world.camera.globalPosition,position,Math.max(0,Number.isFinite(dt)?dt:0));}
  if(this.existingPreview)this.existingPreview.record.root.setEnabled(true);
 }
 _publishCaveCollision(value){
  if(!value&&!this.caveCollisionOwned)return;const terrain=this.world.terrain;if(!this.caveCollisionOwned){this.previousCaveCollision=terrain.authoredCaveCollision;this.caveCollisionTerrain=terrain;this.caveCollisionOwned=true;}
  terrain.authoredCaveCollision=value??this.previousCaveCollision;this.caveCollision=value??this.previousCaveCollision;
  this.world.caveFog?.fog.rebuildOccluders();
 }
 diagnostics(){return {mapId:this.mapId,generation:this.generation,revision:this.document.revision,worldRevision:this.world.placementRevision??0,instances:this.records.size,preview:this.previewRecord?1:0,assets:this.assets.size,pending:this.pending.size,observers:this.disposed?0:1,stats:{...this.stats},limits:{...this.limits},collision:'Exact unchanged base obstacle ownership; conservative transformed bounds on other maps. Cave commits rebuild complete near-mesh body/camera/sight occupancy while preserving terrain/laboratory clearance.',assetsByKey:[...this.assets.values()].map(entry=>({key:entry.key,refs:entry.refs,loadedLods:[...entry.tiers.keys()]}))};}
 leaveMap(){this.dispose();}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.generation++;this.request++;this.previewRequest=(this.previewRequest??0)+1;this.controller.abort(mapLoadAbortError());
  for(const lifetime of this.lifetimes)lifetime.abort(mapLoadAbortError());this.streaming.dispose();this.textureStreaming.dispose();this.outlines?.dispose();this.visibility?.dispose();
  this.scene.onBeforeRenderObservable.remove(this.observer);this.scene.onDisposeObservable.remove(this.disposeObserver);
  this.existingPreview=null;for(const record of this.records.values())this._disposeRecord(record);this.records.clear();this._disposeRecord(this.previewRecord);this.previewRecord=null;
  for(const entry of [...this.assets.values()]){entry.refs=1;this._release(entry);}
  this.renderRecords.length=0;this.treeOcclusion=null;
  if(this.caveCollisionOwned&&this.caveCollisionTerrain.authoredCaveCollision===this.caveCollision){this.caveCollisionTerrain.authoredCaveCollision=this.previousCaveCollision;if(this.world.terrain===this.caveCollisionTerrain)this.world.caveFog?.fog.rebuildOccluders();}
  this.caveEditorMasks?.clear();this.caveEditorGround=null;this.caveEditorMask=null;this.caveEditorPrepared=null;this.caveEditorMaskBytes=0;this.caveCollision=null;this.caveCollisionTerrain=null;this.previousCaveCollision=null;
  if(this.suppressedBase.size)this._suppressBase([]);
  if(this.publish&&this.world.navigation===this.navigation)this.world.navigation=this.baseNavigation;
  if(this.publish&&this.world.mapId===this.mapId&&this.world.ground===this.ground){this.world.authoredPlacementRecords=[];this.world.placementOverlay=null;this.world.placementRevision=(this.world.placementRevision??0)+1;}
 }
}
