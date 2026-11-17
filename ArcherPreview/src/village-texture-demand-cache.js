import {Node} from '@babylonjs/core';
import {sceneryDistanceScale} from './scenery-distance-state.js';

// Only immutable base placements opt in. Authored/editor records and custom
// roots retain direct screening. The cache changes no threshold or pacing.
export class VillageTextureDemandCache {
 constructor(stream){
  this.stream=stream;this.scene=stream.world.scene;this.roots=[];this.assets=new Map();this.dirty=true;this.value=null;
  this.added=this.scene.onNewMeshAddedObservable.add(()=>this.invalidate());
  this.removed=this.scene.onMeshRemovedObservable.add(()=>this.invalidate());
  this.rebind();
 }
 invalidate(){this.dirty=true;}
 rebind(){
  for(const {root,enabled,transform}of this.roots){root.onEffectiveEnabledStateChangedObservable.remove(enabled);root.onAfterWorldMatrixUpdateObservable?.remove(transform);}
  this.roots=[];this.records=this.stream.records;this.length=this.records.length;
  this.safe=this.records.every(record=>record.root?.isEnabled===Node.prototype.isEnabled&&record.root.onEffectiveEnabledStateChangedObservable);
  if(this.safe)for(const record of this.records){
   const root=record.root,enabled=root.onEffectiveEnabledStateChangedObservable.add(()=>this.invalidate()),transform=root.onAfterWorldMatrixUpdateObservable?.add(()=>this.invalidate());
   this.roots.push({root,enabled,transform});
  }
  this.assets.clear();this.invalidate();
 }
 get(projection,compute){
  const stream=this.stream;
  if(this.records!==stream.records||this.length!==stream.records.length)this.rebind();
  if(!this.safe)return compute();
  const scale=sceneryDistanceScale(stream.world);
  let changed=this.dirty||!this.value||this.projection!==projection||this.revision!==projection.revision||this.scale!==scale||this.assets.size!==stream.assets.size;
  // Assets are far fewer than placements. Geometry promotion, missing models,
  // failures and retry are observed even when the camera never moves.
  for(const [id,asset]of stream.assets){
   let state=this.assets.get(id);const high=!!asset.config?.highTextures,failed=stream.failed.has(id);
   if(!state){state={};this.assets.set(id,state);changed=true;}
   if(state.asset!==asset||state.level!==asset.baseLevel||state.source!==asset.source||state.near!==asset.nearSource||state.high!==high||state.failed!==failed)changed=true;
   Object.assign(state,{asset,level:asset.baseLevel,source:asset.source,near:asset.nearSource,high,failed});
  }
  if(this.assets.size!==stream.assets.size)for(const id of this.assets.keys())if(!stream.assets.has(id))this.assets.delete(id);
  this.projection=projection;this.revision=projection.revision;this.scale=scale;
  if(!changed){stream.stats.highTextureScreenCacheHits=(stream.stats.highTextureScreenCacheHits??0)+1;stream.stats.highTextureScreenRecordsChecked=0;return this.value;}
  this.value=compute();this.dirty=false;return this.value;
 }
 dispose(){
  this.scene.onNewMeshAddedObservable.remove(this.added);this.scene.onMeshRemovedObservable.remove(this.removed);
  for(const {root,enabled,transform}of this.roots){root.onEffectiveEnabledStateChangedObservable.remove(enabled);root.onAfterWorldMatrixUpdateObservable?.remove(transform);}
  this.roots.length=0;this.assets.clear();this.value=null;
 }
}
