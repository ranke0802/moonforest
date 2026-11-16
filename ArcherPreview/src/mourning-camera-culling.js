import {Frustum,Matrix,VertexBuffer} from '@babylonjs/core';
import {characterStyleFor} from './character-style.js';
import {runPreparationSync} from './boss-preparation.js';

const installed=new WeakMap(),meshGroups=new WeakMap(),empty=()=>[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
const extend=(box,lo,hi)=>{for(let a=0;a<3;a++){box[a]=Math.min(box[a],lo[a]);box[a+3]=Math.max(box[a+3],hi[a]);}};

// Skin matrices are the exact bind-aware matrices supplied to Babylon's vertex
// shader. A positive, normalized blend is inside the union's AABB. Each bone's
// source-space box includes every vertex it influences, with all independently
// varying 0..1 morph deltas added to that vertex's interval. No pose sampling.
export function* mourningMeshBoundsProof(mesh){
  // Native instancing/LOD and mutable vertex buffers need their own envelopes.
  // Leave those paths with their previous selection instead of guessing bounds.
  if(mesh.isAnInstance||mesh.hasThinInstances||mesh.getLODLevels?.().length||mesh.bakedVertexAnimationManager?.isEnabled||
     [VertexBuffer.PositionKind,VertexBuffer.MatricesWeightsKind,VertexBuffer.MatricesIndicesKind,VertexBuffer.MatricesWeightsExtraKind,VertexBuffer.MatricesIndicesExtraKind].some(kind=>mesh.getVertexBuffer(kind)?.isUpdatable()))return null;
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),count=mesh.getTotalVertices(),manager=mesh.morphTargetManager;
  if(!positions||positions.length!==count*3||!count)return null;
  const targets=Array.from({length:manager?.numTargets??0},(_,i)=>manager.getTarget(i)),morphs=targets.map(t=>t.getPositions());
  if(morphs.some(p=>p&&p.length!==positions.length))return null;
  const skeleton=mesh.skeleton,slots=mesh.numBoneInfluencers,weights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind),joints=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const extraWeights=slots>4?mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind):null,extraJoints=slots>4?mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind):null;
  if(skeleton&&(!mesh.computeBonesUsingShaders||!Number.isInteger(slots)||slots<1||slots>8||!weights||!joints||weights.length!==count*4||joints.length!==count*4||(slots>4&&(!extraWeights||!extraJoints||extraWeights.length!==count*4||extraJoints.length!==count*4))))return null;
  const boxes=new Map(),lo=[0,0,0],hi=[0,0,0];let maxWeightSumError=0;
  for(let vertex=0;vertex<count;vertex++){
    for(let axis=0;axis<3;axis++){
      const at=vertex*3+axis,base=positions[at];if(!Number.isFinite(base))return null;lo[axis]=hi[axis]=base;
      for(const morph of morphs)if(morph){const delta=morph[at]-base;if(!Number.isFinite(delta))return null;lo[axis]+=Math.min(0,delta);hi[axis]+=Math.max(0,delta);}
    }
    if(!skeleton){let box=boxes.get(-1);if(!box)boxes.set(-1,box=empty());extend(box,lo,hi);if((vertex+1)%512===0)yield;continue;}
    let sum=0;
    for(let slot=0;slot<slots;slot++){
      const at=vertex*4+slot%4,weight=(slot<4?weights:extraWeights)[at],joint=(slot<4?joints:extraJoints)[at];
      if(!Number.isFinite(weight)||weight<0||!Number.isInteger(joint)||joint<0||joint>skeleton.bones.length)return null;
      sum+=weight;if(weight===0)continue;let box=boxes.get(joint);if(!box)boxes.set(joint,box=empty());extend(box,lo,hi);
    }
    maxWeightSumError=Math.max(maxWeightSumError,Math.abs(sum-1));if(Math.abs(sum-1)>1e-5)return null;
    if((vertex+1)%512===0)yield;
  }
  return {mesh,geometry:mesh.geometry,skeleton,slots,manager,targets,morphs,boxes:[...boxes].map(([joint,box])=>({joint,box})),maxWeightSumError};
}
export function buildMourningMeshBounds(mesh){return runPreparationSync(mourningMeshBoundsProof(mesh));}
export function buildMourningMeshBoundsAsync(mesh,preparation){return preparation.run(mourningMeshBoundsProof(mesh));}

