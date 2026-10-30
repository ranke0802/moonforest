import {Color4,Constants,MaterialPluginBase,Mesh,RawTexture,ShaderMaterial,Texture,Vector4} from '@babylonjs/core';
import {CaveFogMemory,CaveFogOfWar,CAVE_FOG_VISIBLE,caveFogAllowsRecord,caveFogRootEnabled} from './cave-fog-of-war.js';
import {CAVE_FOG_GLSL,CAVE_FOG_COVER_FRAGMENT} from './cave-fog-cover.js';
import {caveSurface} from './witch-cave-layout.js';
import {caveRockOccludes} from './witch-cave-sight.js';
import {caveFogFallback} from './cave-fog-binding.js';

const fogFunctions=CAVE_FOG_GLSL.replace('uniform vec4 caveFogRect;','').replace('uniform float caveFogActive;','');
class CaveFogShade extends MaterialPluginBase {
  constructor(material,runtime){super(material,'CaveFogOfWar',490,{},true,false);this.runtime=runtime;this.standard=material.getClassName()==='StandardMaterial';this.registerForExtraEvents=true;this._enable(true);}
  getSamplers(samplers){samplers.push('caveFogMap');}
  getUniforms(){return {ubo:[{name:'caveFogRect',size:4,type:'vec4'},{name:'caveFogActive',size:1,type:'float'},{name:'caveFogCutout',size:1,type:'float'}],fragment:'uniform vec4 caveFogRect;uniform float caveFogActive;uniform float caveFogCutout;'};}
  hardBindForSubMesh(buffer){const r=this.runtime,active=r&&!r.disposed&&r.fog.ready;buffer.updateFloat('caveFogActive',active?1:0);buffer.updateFloat('caveFogCutout',this._material.alpha<1?1:0);buffer.setTexture('caveFogMap',active?r.texture:caveFogFallback(this._material.getScene()));if(active)buffer.updateFloat4('caveFogRect',r.rect.x,r.rect.y,r.rect.z,r.rect.w);}
  getCustomCode(type){if(type!=='fragment')return null;const color=this.standard?'color':'finalColor';return {CUSTOM_FRAGMENT_DEFINITIONS:fogFunctions,CUSTOM_FRAGMENT_MAIN_BEGIN:'if(caveFogActive>.5&&caveFogCutout>.5&&caveFogHidesInk(vPositionW))discard;',CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:`${color}.rgb=caveFogShade(${color}.rgb,vPositionW);`};}
}

// Count cells from the same prefix sum as the visibility test. A cover patch is
// omitted only when its entire XZ footprint is currently visible.
export function fogBoundsFullyVisible(fog,min,max){
  const x0=Math.floor((min.x-fog.minX)/fog.cellSize),z0=Math.floor((min.z-fog.minZ)/fog.cellSize),x1=Math.floor((max.x-fog.minX)/fog.cellSize),z1=Math.floor((max.z-fog.minZ)/fog.cellSize);
  if(x0<0||z0<0||x1>=fog.cols||z1>=fog.rows)return false;
  const s=fog.sums,stride=fog.cols+1,count=s[(z1+1)*stride+x1+1]-s[z0*stride+x1+1]-s[(z1+1)*stride+x0]+s[z0*stride+x0];
  return count===(x1-x0+1)*(z1-z0+1);
}

