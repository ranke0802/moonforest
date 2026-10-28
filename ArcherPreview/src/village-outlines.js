import {Color3,Constants,Frustum,ShaderMaterial,Vector2} from '@babylonjs/core';
import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js';
import {projectedCoverage} from './village-lod.js';

const vertexSource=`precision highp float;
attribute vec3 position;attribute vec3 normal;
uniform mat4 viewProjection;
uniform vec3 inkCamera;uniform vec2 inkFogRange;uniform vec2 inkSingle;
#include<instancesDeclaration>
#ifdef INSTANCES
attribute vec2 villageInk;
#endif
varying float inkCoverage;
void main(void){
  #include<instancesVertex>
  vec2 ink=inkSingle;
  #ifdef INSTANCES
  ink=villageInk;
  #endif
  vec4 p=finalWorld*vec4(position,1.0);
  p.xyz+=normalize(mat3(finalWorld)*normal)*ink.y;
  inkCoverage=ink.x*(1.0-smoothstep(inkFogRange.x,inkFogRange.y,distance(p.xyz,inkCamera)));gl_Position=viewProjection*p;
}`;
const fragmentSource=`precision highp float;
uniform vec3 inkColor;varying float inkCoverage;
float inkBayer2(vec2 p){return 2.0*mod(p.x+p.y,2.0)+mod(p.y,2.0);}
void main(void){
  vec2 p=mod(floor(gl_FragCoord.xy),4.0);
  float threshold=(4.0*inkBayer2(mod(p,2.0))+inkBayer2(floor(p/2.0))+0.5)/16.0;
  if(inkCoverage<threshold)discard;
  gl_FragColor=vec4(inkColor,1.0);
}`;

// Only a subset of the batch that REALLY drew may receive ink. Never re-run
// frustum/LOD selection or borrow readiness from another instance of the asset.
export function outlineBatch(batch,id,selected){
  const visible=(batch.visibleInstances[id]??[]).filter(mesh=>selected.has(mesh)&&mesh.instancedBuffers?.villageInk?.x>0);
  if(!visible.length)return null;
  return {...batch,renderSelf:{[id]:false},visibleInstances:{[id]:visible}};
}

