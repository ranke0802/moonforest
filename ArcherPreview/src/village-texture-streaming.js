import {Frustum,Texture} from '@babylonjs/core';
import {releaseMapTexture} from './map-texture-lifetime.js';
import {projectedCoverage,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {VILLAGE_TEXTURE_BUDGET,highTextureBytes} from './village-texture-budget.js';
import {MapLoadLifetime,MAP_MODEL_TIMEOUT_MS} from './map-load-lifetime.js';

export const shouldReleaseHighTexture=(lastWanted,now,touch)=>now-lastWanted>(touch?12000:20000);
export const VILLAGE_TEXTURE_PACING=Object.freeze({checkMs:250,motionHoldMs:600,visibleGapMs:750,fillDwellMs:250,replacementDwellMs:3000,minResidenceMs:6000,mobileMovingMs:2000,mobileIdleMs:750,desktopMovingMs:750,desktopIdleMs:350,visibleReplacementRatio:1.5});
// gammaSpace's getter is false for glTF textures already decoded by the GPU.
// Copying that value to a plain RGBA texture skips sRGB decoding and washes out
// only the asset promoted to the near tier. Set source color space explicitly.
export const highTextureOptions=(role,old)=>({noMipmap:false,invertY:old?.invertY??false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,useSRGBBuffer:role==='albedo',gammaSpace:role==='albedo'});

// One asset at a time. The persistent content cache retains downloaded files;
// only temporary high-resolution GPU allocations are released on distance exit.
export class VillageTextureStreaming {
  constructor(world,assets,records,manifestUrl,stats,{textureTimeoutMs=MAP_MODEL_TIMEOUT_MS,textureTimers}={}){
    this.world=world;this.assets=assets;this.records=records;this.url=manifestUrl;this.stats=stats;
    this.textureTimeoutMs=textureTimeoutMs;this.textureTimers=textureTimers;
    this.resident=new Map();this.failed=new Set();this.wanted=new Map();this.lastWanted=new Map();
    this.nextCheck=0;this.pending=null;this.pendingBytes=0;this.disposed=false;this.textureWaiters=new Set();
    this.budget=world.touchDevice?VILLAGE_TEXTURE_BUDGET.mobile:VILLAGE_TEXTURE_BUDGET.desktop;
    this.maxTextureSize=world.scene.getEngine().getCaps().maxTextureSize;
    const caps=world.scene.getEngine().getCaps();
    this.compressedSupported=!!(caps.astc||caps.etc2||caps.s3tc||caps.bptc||caps.etc1||caps.pvrtc);
    const profiles=[...assets.values()].map(a=>a.config.highTextures).filter(Boolean);
    if(world.touchDevice&&this.compressedSupported&&profiles.every(p=>p.textures?.albedo?.codec))this.budget=VILLAGE_TEXTURE_BUDGET.mobileCompressed;
    this.lastView=new Float32Array(16);this.hasView=false;this.lastFov=null;this.motionUntil=0;this.lastFinished=-Infinity;
    this.seenSince=new Map();this.replacementSince=new Map();this.clock=()=>performance.now();
    Object.assign(stats,{highTextureAssets:0,highTexturePending:0,highTexturePendingAsset:null,highTextureStage:'idle',highTextureLastPromoteMs:0,highTextureMax:0,highTextureLoads:0,highTextureReleases:0,highTextureError:null,highTextureBudget:this.budget,highTextureBytes:0,highTextureReserved:0,highTexturePeak:0,highTextureQueued:0,highTextureMoving:false,highTextureMovingLoads:0,highTextureCooldownMs:0,highTextureLastPrepareMs:0});
    this.observer=world.scene.onAfterRenderObservable.add(()=>this.update(performance.now()));
  }
  update(now){
    if(this.disposed||this.world.villageStreaming?.active===false||now<this.nextCheck)return;
    const policy=VILLAGE_TEXTURE_PACING;
    this.nextCheck=now+policy.checkMs;const candidates=new Map();
    const camera=this.world.camera,planes=Frustum.GetPlanes(camera.getTransformationMatrix());
    const view=camera.getViewMatrix().m;
    // Include translation and zoom, not just camera rotation. Keep observing
    // during geometry work so the first subsequent upload uses the moving rate.
    if(this.hasView&&(view.some((v,i)=>Math.abs(v-this.lastView[i])>(i<12?.004:.025))||Math.abs(camera.fov-this.lastFov)>.001))this.motionUntil=now+policy.motionHoldMs;
    this.lastView.set(view);this.hasView=true;this.lastFov=camera.fov;
    const moving=now<this.motionUntil;
    this.stats.highTextureMoving=moving;
    for(const record of this.records){
      if(!record.root.isEnabled())continue;
      const asset=this.assets.get(record.placement.asset),config=asset?.config;
      if(!config?.highTextures||(asset.baseLevel!==undefined&&asset.baseLevel!==0))continue;
      for(const mesh of record.meshes){
        if(!mesh.isInFrustum(planes))continue;
        const coverage=projectedCoverage(camera,mesh.getBoundingInfo().boundingSphere);
        if(coverage>VILLAGE_LOD_COVERAGE.mid){
          const id=record.placement.asset;
          if(!this.failed.has(id))candidates.set(id,Math.max(coverage,candidates.get(id)??0));
        }
      }
    }
    for(const id of candidates.keys()){
      if(!this.seenSince.has(id)||now-(this.lastWanted.get(id)??-Infinity)>policy.visibleGapMs)this.seenSince.set(id,now);
      this.lastWanted.set(id,now);
    }
    for(const id of this.seenSince.keys())if(!candidates.has(id)&&now-this.lastWanted.get(id)>policy.visibleGapMs){this.seenSince.delete(id);this.replacementSince.delete(id);}
    // Once admitted, finish the one reserved upload even if a brief turn hides
    // it. Discard/redecode loops waste work; residency remains byte-budgeted.
    this.wanted=new Map(candidates);if(this.pending)this.wanted.set(this.pending,candidates.get(this.pending)??0);
    this.stats.highTextureQueued=[...candidates.keys()].filter(id=>!this.resident.has(id)&&id!==this.pending).length;
    const interval=this.world.touchDevice?(moving?policy.mobileMovingMs:policy.mobileIdleMs):(moving?policy.desktopMovingMs:policy.desktopIdleMs);
    this.stats.highTextureCooldownMs=Math.max(0,this.lastFinished+interval-now);
    // Waiting is not a pending job: missing models and their existing LODs keep
    // priority. No textures are evicted just because the camera moved.
    if(this.world.villageStreaming?.pending||this.pending){this.syncStats();return;}
    for(const id of this.resident.keys())if(!candidates.has(id)&&shouldReleaseHighTexture(this.lastWanted.get(id)??now,now,this.world.touchDevice))this.release(id);
    const ready=this.admission(candidates,now);
    if(ready&&!this.stats.highTextureCooldownMs){
      // Only reclaim space when the stable replacement can actually start.
      // Keep the base material/geometry drawn throughout, and reserve before
      // allocating so two 4K uploads can never overlap the existing budget.
      for(const id of ready.evict)this.release(id);
      this.replacementSince.delete(ready.id);
      if(moving)this.stats.highTextureMovingLoads++;
      this.start(ready.id);
    }
    this.syncStats();
  }
  admission(candidates,now){
    const policy=VILLAGE_TEXTURE_PACING,used=[...this.resident.values()].reduce((sum,e)=>sum+e.bytes,0);
    for(const [id,coverage]of [...candidates].sort((a,b)=>b[1]-a[1])){
      if(this.resident.has(id))continue;
      const config=this.assets.get(id)?.config.highTextures,bytes=highTextureBytes(config,this.compressedSupported);
      if(config?.textures?.albedo?.width>this.maxTextureSize||bytes>this.budget)continue;
      if(now-this.seenSince.get(id)<policy.fillDwellMs)continue;
      if(used+bytes<=this.budget)return {id,evict:[]};
      // A visible resident is only displaced by a substantially closer asset;
      // an off-screen one is kept through short pan/return sequences.
      const victims=[...this.resident].filter(([other])=>(candidates.get(other)??0)*policy.visibleReplacementRatio<coverage)
        .sort((a,b)=>(candidates.get(a[0])??0)-(candidates.get(b[0])??0)||(this.lastWanted.get(a[0])??0)-(this.lastWanted.get(b[0])??0));
      const evict=[];let available=this.budget-used;
      for(const [other,entry]of victims){evict.push(other);available+=entry.bytes;if(available>=bytes)break;}
      if(available<bytes){this.replacementSince.delete(id);continue;}
      if(!this.replacementSince.has(id))this.replacementSince.set(id,now);
      if(now-this.replacementSince.get(id)<policy.replacementDwellMs||evict.some(other=>now-(this.resident.get(other).readyAt??now)<policy.minResidenceMs))continue;
      return {id,evict};
    }
    return null;
  }
  syncStats(){
    const entries=[...this.resident.values()];
    this.stats.highTextureAssets=entries.length;
    this.stats.highTextureBytes=entries.reduce((sum,e)=>sum+e.bytes,0);
    this.stats.highTextureReserved=this.resident.has(this.pending)?0:this.pendingBytes;
    this.stats.highTextureMax=Math.max(0,...entries.map(e=>e.resolution));
    this.stats.highTexturePeak=Math.max(this.stats.highTexturePeak??0,this.stats.highTextureBytes+this.stats.highTextureReserved);
  }
  async loadTexture(config,old,role){
    if(this.disposed)throw Object.assign(new Error('Map texture released'),{name:'AbortError'});
    const url=new URL(config.url,this.url).href,scene=this.world.scene;
    const texture=await new Promise((resolve,reject)=>{
      let item,settled=false;
      // Download/cache waits already have their own progress deadline. Bound
      // the subsequent Babylon decode/upload callback too: a lost callback must
      // not retain the one upload reservation and block geometry indefinitely.
      const lifetime=new MapLoadLifetime({timeoutMs:this.textureTimeoutMs??MAP_MODEL_TIMEOUT_MS,timers:this.textureTimers,stage:'high-texture:'+role});
      const finish=error=>{
        if(settled)return;
        if(!error)try{lifetime.check();}catch(reason){error=reason;}
        if(settled)return; // check() can synchronously dispatch the expiry.
        settled=true;this.textureWaiters.delete(cancel);lifetime.signal.removeEventListener('abort',expired);lifetime.close();
        if(error){
          // Babylon9.31 queues the InternalTexture, while BaseTexture.dispose
          // removes only its wrapper. Remove this exact abandoned token only
          // when no other Texture still owns the shared internal allocation.
          releaseMapTexture(item,scene);reject(error);
        }else resolve(item);
      };
      const cancel=()=>finish(Object.assign(new Error('Map texture released'),{name:'AbortError'}));
      const expired=()=>finish(lifetime.signal.reason);
      lifetime.signal.addEventListener('abort',expired,{once:true});
      this.textureWaiters.add(cancel);
      // Defer callbacks one microtask: even an already-cached/synchronous
      // loader must finish assigning the owned Texture before settlement.
      // Own the wrapper before starting I/O so a synchronous loader exception
      // can dispose it as well. updateURL preserves these sampling/colour options.
      try{item=new Texture(null,scene,{...highTextureOptions(role,old),
        onLoad:()=>queueMicrotask(()=>{if(this.disposed)cancel();else finish();}),
        onError:(message,error)=>queueMicrotask(()=>finish(error??new Error(message||'High texture load failed')))});item.updateURL(url);
      }catch(error){finish(error);}
    });
    for(const key of ['coordinatesIndex','coordinatesMode','wrapU','wrapV','uScale','vScale','uOffset','vOffset','uAng','vAng','wAng','level','hasAlpha']){
      if(old&&old[key]!==undefined)texture[key]=old[key];
    }
    return texture;
  }
  start(id){
    const config=this.assets.get(id)?.config.highTextures,bytes=highTextureBytes(config,this.compressedSupported);
    this.syncStats();
    if(this.disposed||this.pending||this.resident.has(id)||!this.wanted.has(id)||this.failed.has(id)||config?.textures?.albedo?.width>this.maxTextureSize||this.stats.highTextureBytes+bytes>this.budget)return;
    const started=this.clock?.()??performance.now();
    this.pending=id;this.pendingBytes=bytes;this.stats.highTexturePending=1;this.stats.highTexturePendingAsset=id;this.stats.highTextureStage='resources';this.syncStats();
    return this.pendingTask=this.load(id).catch(error=>{
      if(this.disposed||error.name==='AbortError')return;
      this.failed.add(id);this.stats.highTextureError=`${id}: ${error.message??error}`;
      console.warn('Village high texture stopped; no automatic retry.',id,error);
    }).finally(()=>{this.lastFinished=this.clock?.()??performance.now();this.stats.highTextureLastPrepareMs=Math.max(0,this.lastFinished-started);this.pending=null;this.pendingTask=null;this.pendingBytes=0;this.stats.highTexturePending=0;this.stats.highTexturePendingAsset=null;this.stats.highTextureStage=this.disposed?'disposed':'idle';this.syncStats();});
  }
  async load(id){
    const asset=this.assets.get(id),materials=(asset.nearSource??asset.source).materials.filter(m=>m.albedoTexture),config=asset.config.highTextures;
    if(!materials.length)throw new Error('Near material does not expose an albedo texture');
    const slots=config.shading==='toon-color'?{albedo:'albedoTexture'}:{albedo:'albedoTexture',normal:'bumpTexture',orm:'metallicTexture'},textures={},originals=materials.map(material=>({material,values:Object.fromEntries(Object.values(slots).map(k=>[k,material[k]]))}));
    try{
      if(this.world?.prefetchResources)await this.world.prefetchResources(config.resources);
      if(this.disposed)return;
      for(const [role,slot]of Object.entries(slots)){
        if(this.pending===id)this.stats.highTextureStage='texture:'+role;
        textures[slot]=await this.loadTexture(config.textures[role],materials[0][slot],role);
        if(this.disposed||!this.wanted.has(id)){Object.values(textures).forEach(t=>releaseMapTexture(t,this.world?.scene));return;}
        const size=textures[slot].getSize(),expected=config.textures[role];
        if(size.width!==expected.width||size.height!==expected.height)throw new Error('Texture dimensions differ from the budgeted profile');
      }
      // unfreeze() scans every scene submesh even when already unfrozen. The
      // texture setters retain their normal readiness invalidation on live toon
      // materials; only a genuinely frozen material needs the extra unlock.
      if(this.pending===id)this.stats.highTextureStage='promote';
      const promoteStarted=this.clock?.()??performance.now();
      for(const {material}of originals){if(material.isFrozen)material.unfreeze();Object.assign(material,textures);if(!material.metadata?.villageToon)material.freeze();}
      // Synchronous material assignment/invalidation only: fetching, decoding,
      // prior KTX upload calls and later driver draw costs are not GPU time here.
      this.stats.highTextureLastPromoteMs=Math.max(0,(this.clock?.()??performance.now())-promoteStarted);
      this.resident.set(id,{textures,originals,bytes:highTextureBytes(config,this.compressedSupported),resolution:config.textures.albedo.width,readyAt:this.clock?.()??performance.now()});this.stats.highTextureLoads++;this.syncStats();
      this.stats.highTextureFormat=textures.albedoTexture.getInternalTexture?.()?.format??null;
    }catch(error){Object.values(textures).forEach(t=>releaseMapTexture(t,this.world?.scene));throw error;}
  }
  release(id){
    const entry=this.resident.get(id);if(!entry)return;
    for(const {material,values}of entry.originals){if(material.isFrozen)material.unfreeze();Object.assign(material,values);if(!material.metadata?.villageToon)material.freeze();}
    for(const t of Object.values(entry.textures))releaseMapTexture(t,this.world?.scene);
    this.resident.delete(id);this.stats.highTextureReleases++;this.syncStats();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;for(const cancel of [...this.textureWaiters])cancel();
    this.stats.highTexturePendingAsset=null;this.stats.highTextureStage='disposed';
    this.world.scene.onAfterRenderObservable.remove(this.observer);
    for(const id of [...this.resident.keys()])this.release(id);
  }
}
