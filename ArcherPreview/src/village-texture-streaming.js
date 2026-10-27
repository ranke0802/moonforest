import {Frustum,Texture} from '@babylonjs/core';
import {projectedCoverage,VILLAGE_LOD_COVERAGE} from './village-lod.js';

export const shouldReleaseHighTexture=(lastWanted,now,touch)=>now-lastWanted>(touch?1500:3000);

// One asset at a time. The persistent content cache retains downloaded files;
// only temporary high-resolution GPU allocations are released on distance exit.
export class VillageTextureStreaming {
  constructor(world,assets,records,manifestUrl,stats){
    this.world=world;this.assets=assets;this.records=records;this.url=manifestUrl;this.stats=stats;
    this.resident=new Map();this.failed=new Set();this.wanted=new Map();this.lastWanted=new Map();
    this.nextCheck=0;this.pending=null;this.disposed=false;
    Object.assign(stats,{highTextureAssets:0,highTexturePending:0,highTextureMax:0,highTextureLoads:0,highTextureReleases:0,highTextureError:null});
    this.supported=world.scene.getEngine().getCaps().maxTextureSize>=8192;
    if(!this.supported)stats.highTextureError='이 기기의 GPU는 8K 텍스처를 지원하지 않습니다.';
    this.observer=world.scene.onAfterRenderObservable.add(()=>this.update(performance.now()));
  }
  update(now){
    if(this.disposed||!this.supported||now<this.nextCheck)return;
    this.nextCheck=now+250;this.wanted.clear();
    const camera=this.world.camera,planes=Frustum.GetPlanes(camera.getTransformationMatrix());
    for(const record of this.records){
      if(!record.root.isEnabled())continue;
      const config=this.assets.get(record.placement.asset)?.config;
      if(!config?.highTextures)continue;
      for(const mesh of record.meshes){
        if(!mesh.isInFrustum(planes))continue;
        const coverage=projectedCoverage(camera,mesh.getBoundingInfo().boundingSphere);
        if(coverage>VILLAGE_LOD_COVERAGE.mid){
          const id=record.placement.asset;
          this.wanted.set(id,Math.max(coverage,this.wanted.get(id)??0));this.lastWanted.set(id,now);
        }
      }
    }
    for(const id of this.resident.keys())if(shouldReleaseHighTexture(this.lastWanted.get(id)??0,now,this.world.touchDevice))this.release(id);
    if(!this.pending){
      const candidate=[...this.wanted].filter(([id])=>!this.resident.has(id)&&!this.failed.has(id)).sort((a,b)=>b[1]-a[1])[0];
      if(candidate)this.start(candidate[0]);
    }
    this.stats.highTextureAssets=this.resident.size;
  }
  async loadTexture(config,old){
    const url=new URL(config.url,this.url).href;
    const texture=await new Promise((resolve,reject)=>{
      const item=new Texture(url,this.world.scene,false,old?.invertY??false,Texture.TRILINEAR_SAMPLINGMODE,
        ()=>resolve(item),(message,error)=>{item.dispose();reject(error??new Error(message||'8K texture load failed'));});
    });
    for(const key of ['coordinatesIndex','coordinatesMode','wrapU','wrapV','uScale','vScale','uOffset','vOffset','uAng','vAng','wAng','level','gammaSpace','hasAlpha']){
      if(old&&old[key]!==undefined)texture[key]=old[key];
    }
    return texture;
  }
  start(id){
    this.pending=id;this.stats.highTexturePending=1;
    this.load(id).catch(error=>{
      this.failed.add(id);this.stats.highTextureError=`${id}: ${error.message??error}`;
      console.warn('Village high texture stopped; no automatic retry.',id,error);
    }).finally(()=>{this.pending=null;this.stats.highTexturePending=0;});
  }
  async load(id){
    const asset=this.assets.get(id),materials=asset.source.materials.filter(m=>m.albedoTexture),config=asset.config.highTextures;
    if(!materials.length)throw new Error('Near material does not expose an albedo texture');
    const slots={albedo:'albedoTexture',normal:'bumpTexture',orm:'metallicTexture'},textures={},originals=materials.map(material=>({material,values:Object.fromEntries(Object.values(slots).map(k=>[k,material[k]]))}));
    try{
      for(const [role,slot]of Object.entries(slots)){
        textures[slot]=await this.loadTexture(config.textures[role],materials[0][slot]);
        if(this.disposed||!this.wanted.has(id)){Object.values(textures).forEach(t=>t.dispose());return;}
      }
      const size=textures.albedoTexture.getSize();
      if(size.width!==8192||size.height!==8192)throw new Error('8K texture was unexpectedly resized');
      for(const {material}of originals){material.unfreeze();Object.assign(material,textures);material.freeze();}
      this.resident.set(id,{textures,originals});this.stats.highTextureLoads++;this.stats.highTextureAssets=this.resident.size;this.stats.highTextureMax=8192;
    }catch(error){Object.values(textures).forEach(t=>t.dispose());throw error;}
  }
  release(id){
    const entry=this.resident.get(id);if(!entry)return;
    for(const {material,values}of entry.originals){material.unfreeze();Object.assign(material,values);material.freeze();}
    for(const t of Object.values(entry.textures))t.dispose();
    this.resident.delete(id);this.stats.highTextureReleases++;this.stats.highTextureAssets=this.resident.size;
    if(!this.resident.size)this.stats.highTextureMax=0;
  }
  dispose(){
    this.disposed=true;this.world.scene.onAfterRenderObservable.remove(this.observer);
    for(const id of [...this.resident.keys()])this.release(id);
  }
}