// Attach ink to the successful base draw, using its exact geometry, LOD and
// instance batch. Independent shell meshes could survive a base/LOD change.
// No shell objects, textures, render targets or geometry copies are allocated.
export class VillageOutlines {
  constructor(world,records,stats){
    this.world=world;this.stats=stats;this.sources=new Set();this.baseObservers=[];this.entries=[];this.selected=new Set();this.selectedMeshes=new Set();this.next=0;this.drawing=false;this.drawn=new WeakMap();
    // A private draw wrapper must not overwrite the base PBR submesh effect.
    this.material=new ShaderMaterial('village-ink',world.scene,{vertexSource,fragmentSource},{attributes:['position','normal','villageInk'],uniforms:['world','viewProjection','inkColor','inkCamera','inkFogRange','inkSingle']},false);
    this.material.setVector2('inkSingle',new Vector2(0,0));
    this.material.backFaceCulling=true;this.material.cullBackFaces=false;this.material.disableDepthWrite=true;
    this.material.metadata={villageOutline:true};
    Object.assign(this.material.stencil,{enabled:true,func:Constants.NOTEQUAL,backFunc:Constants.NOTEQUAL,funcRef:4,funcMask:4,mask:0,opStencilDepthPass:Constants.KEEP,backOpStencilDepthPass:Constants.KEEP});
    this.material.setColor3('inkColor',new Color3(.065,.052,.044));
    this.material.setVector2('inkFogRange',new Vector2(world.scene.fogStart,world.scene.fogEnd));
    const sourceFor=original=>{
      if(this.sources.has(original))return;
      this.sources.add(original);
      original.registerInstancedBuffer('villageInk',2);original.instancedBuffers.villageInk=new Vector2(0,0);
      const observer=original.onBeforeDrawObservable.add(()=>{
        if(!this.drawing&&!world.scene._isInIntermediateRendering())this.drawn.set(original,world.scene.getRenderId());
      });
      this.baseObservers.push({original,observer});
      for(const lod of original.getLODLevels())if(lod.mesh)sourceFor(lod.mesh);
    };
    for(const record of records)for(const mesh of record.meshes){
      if(['ground-detail','shrub','garden'].includes(record.placement.kind))continue;
      sourceFor(mesh.sourceMesh??mesh);
      mesh.instancedBuffers.villageInk=new Vector2(0,0);
      this.entries.push({record,mesh,coverage:0});
    }
    world.scene._afterRenderingMeshStage.registerStep(2,this,this.afterBase);
    this.observer=world.scene.onBeforeRenderObservable.add(()=>this.update(performance.now()));
  }
  async prepare(){
    for(const source of this.sources){
      await this.material.forceCompilationAsync(source,{useInstances:true});
    }
  }
  afterBase(mesh,subMesh,batch){
    const scene=this.world.scene,engine=scene.getEngine();
    if(this.drawing||scene._isInIntermediateRendering()||!this.sources.has(mesh)||this.drawn.get(mesh)!==scene.getRenderId())return;
    // Consume the proof for this submesh; another submesh needs its own draw.
    this.drawn.delete(mesh);
    const inkBatch=outlineBatch(batch,subMesh._id,this.selectedMeshes);
    if(!inkBatch)return;
    // All village placements use hardware instances. A mirrored standalone
    // fallback is deliberately skipped instead of outlining an unrelated batch.
    if(subMesh.getMesh()._internalAbstractMeshDataInfo._actAsRegularMesh)return;
    if(!this.material.isReady(mesh,true))return;
    const effect=this.material.getEffect(),depthWrite=engine.getDepthWrite(),depth=engine._depthCullingState;
    const state={cull:depth.cull,cullFace:depth.cullFace,frontFace:depth.frontFace,zOffset:depth.zOffset,zOffsetUnits:depth.zOffsetUnits};
    const stencil=engine.stencilStateComposer.stencilMaterial;
    this.drawing=true;
    try{
      scene.resetCachedMaterial();
      // Two-sided trees do not populate Babylon's cached effective winding.
      // Derive it explicitly so mirrored glTF roots also cull front faces.
      let orientation=mesh.material._getEffectiveOrientation(mesh);
      if(mesh._getWorldMatrixDeterminant()<0)orientation=orientation===Constants.MATERIAL_ClockWiseSideOrientation?Constants.MATERIAL_CounterClockWiseSideOrientation:Constants.MATERIAL_ClockWiseSideOrientation;
      this.material._preBind(undefined,orientation);
      this.material.bind(mesh.getWorldMatrix(),mesh);engine.setDepthWrite(false);
      mesh._processRendering(mesh,subMesh,effect,Constants.MATERIAL_TriangleFillMode,inkBatch,true);
      this.stats.outlineDraws=(this.stats.outlineDraws??0)+1;
    }finally{
      this.material.unbind();engine.setDepthWrite(depthWrite);
      Object.assign(depth,state);engine.stencilStateComposer.stencilMaterial=stencil;
      scene.resetCachedMaterial();this.drawing=false;
    }
  }
  update(now){
    this.material.setVector3('inkCamera',this.world.camera.globalPosition);
    if(now>=this.next){
      this.next=now+150;const camera=this.world.camera,planes=Frustum.GetPlanes(camera.getTransformationMatrix());
      const ranked=[];
      for(const entry of this.entries){
        const {record,mesh}=entry;
        if(!record.root.isEnabled()||!mesh.isInFrustum(planes))continue;
        entry.coverage=projectedCoverage(camera,mesh.getBoundingInfo().boundingSphere);
        if(entry.coverage>.02)ranked.push(entry);
      }
      ranked.sort((a,b)=>b.coverage*(this.selected.has(b)?1.15:1)-a.coverage*(this.selected.has(a)?1.15:1));
      const selected=new Set(ranked.slice(0,this.world.touchDevice?32:52));
      for(const entry of this.selected)if(!selected.has(entry))entry.mesh.instancedBuffers.villageInk.set(0,0);
      this.selected=selected;this.stats.outlineInstances=selected.size;
    }
    this.selectedMeshes.clear();
    for(const entry of this.selected){
      const {record,mesh}=entry;
      const coverage=mesh.instancedBuffers?.treeCoverage??1;
      mesh.instancedBuffers.villageInk.set(record.root.isEnabled()?coverage*Math.min(1,(entry.coverage-.02)/.025):0,record.placement.kind==='tree'?.007:.012);
      if(mesh.instancedBuffers.villageInk.x>0)this.selectedMeshes.add(mesh);
    }
  }
  dispose(){
    this.world.scene.onBeforeRenderObservable.remove(this.observer);
    const stage=this.world.scene._afterRenderingMeshStage,index=stage.findIndex(step=>step.component===this);if(index>=0)stage.splice(index,1);
    for(const {original,observer}of this.baseObservers)original.onBeforeDrawObservable.remove(observer);
    for(const {mesh}of this.entries)mesh.instancedBuffers.villageInk.set(0,0);
    this.material.dispose();
  }
}
