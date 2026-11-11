import {Frustum,Texture} from '@babylonjs/core';
import {releaseMapTexture} from './map-texture-lifetime.js';
import {projectedCoverage,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {VILLAGE_TEXTURE_BUDGET,highTextureBytes} from './village-texture-budget.js';
import {MapLoadLifetime,MAP_MODEL_TIMEOUT_MS,mapLoadAbortError,mapLoadTimeoutError} from './map-load-lifetime.js';
import {sceneryHighTextureProfile} from './mobile-texture-policy.js';
import {runtimeTimers} from './runtime-timers.js';

export const shouldReleaseHighTexture=(lastWanted,now,touch)=>now-lastWanted>(touch?12000:20000);
export const VILLAGE_TEXTURE_PACING=Object.freeze({checkMs:250,motionHoldMs:600,visibleGapMs:750,fillDwellMs:250,replacementDwellMs:3000,minResidenceMs:6000,mobileMovingMs:2000,mobileIdleMs:750,desktopMovingMs:750,desktopIdleMs:350,visibleReplacementRatio:1.5});
// gammaSpace's getter is false for glTF textures already decoded by the GPU.
// Copying that value to a plain RGBA texture skips sRGB decoding and washes out
// only the asset promoted to the near tier. Set source color space explicitly.
export const highTextureOptions=(role,old)=>({noMipmap:false,invertY:old?.invertY??false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,useSRGBBuffer:role==='albedo',gammaSpace:role==='albedo'});

// One asset at a time. The persistent content cache retains downloaded files;
// only temporary high-resolution GPU allocations are released on distance exit.
export class VillageTextureStreaming {
  constructor(world,assets,records,manifestUrl,stats,{textureTimeoutMs=MAP_MODEL_TIMEOUT_MS,textureTimers,viewportWaitTimeoutMs=MAP_MODEL_TIMEOUT_MS}={}){
    this.world=world;this.assets=assets;this.records=records;this.url=manifestUrl;this.stats=stats;
    this.textureTimeoutMs=textureTimeoutMs;this.textureTimers=textureTimers;this.viewportWaitTimeoutMs=viewportWaitTimeoutMs;this.viewportWait=null;this.viewportWaitDeadline=null;this.viewportClock=runtimeTimers(textureTimers).now;
    this.resident=new Map();this.failed=new Set();this.wanted=new Map();this.lastWanted=new Map();
    this.nextCheck=0;this.pending=null;this.pendingBytes=0;this.disposed=false;this.textureWaiters=new Set();
    this.budget=world.touchDevice?VILLAGE_TEXTURE_BUDGET.mobile:VILLAGE_TEXTURE_BUDGET.desktop;
    const engine=world.scene.getEngine();this.contextLost=!!engine._contextWasLost;
    this.maxTextureSize=engine.getCaps().maxTextureSize;
    const caps=engine.getCaps();
    this.textureCapabilities=Object.fromEntries(['astc','etc2','s3tc','bptc','etc1','pvrtc'].map(key=>[key,!!caps[key]]));
    this.compressedSupported=!!(caps.astc||caps.etc2||caps.s3tc||caps.bptc||caps.etc1||caps.pvrtc);
    const profiles=[...assets].map(([id])=>this.profile(id)).filter(Boolean);
    if(world.touchDevice&&this.compressedSupported&&profiles.every(p=>this.profileBytes(p)<highTextureBytes(p,false)))this.budget=VILLAGE_TEXTURE_BUDGET.mobileCompressed;
    this.lastView=new Float32Array(16);this.hasView=false;this.lastFov=null;this.motionUntil=0;this.lastFinished=-Infinity;
    this.seenSince=new Map();this.replacementSince=new Map();this.clock=()=>performance.now();
    Object.assign(stats,{highTextureProfile:world.touchDevice?'mobile-bounded-color/houses-original':'original',highTextureAssets:0,highTexturePending:0,highTexturePendingAsset:null,highTextureStage:'idle',highTextureViewportWaiting:false,highTextureLastPromoteMs:0,highTextureMax:0,highTextureLoads:0,highTextureReleases:0,highTextureError:null,highTextureBudget:this.budget,highTextureBytes:0,highTextureReserved:0,highTexturePeak:0,highTextureQueued:0,highTextureMoving:false,highTextureMovingLoads:0,highTextureCooldownMs:0,highTextureLastPrepareMs:0});
    this.contextLostObserver=engine.onContextLostObservable?.add(()=>{
      if(this.disposed)return;this.contextLost=true;this.viewportWait?.cancel(mapLoadAbortError());
      for(const cancel of [...this.textureWaiters])cancel();
    });
    this.contextRestoredObserver=engine.onContextRestoredObservable?.add(()=>{if(!this.disposed){this.contextLost=false;this.nextCheck=0;}});
    this.disposeObserver=world.scene.onDisposeObservable.addOnce(()=>this.dispose());
    this.observer=world.scene.onAfterRenderObservable.add(()=>{
      const start=world.frameDiagnostics?.mark();
      try{this.update(performance.now());}finally{world.frameDiagnostics?.measure('sceneryTextureMs',start??null);}
    });
  }
  profile(id){return sceneryHighTextureProfile(id,this.assets.get(id)?.config,!!this.world?.touchDevice);}
  profileBytes(config){return highTextureBytes(config,this.textureCapabilities??this.compressedSupported);}
  viewportSettling(){return this.world?.viewportResize?.isSettling?.()===true;}
  waitForViewport(stage){
    if(this.disposed||this.contextLost)throw mapLoadAbortError();
    const gate=this.world?.viewportResize;
    if(!gate?.isSettling?.())return null;
    if(this.viewportWait)return this.viewportWait.promise;
    this.stats.highTextureStage='viewport-wait:'+stage;this.stats.highTextureViewportWaiting=true;
    const now=(this.viewportClock??runtimeTimers(this.textureTimers).now)(),timeout=this.viewportWaitTimeoutMs??MAP_MODEL_TIMEOUT_MS;
    // A new rotation between notifications must not renew this job indefinitely.
    this.viewportWaitDeadline??=now+timeout;
    const remaining=this.viewportWaitDeadline-now;
    if(remaining<=0)throw mapLoadTimeoutError(timeout,'high-texture:viewport-wait');
    const lifetime=new MapLoadLifetime({timeoutMs:remaining,timers:this.textureTimers,stage:'high-texture:viewport-wait'});
    const record={};
    const promise=new Promise((resolve,reject)=>{
      let settled=false,unsubscribe;
      const finish=error=>{
        if(settled)return;settled=true;unsubscribe?.();lifetime.signal.removeEventListener('abort',expired);lifetime.close();
        if(this.viewportWait===record){this.viewportWait=null;this.stats.highTextureViewportWaiting=false;}
        if(error)reject(error);else resolve();
      };
      const expired=()=>finish(lifetime.signal.reason);
      const check=()=>{
        if(settled)return;
        try{
          lifetime.check();
          if(this.disposed||this.contextLost||this.world?.viewportResize!==gate||gate.snapshot?.()?.disposed)throw mapLoadAbortError();
          if(!gate.isSettling())finish();
        }catch(error){finish(error);}
      };
      record.cancel=finish;this.viewportWait=record;
      lifetime.signal.addEventListener('abort',expired,{once:true});
      if(typeof gate.subscribe==='function'){
        try{unsubscribe=gate.subscribe(check);if(settled)unsubscribe?.();}catch(error){finish(error);}
      }else record.frameCheck=check; // Reuse the existing render observer; no polling timer.
      check();
    });
    record.promise=promise;return promise;
  }
  update(now){
    this.viewportWait?.frameCheck?.();
    if(this.disposed||this.contextLost||this.world.villageStreaming?.active===false||now<this.nextCheck)return;
    if(this.viewportSettling()){
      if(!this.pending){this.stats.highTextureStage='viewport-wait:admission';this.stats.highTextureViewportWaiting=true;}
      return;
    }
    if(!this.pending&&this.stats.highTextureStage==='viewport-wait:admission'){this.stats.highTextureStage='idle';this.stats.highTextureViewportWaiting=false;}
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
        const coverage=projectedCoverage(camera,mesh.getBoundingInfo().boundingSphere,this.world);
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
      const config=this.profile(id),bytes=this.profileBytes(config);
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
    if(this.disposed||this.contextLost)throw Object.assign(new Error('Map texture released'),{name:'AbortError'});
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
    const config=this.profile(id),bytes=this.profileBytes(config);
    this.syncStats();
    if(this.disposed||this.contextLost||this.pending||this.resident.has(id)||!this.wanted.has(id)||this.failed.has(id)||config?.textures?.albedo?.width>this.maxTextureSize||this.stats.highTextureBytes+bytes>this.budget)return;
    if(this.viewportSettling()){this.stats.highTextureStage='viewport-wait:admission';this.stats.highTextureViewportWaiting=true;return;}
    const started=this.clock?.()??performance.now();
    this.viewportWaitDeadline=null;
    this.pending=id;this.pendingBytes=bytes;this.stats.highTexturePending=1;this.stats.highTexturePendingAsset=id;this.stats.highTextureStage='resources';this.stats.highTextureViewportWaiting=false;this.syncStats();
    return this.pendingTask=this.load(id).catch(error=>{
      if(this.disposed||error.name==='AbortError')return;
      this.failed.add(id);this.stats.highTextureError=`${id}: ${error.message??error}`;
      console.warn('Village high texture stopped; no automatic retry.',id,error);
    }).finally(()=>{this.lastFinished=this.clock?.()??performance.now();this.stats.highTextureLastPrepareMs=Math.max(0,this.lastFinished-started);this.pending=null;this.pendingTask=null;this.pendingBytes=0;this.viewportWaitDeadline=null;this.stats.highTexturePending=0;this.stats.highTexturePendingAsset=null;this.stats.highTextureViewportWaiting=false;this.stats.highTextureStage=this.disposed?'disposed':'idle';this.syncStats();});
  }
  async load(id){
    const asset=this.assets.get(id),materials=(asset.nearSource??asset.source).materials.filter(m=>m.albedoTexture),config=this.profile(id);
    if(!materials.length)throw new Error('Near material does not expose an albedo texture');
    const slots=config.shading==='toon-color'?{albedo:'albedoTexture'}:{albedo:'albedoTexture',normal:'bumpTexture',orm:'metallicTexture'},textures={},originals=materials.map(material=>({material,values:Object.fromEntries(Object.values(slots).map(k=>[k,material[k]]))}));
    try{
      if(this.world?.prefetchResources)await this.world.prefetchResources(config.resources);
      if(this.disposed||this.contextLost)return;
      for(const [role,slot]of Object.entries(slots)){
        // Recheck after waking: another orientation can begin before this continuation.
        let wait;while((wait=this.waitForViewport('texture:'+role)))await wait;
        if(this.disposed||this.contextLost||!this.wanted.has(id))throw mapLoadAbortError();
        if(this.pending===id)this.stats.highTextureStage='texture:'+role;
        textures[slot]=await this.loadTexture(config.textures[role],materials[0][slot],role);
        if(this.disposed||!this.wanted.has(id)){Object.values(textures).forEach(t=>releaseMapTexture(t,this.world?.scene));return;}
        const size=textures[slot].getSize(),expected=config.textures[role];
        if(size.width!==expected.width||size.height!==expected.height)throw new Error('Texture dimensions differ from the budgeted profile');
      }
      // unfreeze() scans every scene submesh even when already unfrozen. The
      // texture setters retain their normal readiness invalidation on live toon
      // materials; only a genuinely frozen material needs the extra unlock.
      let wait;while((wait=this.waitForViewport('promote')))await wait;
      if(this.disposed||this.contextLost||!this.wanted.has(id))throw mapLoadAbortError();
      if(this.pending===id)this.stats.highTextureStage='promote';
      const promoteStarted=this.clock?.()??performance.now();
      for(const {material}of originals){if(material.isFrozen)material.unfreeze();Object.assign(material,textures);if(!material.metadata?.villageToon)material.freeze();}
      // Synchronous material assignment/invalidation only: fetching, decoding,
      // prior KTX upload calls and later driver draw costs are not GPU time here.
      this.stats.highTextureLastPromoteMs=Math.max(0,(this.clock?.()??performance.now())-promoteStarted);
      this.resident.set(id,{textures,originals,bytes:this.profileBytes(config),resolution:config.textures.albedo.width,readyAt:this.clock?.()??performance.now()});this.stats.highTextureLoads++;this.syncStats();
      this.stats.highTextureFormat=textures.albedoTexture.getInternalTexture?.()?.format??null;
      try{this.world?.requestDrawCpuCapture?.('texture-promote');}catch{/* Optional diagnostics cannot invalidate a successful promotion. */}
    }catch(error){Object.values(textures).forEach(t=>releaseMapTexture(t,this.world?.scene));throw error;}
  }
  release(id){
    const entry=this.resident.get(id);if(!entry)return;
    for(const {material,values}of entry.originals){if(material.isFrozen)material.unfreeze();Object.assign(material,values);if(!material.metadata?.villageToon)material.freeze();}
    for(const t of Object.values(entry.textures))releaseMapTexture(t,this.world?.scene);
    this.resident.delete(id);this.stats.highTextureReleases++;this.syncStats();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.viewportWait?.cancel(mapLoadAbortError());for(const cancel of [...this.textureWaiters])cancel();
    this.stats.highTexturePendingAsset=null;this.stats.highTextureStage='disposed';this.stats.highTextureViewportWaiting=false;
    this.world.scene.onAfterRenderObservable.remove(this.observer);
    this.world.scene.onDisposeObservable.remove(this.disposeObserver);
    const engine=this.world.scene.getEngine();engine.onContextLostObservable?.remove(this.contextLostObserver);engine.onContextRestoredObservable?.remove(this.contextRestoredObserver);
    for(const id of [...this.resident.keys()])this.release(id);
  }
}