function supportsCurrentPose(part){
  const {mesh,manager}=part;
  if(mesh.isDisposed()||mesh.geometry!==part.geometry||mesh.skeleton!==part.skeleton||mesh.morphTargetManager!==manager||mesh.bakedVertexAnimationManager?.isEnabled||mesh.hasThinInstances||mesh.getLODLevels?.().length)return false;
  if(part.skeleton&&(!mesh.computeBonesUsingShaders||mesh.numBoneInfluencers!==part.slots))return false;
  if((manager?.numTargets??0)!==part.targets.length)return false;
  for(let i=0;i<part.targets.length;i++){
    const target=manager.getTarget(i),w=target.influence;
    if(target!==part.targets[i]||target.getPositions()!==part.morphs[i]||!Number.isFinite(w)||w<0||w>1)return false;
  }
  return true;
}
function affine(m){return m.every(Number.isFinite)&&Math.abs(m[3])<1e-7&&Math.abs(m[7])<1e-7&&Math.abs(m[11])<1e-7&&Math.abs(m[15]-1)<1e-5;}
function transformedUnion(out,box,m){
  const cx=(box[0]+box[3])*.5,cy=(box[1]+box[4])*.5,cz=(box[2]+box[5])*.5,ex=(box[3]-box[0])*.5,ey=(box[4]-box[1])*.5,ez=(box[5]-box[2])*.5;
  for(let a=0;a<3;a++){const center=cx*m[a]+cy*m[a+4]+cz*m[a+8]+m[a+12],extent=ex*Math.abs(m[a])+ey*Math.abs(m[a+4])+ez*Math.abs(m[a+8]),padding=1e-5*(1+Math.abs(center)+extent);out[a]=Math.min(out[a],center-extent-padding);out[a+3]=Math.max(out[a+3],center+extent+padding);}
}
function outside(box,x,y,z,w,padding=0){return x*(x<0?box[0]:box[3])+y*(y<0?box[1]:box[4])+z*(z<0?box[2]:box[5])+w < -padding*Math.hypot(x,y,z);}

