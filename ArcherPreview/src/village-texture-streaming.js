import {Frustum,Texture} from '@babylonjs/core';
import {projectedCoverage,VILLAGE_LOD_COVERAGE} from './village-lod.js';
import {VILLAGE_TEXTURE_BUDGET,highTextureBytes,selectHighTextures} from './village-texture-budget.js';

export const shouldReleaseHighTexture=(lastWanted,now,touch)=>now-lastWanted>(touch?12000:20000);
// gammaSpace's getter is false for glTF textures already decoded by the GPU.
// Copying that value to a plain RGBA texture skips sRGB decoding and washes out
// only the asset promoted to the near tier. Set source color space explicitly.
export const highTextureOptions=(role,old)=>({noMipmap:false,invertY:old?.invertY??false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,useSRGBBuffer:role==='albedo',gammaSpace:role==='albedo'});

// One asset at a time. The persistent content cache retains downloaded files;
// only temporary high-resolution GPU allocations are released on distance exit.
export class VillageTextureStreaming {
  constructor(world,assets,records,manifestUrl,stats){
    this.world=world;this.assets=assets;this.records=records;this.url=manifestUrl;this.stats=stats;
    this.resident=new Map();this.failed=new Set();this.wanted=new Map();this.lastWanted=new Map();
    this.nextCheck=0;this.pending=null;this.pendingBytes=0;this.disposed=false;
    this.budget=world.touchDevice?VILLAGE_TEXTURE_BUDGET.mobile:VILLAGE_TEXTURE_BUDGET.desktop;
    this.maxTextureSize=world.scene.getEngine().getCaps().maxTextureSize;
    const caps=world.scene.getEngine().getCaps();
    this.compressedSupported=!!(caps.etc2||caps.s3tc||caps.bptc||caps.etc1||caps.pvrtc);
    if(world.touchDevice&&this.compressedSupported&&[...assets.values()].every(a=>a.config.highTextures?.textures?.albedo?.codec))this.budget=VILLAGE_TEXTURE_BUDGET.mobileCompressed;
    this.lastView=null;this.settleUntil=0;
    Object.assign(stats,{highTextureAssets:0,highTexturePending:0,highTextureMax:0,highTextureLoads:0,highTextureReleases:0,highTextureError:null,highTextureBudget:this.budget,highTextureBytes:0,highTextureReserved:0,highTexturePeak:0});
    this.observer=world.scene.onAfterRenderObservable.add(()=>this.update(performance.now()));
  }
  update(now){
    if(this.disposed||this.world.villageStreaming?.active===false||this.world.villageStreaming?.pending||now<this.nextCheck)return;
    this.nextCheck=now+250;const candidates=new Map();
    const camera=this.world.camera,planes=Frustum.GetPlanes(camera.getTransformationMatrix());
    const view=camera.getViewMatrix().m;
    if(this.lastView&&view.some((v,i)=>i<12&&Math.abs(v-this.lastView[i])>.035))this.settleUntil=now+350;
    this.lastView=Array.from(view);
    for(const record of this.records){
      if(!record.root.isEnabled())continue;
      const asset=this.assets.get(record.placement.asset),config=asset?.config;
      if(!config?.highTextures||(asset.baseLevel!==undefined&&asset.baseLevel!==0))continue;
      for(const mesh of record.meshes){
        if(!mesh.isInFrustum(planes))continue;
        const coverage=projectedCoverage(camera,mesh.getBoundingInfo().boundingSphere);
        if(coverage>VILLAGE_LOD_COVERAGE.mid){
          const id=record.placement.asset;
          if(!this.failed.has(id)){candidates.set(id,Math.max(coverage,candidates.get(id)??0));this.lastWanted.set(id,now);}
        }
      }
    }
    // Briefly keep off-screen maps only if they fit after visible candidates.
    for(const id of this.resident.keys())if(!candidates.has(id)&&!shouldReleaseHighTexture(this.lastWanted.get(id)??0,now,this.world.touchDevice))candidates.set(id,0);
    this.wanted=selectHighTextures(candidates,this.assets,this.resident,this.budget,this.maxTextureSize,this.compressedSupported);
    // Evict before replacement. An unfinished request keeps its reservation until
    // it finishes/cancels, preventing transient double allocation during turns.
    for(const id of this.resident.keys())if(!this.wanted.has(id))this.release(id);
    if(!this.pending&&now>=this.settleUntil){
      const candidate=[...this.wanted].filter(([id])=>!this.resident.has(id)&&!this.failed.has(id)).sort((a,b)=>b[1]-a[1])[0];
      if(candidate)this.start(candidate[0]);
    }
    this.syncStats();
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
    const url=new URL(config.url,this.url).href;
    const texture=await new Promise((resolve,reject)=>{
      const item=new Texture(url,this.world.scene,{...highTextureOptions(role,old),
        onLoad:()=>resolve(item),onError:(message,error)=>{item.dispose();reject(error??new Error(message||'High texture load failed'));}});
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
    this.pending=id;this.pendingBytes=bytes;this.stats.highTexturePending=1;this.syncStats();
    return this.load(id).catch(error=>{
      this.failed.add(id);this.stats.highTextureError=`${id}: ${error.message??error}`;
      console.warn('Village high texture stopped; no automatic retry.',id,error);
    }).finally(()=>{this.pending=null;this.pendingBytes=0;this.stats.highTexturePending=0;this.syncStats();});
  }
  async load(id){
    const asset=this.assets.get(id),materials=(asset.nearSource??asset.source).materials.filter(m=>m.albedoTexture),config=asset.config.highTextures;
    if(!materials.length)throw new Error('Near material does not expose an albedo texture');
    const slots=config.shading==='toon-color'?{albedo:'albedoTexture'}:{albedo:'albedoTexture',normal:'bumpTexture',orm:'metallicTexture'},textures={},originals=materials.map(material=>({material,values:Object.fromEntries(Object.values(slots).map(k=>[k,material[k]]))}));
    try{
      if(this.world?.prefetchResources)await this.world.prefetchResources(config.resources);
      for(const [role,slot]of Object.entries(slots)){
        textures[slot]=await this.loadTexture(config.textures[role],materials[0][slot],role);
        if(this.disposed||!this.wanted.has(id)){Object.values(textures).forEach(t=>t.dispose());return;}
        const size=textures[slot].getSize(),expected=config.textures[role];
        if(size.width!==expected.width||size.height!==expected.height)throw new Error('Texture dimensions differ from the budgeted profile');
      }
      for(const {material}of originals){material.unfreeze();Object.assign(material,textures);if(!material.metadata?.villageToon)material.freeze();}
      this.resident.set(id,{textures,originals,bytes:highTextureBytes(config,this.compressedSupported),resolution:config.textures.albedo.width});this.stats.highTextureLoads++;this.syncStats();
      this.stats.highTextureFormat=textures.albedoTexture.getInternalTexture?.()?.format??null;
    }catch(error){Object.values(textures).forEach(t=>t.dispose());throw error;}
  }
  release(id){
    const entry=this.resident.get(id);if(!entry)return;
    for(const {material,values}of entry.originals){material.unfreeze();Object.assign(material,values);if(!material.metadata?.villageToon)material.freeze();}
    for(const t of Object.values(entry.textures))t.dispose();
    this.resident.delete(id);this.stats.highTextureReleases++;this.syncStats();
  }
  dispose(){
    this.disposed=true;this.world.scene.onAfterRenderObservable.remove(this.observer);
    for(const id of [...this.resident.keys()])this.release(id);
  }
}