export class CaveFogRuntime {
  constructor(world,{memory=world.caveFogMemory??=new CaveFogMemory(4),isOpaque=(x,z)=>world.terrain.heightAt(x,z)>caveSurface(x,z).height+1.5||caveRockOccludes(x,z,.2),...options}={}){
    this.world=world;this.fog=new CaveFogOfWar({...options,isOpaque,memory,mapKey:'witch-cave'});this.rect=new Vector4(this.fog.minX,this.fog.minZ,this.fog.cols*this.fog.cellSize,this.fog.rows*this.fog.cellSize);
    this.texture=new RawTexture(this.fog.rgba,this.fog.cols,this.fog.rows,Constants.TEXTUREFORMAT_RGBA,world.scene,false,false,Texture.BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.texture.name='cave-player-visibility';this.texture.wrapU=this.texture.wrapV=Texture.CLAMP_ADDRESSMODE;this.texture.gammaSpace=false;
    this.plugins=new Set();this.materials=new WeakSet();this.materialDisposals=new Map();this.recordMeshes=new WeakSet();this.hidden=new Map();this.hiddenOverlays=new Set();this.owned=new Set();this.shadowScratch=[];this.shadowOriginal=null;this.encounters=[];this.time=0;this.disposed=false;this.patches=[];this.dynamic=[];this.inventoryDirty=true;this.materialDirty=true;this.meshCount=-1;this.materialCount=-1;
    this.stats={uploads:0,hiddenRecords:0,hiddenMeshes:0,hiddenShadowCasters:0,detailPatches:0,coverPatches:0,coverDraws:0,coverTriangles:0};
    world.scene.metadata={...world.scene.metadata,caveFogRuntime:this};this.previousClearColor=world.scene.clearColor;this.clearColor=new Color4(0,0,0,1);world.scene.clearColor=this.clearColor;
    this.installGround(world.ground);
    this.materialObserver=world.scene.onNewMaterialAddedObservable.add(material=>this.attach(material));
    this.removedMaterial=world.scene.onMaterialRemovedObservable.add(()=>{this.materialDirty=true;});
    this.newMesh=world.scene.onNewMeshAddedObservable.add(()=>{this.inventoryDirty=true;});
    this.removedMesh=world.scene.onMeshRemovedObservable.add(()=>{this.inventoryDirty=true;});
    this.before=world.scene.onBeforeRenderObservable.add(()=>this.beforeRender());
    this.after=world.scene.onAfterRenderObservable.add(()=>this.restore());
    this.sceneDispose=world.scene.onDisposeObservable.addOnce(()=>this.dispose());
    for(const material of world.scene.materials)this.attach(material);
  }
  attach(material){
    if(this.disposed||this.materials.has(material)||!['PBRMaterial','StandardMaterial'].includes(material.getClassName()))return;
    this.materials.add(material);const frozen=material.isFrozen;material.unfreeze();
    const plugin=material.pluginManager?.getPlugin('CaveFogOfWar')??new CaveFogShade(material,this);plugin.runtime=this;this.plugins.add(plugin);if(frozen)material.freeze();
    this.materialDisposals.set(material,material.onDisposeObservable.addOnce(()=>{this.plugins.delete(plugin);this.materialDisposals.delete(material);}));
  }
  bind(material){
    const active=!this.disposed&&this.fog.ready?1:0,effect=material.getEffect?.();
    material.setTexture('caveFogMap',this.texture);material.setVector4('caveFogRect',this.rect);material.setFloat('caveFogActive',active);
    effect?.setTexture('caveFogMap',this.texture);effect?.setVector4('caveFogRect',this.rect);effect?.setFloat('caveFogActive',active);
  }
  allowsPoint(position){return !this.fog.ready||this.fog.stateAt(position.x,position.z)===CAVE_FOG_VISIBLE;}
  allowsBounds(min,max){return this.fog.boundsVisible(min,max);}
  update(player,time=this.time,{force=false,encounters=this.encounters}={}){
    if(this.disposed)return false;this.time=time;this.encounters=encounters??[];this.playerRoot=player?.position?player:null;
    const position=player?.position??player;if(!position)return false;
    const changed=this.fog.update(position,time,{force});
    if(changed){this.texture.update(this.fog.rgba);this.stats.uploads++;this.updateRecords();this.updateGround();if(this.world.villageVisibility){this.world.villageVisibility.timer=0;this.world.villageVisibility.shadowTimer=0;}this.world.villageStreaming?.demand.invalidate();}
    return changed;
  }
  updateRecords(records=this.world.villagePrepared?.records??this.world.villageRenderRecords??[]){
    let hidden=0;
    for(const record of records){record.fogVisible=caveFogAllowsRecord(this.fog,record);record.fogOwner=this;record.fogRevision=this.fog.revision;if(!record.fogVisible)hidden++;record.root.setEnabled(caveFogRootEnabled(record));for(const mesh of record.meshes)this.recordMeshes.add(mesh);}
    this.stats.hiddenRecords=hidden;
  }
  installGround(ground){
    if(!ground?.geometry)return;
    const material=new ShaderMaterial('cave-terrain-fog-cover',this.world.scene,{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;uniform mat4 world;varying vec3 fogWorldPosition;void main(){vec3 p=position+vec3(0.,.025,0.);fogWorldPosition=(world*vec4(p,1.)).xyz;gl_Position=worldViewProjection*vec4(p,1.);}',fragmentSource:CAVE_FOG_COVER_FRAGMENT},{attributes:['position'],uniforms:['world','worldViewProjection','caveFogRect','caveFogActive'],samplers:['caveFogMap']});
    material.backFaceCulling=false;material.disableDepthWrite=false;material.onBindObservable.add(()=>this.bind(material));
    const cover=new Mesh('cave-terrain-fog-cover',this.world.scene);ground.geometry.applyToMesh(cover);cover.material=material;cover.isPickable=false;cover.receiveShadows=false;cover.metadata={caveFogCover:true};cover.freezeWorldMatrix();cover.releaseSubMeshes();
    for(const source of ground.subMeshes){
      const sub=source.clone(cover,cover),bounds=source.getBoundingInfo().boundingBox,entry={source,sub,min:bounds.minimumWorld.clone(),max:bounds.maximumWorld.clone(),detail:true,cover:true,sourceCull:source.isInFrustum,sourceRender:source.render,coverCull:sub.isInFrustum,coverRender:sub.render};
      source.isInFrustum=function(...args){return entry.detail&&entry.sourceCull.apply(this,args);};source.render=function(...args){if(entry.detail)return entry.sourceRender.apply(this,args);};
      sub.isInFrustum=function(...args){return entry.cover&&entry.coverCull.apply(this,args);};const stats=this.stats;
      sub.render=function(...args){if(entry.cover){stats.coverDraws++;stats.coverTriangles+=this.indexCount/3;return entry.coverRender.apply(this,args);}};
      this.patches.push(entry);
    }
    this.ground=ground;this.cover=cover;this.coverMaterial=material;
  }
  updateGround(){let detail=0,cover=0;for(const p of this.patches){p.detail=this.fog.boundsVisible(p.min,p.max);p.cover=!fogBoundsFullyVisible(this.fog,p.min,p.max);detail+=Number(p.detail);cover+=Number(p.cover);}this.stats.detailPatches=detail;this.stats.coverPatches=cover;}
  hideMesh(mesh){if(mesh&&!mesh.isDisposed()&&mesh.isVisible){this.hidden.set(mesh,true);mesh.isVisible=false;}if(mesh){mesh.metadata??={};mesh.metadata.caveFogVisible=false;}}
  applyOwnedMesh(mesh,visible){if(!mesh)return;this.owned.add(mesh);if(visible&&mesh.material?.getClassName()==='ShaderMaterial'&&!mesh.material.options?.samplers?.includes('caveFogMap')){mesh.computeWorldMatrix();const b=mesh.getBoundingInfo().boundingBox;visible=fogBoundsFullyVisible(this.fog,b.minimumWorld,b.maximumWorld);}mesh.metadata??={};mesh.metadata.caveFogVisible=visible;if(!visible)this.hideMesh(mesh);}
  gateOverlay(mesh){if(!mesh.renderOverlay)return;const b=mesh.getBoundingInfo().boundingBox;if(!fogBoundsFullyVisible(this.fog,b.minimumWorld,b.maximumWorld)){mesh.renderOverlay=false;this.hiddenOverlays.add(mesh);}}
  beforeRender(){
    if(this.disposed)return;this.restore();if(this.playerRoot&&!this.playerRoot.isDisposed?.())this.update(this.playerRoot,this.time);
    const scene=this.world.scene;
    if(this.inventoryDirty||this.meshCount!==scene.meshes.length){this.meshCount=scene.meshes.length;this.inventoryDirty=false;this.updateRecords();this.dynamic=scene.meshes.filter(mesh=>mesh!==this.ground&&mesh!==this.cover&&!this.recordMeshes.has(mesh));}
    this.stats.coverDraws=0;this.stats.coverTriangles=0;
    // Asynchronous model/LOD/material completions must enter the gate before
    // their first frame, including paused previews and loading-screen renders.
    if(this.materialDirty||this.materialCount!==scene.materials.length){this.materialDirty=false;this.materialCount=scene.materials.length;for(const material of scene.materials)this.attach(material);}
    const owned=this.owned;owned.clear();
    for(const enemy of this.encounters){
      const visible=this.allowsPoint(enemy.actor.position);enemy.fogVisible=visible;
      for(const mesh of enemy.asset?.meshes??[]){this.applyOwnedMesh(mesh,visible);if(visible)this.gateOverlay(mesh);}this.applyOwnedMesh(enemy.ring,visible);this.applyOwnedMesh(enemy.spell?.mesh,visible);this.applyOwnedMesh(enemy.spell?.rim,visible);this.applyOwnedMesh(enemy.contact?.mesh,visible);
    }
    for(const mesh of this.dynamic){
      if(this.recordMeshes.has(mesh)||owned.has(mesh)||!mesh.isVisible||!mesh.isEnabled()||!mesh.getTotalVertices?.()||mesh===this.playerRoot||(this.playerRoot&&mesh.isDescendantOf(this.playerRoot)))continue;
      mesh.computeWorldMatrix();const b=mesh.getBoundingInfo().boundingBox,shader=mesh.material?.getClassName()==='ShaderMaterial',supportsFog=mesh.material?.options?.samplers?.includes('caveFogMap');
      const visible=shader&&!supportsFog?fogBoundsFullyVisible(this.fog,b.minimumWorld,b.maximumWorld):this.fog.boundsVisible(b.minimumWorld,b.maximumWorld,0);mesh.metadata??={};mesh.metadata.caveFogVisible=visible;if(!visible)this.hideMesh(mesh);else this.gateOverlay(mesh);
    }
    const shadow=this.world.shadows?.getShadowMap?.(),list=shadow?.renderList;
    if(list){this.shadowScratch.length=0;for(const mesh of list)if(mesh.isVisible&&mesh.isEnabled()&&mesh.metadata?.caveFogVisible!==false)this.shadowScratch.push(mesh);this.stats.hiddenShadowCasters=list.length-this.shadowScratch.length;this.shadowOriginal=list;shadow.renderList=this.shadowScratch;}
    this.stats.hiddenMeshes=this.hidden.size;
  }
  restore(){
    for(const mesh of this.hidden.keys())if(!mesh.isDisposed())mesh.isVisible=true;this.hidden.clear();
    for(const mesh of this.hiddenOverlays)if(!mesh.isDisposed())mesh.renderOverlay=true;this.hiddenOverlays.clear();
    if(this.shadowOriginal){const map=this.world.shadows?.getShadowMap?.();if(map)map.renderList=this.shadowOriginal;this.shadowOriginal=null;}
  }
  inspect(){return {...this.fog.stats,...this.stats,revision:this.fog.revision,maskBytes:this.fog.rgba.byteLength,sharedTerrainGeometry:this.cover?.geometry===this.ground?.geometry,coverPatchLimit:this.patches.length};}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.restore();const scene=this.world.scene;
    for(const enemy of this.encounters)enemy.fogVisible=true;
    this.encounters=[];
    scene.onNewMaterialAddedObservable.remove(this.materialObserver);scene.onMaterialRemovedObservable.remove(this.removedMaterial);scene.onNewMeshAddedObservable.remove(this.newMesh);scene.onMeshRemovedObservable.remove(this.removedMesh);scene.onBeforeRenderObservable.remove(this.before);scene.onAfterRenderObservable.remove(this.after);scene.onDisposeObservable.remove(this.sceneDispose);
    for(const p of this.patches){p.source.isInFrustum=p.sourceCull;p.source.render=p.sourceRender;}
    for(const plugin of this.plugins)if(plugin.runtime===this)plugin.runtime=null;this.plugins.clear();
    for(const [material,observer]of this.materialDisposals)material.onDisposeObservable.remove(observer);this.materialDisposals.clear();
    this.cover?.dispose();this.coverMaterial?.dispose();this.texture.dispose();this.fog.dispose();
    if(scene.clearColor===this.clearColor)scene.clearColor=this.previousClearColor;
    if(scene.metadata?.caveFogRuntime===this)scene.metadata.caveFogRuntime=null;
  }
}
export function configureCaveFog(world){world.caveFog?.dispose();world.caveFog=null;world.caveFogMemory??=new CaveFogMemory(4);if(world.cave)world.caveFog=new CaveFogRuntime(world);return world.caveFog;}