export class MourningCameraBounds{
  constructor(parts,scene){this.parts=parts;this.scene=scene;this.bounds=empty();this.skin=Matrix.Identity();this.combined=Matrix.Identity();this.frame=-1;this.valid=false;this.updates=0;this.queries=0;this.hooks=[];this.disposed=false;this.padding={pixels:0,world:0};this.cameraPlanes=Frustum.GetPlanes(Matrix.Identity());this.cameraMatrix=new Float64Array(16);this.cameraMatrix.fill(NaN);this.query=null;}
  update(force=false){
    if(this.disposed)return false;
    const frame=this.scene.getRenderId(),sceneFrame=this.scene.getFrameId();let changed=force||this.frame!==frame||this.sceneFrame!==sceneFrame;
    for(const part of this.parts){
      if(!supportsCurrentPose(part)){this.valid=false;this.query=null;return false;}
      // Babylon otherwise reuses a matrix within the same render ID before
      // checking dirty local/ancestor transforms (secondary passes can revisit).
      const world=part.mesh.computeWorldMatrix(!part.mesh.isWorldMatrixFrozen&&!part.mesh.isSynchronized());
      if(part.worldRevision!==world.updateFlag||part.skeleton?._isDirty||part.skinRevision!==part.skeleton?.bones[0]?._childUpdateId)changed=true;
    }
    if(!changed)return this.valid;
    this.frame=frame;this.sceneFrame=sceneFrame;this.valid=false;this.updates++;this.bounds[0]=this.bounds[1]=this.bounds[2]=Infinity;this.bounds[3]=this.bounds[4]=this.bounds[5]=-Infinity;
    for(const part of this.parts){
      if(!supportsCurrentPose(part))return false;
      const world=part.mesh.computeWorldMatrix();if(!affine(world.m))return false;part.worldRevision=world.updateFlag;
      if(part.skeleton)part.skeleton.prepare(part.skeleton._isDirty);const matrices=part.skeleton?.getTransformMatrices(part.mesh);
      part.skinRevision=part.skeleton?.bones[0]?._childUpdateId;
      for(const {joint,box}of part.boxes){
        let matrix=world;
        if(joint>=0){if(!matrices||matrices.length<(joint+1)*16)return false;Matrix.FromArrayToRef(matrices,joint*16,this.skin);if(!affine(this.skin.m))return false;this.skin.multiplyToRef(world,this.combined);matrix=this.combined;}
        transformedUnion(this.bounds,box,matrix.m);
      }
    }
    this.valid=this.bounds.every(Number.isFinite);return this.valid;
  }
  outlinePadding(){
    let pixels=0,world=0;
    for(const {mesh}of this.hooks)if(mesh.metadata?.moonforestOutline||mesh.metadata?.characterInkRegistered){
      const metadata=mesh.metadata,style=characterStyleFor(mesh),width=style.outlineWidth;
      if(!Number.isFinite(width))return null;
      // Retaining a pixel margin for every ink mesh is conservative. Native
      // bear/goblin hulls also move in world space before projection.
      pixels=Math.max(pixels,Math.abs(width),Math.abs(metadata.outlinePixels??0));
      if(metadata.moonforestOutline&&metadata.outlinePixels===undefined){
        const boss=['boss','mourning'].includes(metadata.characterStyleGroup),radius=Math.abs((metadata.outlineWidth??0)*(boss?width/.5:1));
        if(!Number.isFinite(radius))return null;world=Math.max(world,radius);
      }
    }
    this.padding.pixels=pixels;this.padding.world=world;return Number.isFinite(pixels)?this.padding:null;
  }
  intersects(planes,transform=this.scene.getTransformMatrix(),padding=this.outlinePadding()){
    if(!this.update())return true;
    return this.intersectsBounds(planes,transform,padding);
  }
  intersectsBounds(planes,transform,padding){
    if(!padding||!planes?.length)return true;
    const box=this.bounds;
    // Near/far stay unchanged. Side planes expand by the exact maximum clip XY
    // displacement of the existing pixel-width ink shader, at any camera zoom.
    for(let i=0;i<2;i++){const p=planes[i];if(outside(box,p.normal.x,p.normal.y,p.normal.z,p.d,padding.world))return false;}
    const engine=this.scene.getEngine(),canvas=engine.getRenderingCanvas(),width=canvas?.clientWidth||engine.getRenderWidth(),height=canvas?.clientHeight||engine.getRenderHeight();
    if(!(width>0&&height>0))return true;
    const m=transform.m,px=1+2*padding.pixels/width,py=1+2*padding.pixels/height;
    for(const sign of [-1,1]){
      if(outside(box,sign*m[0]+px*m[3],sign*m[4]+px*m[7],sign*m[8]+px*m[11],sign*m[12]+px*m[15],padding.world))return false;
      if(outside(box,sign*m[1]+py*m[3],sign*m[5]+py*m[7],sign*m[9]+py*m[11],sign*m[13]+py*m[15],padding.world))return false;
    }
    return true;
  }
  intersectsCamera(camera=this.scene.activeCamera){
    if(!camera||camera.getScene()!==this.scene||!this.update())return true;
    camera.getViewMatrix();camera.getProjectionMatrix();const transform=camera.getTransformationMatrix(),m=transform.m,padding=this.outlinePadding();
    if(!padding||!affine(camera.getWorldMatrix().m)||!m.every(Number.isFinite))return true;
    const engine=this.scene.getEngine(),canvas=engine.getRenderingCanvas(),width=canvas?.clientWidth||engine.getRenderWidth(),height=canvas?.clientHeight||engine.getRenderHeight(),pass=engine.currentRenderPassId;
    const matrixChanged=m.some((value,i)=>this.cameraMatrix[i]!==value),q=this.query;
    if(q&&q.camera===camera&&q.frame===this.frame&&q.updates===this.updates&&q.pass===pass&&q.width===width&&q.height===height&&q.pixels===padding.pixels&&q.world===padding.world&&!matrixChanged)return q.visible;
    if(matrixChanged){this.cameraMatrix.set(m);Frustum.GetPlanesToRef(transform,this.cameraPlanes);}
    const visible=this.intersectsBounds(this.cameraPlanes,transform,padding);this.queries++;
    this.query??={};Object.assign(this.query,{camera,frame:this.frame,updates:this.updates,pass,width,height,pixels:padding.pixels,world:padding.world,visible});return visible;
  }
  attach(mesh){
    const original=mesh.isInFrustum,always=mesh.alwaysSelectAsActiveMesh,group=this;
    const hook=function(planes){return planes===group.scene._frustumPlanes?group.intersectsCamera():original.call(this,planes);};
    this.hooks.push({mesh,original,always,hook});mesh.alwaysSelectAsActiveMesh=false;mesh.isInFrustum=hook;
    meshGroups.set(mesh,this);
  }
  dispose(){if(this.disposed)return;for(const {mesh,original,always,hook,disposeObserver}of this.hooks){if(meshGroups.get(mesh)===this)meshGroups.delete(mesh);if(mesh.isInFrustum===hook){mesh.isInFrustum=original;mesh.alwaysSelectAsActiveMesh=always;}if(disposeObserver)mesh.onDisposeObservable.remove(disposeObserver);}this.hooks.length=0;this.parts.length=0;this.query=null;this.disposed=true;}
}

// Explicit secondary render lists (including interior ink) do not use the main
// scene's frustum hook. Share its conservative actor decision without changing
// enabled/isVisible state or the light's independent caster selection.
export function actorIntersectsCamera(mesh,scene=mesh?.getScene()){
  const group=meshGroups.get(mesh);return !group||group.disposed||group.scene!==scene?true:group.intersectsCamera();
}

export function prepareActorCameraCulling(asset){
  const old=installed.get(asset);if(old&&!old.disposed)return old;
  const sources=asset.meshes.filter(m=>m.getTotalVertices?.()&&!m.metadata?.moonforestOutline);
  if(!sources.length)return null;const parts=sources.map(buildMourningMeshBounds);
  if(parts.some(p=>!p))return null;return installMourningCameraCulling(asset,sources,parts);
}
export async function prepareActorCameraCullingAsync(asset,preparation){
  const old=installed.get(asset);if(old&&!old.disposed)return old;
  const sources=asset.meshes.filter(m=>m.getTotalVertices?.()&&!m.metadata?.moonforestOutline),parts=[];
  if(!sources.length)return null;
  for(const mesh of sources){const part=await buildMourningMeshBoundsAsync(mesh,preparation);if(!part)return null;parts.push(part);}
  preparation.check();return installMourningCameraCulling(asset,sources,parts);
}

export function prepareMourningCameraCulling(asset){
  const old=installed.get(asset);if(old&&!old.disposed)return old;
  if(!asset.meshes.some(m=>m.name==='Elina_Chimera_Skin'&&!m.metadata?.moonforestOutline))return null;
  return prepareActorCameraCulling(asset);
}
function installMourningCameraCulling(asset,sources,parts){
  const group=new MourningCameraBounds(parts,sources[0].getScene());
  for(const mesh of asset.meshes)if(mesh.getTotalVertices()){group.attach(mesh);group.hooks.at(-1).disposeObserver=mesh.onDisposeObservable.addOnce(()=>group.dispose());}
  installed.set(asset,group);return group;
}
export async function prepareMourningCameraCullingAsync(asset,preparation){
  const old=installed.get(asset);if(old&&!old.disposed)return old;
  if(!asset.meshes.some(m=>m.name==='Elina_Chimera_Skin'&&!m.metadata?.moonforestOutline))return null;
  return prepareActorCameraCullingAsync(asset,preparation);
}
