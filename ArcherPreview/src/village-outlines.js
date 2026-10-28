import {Color3,Constants,Frustum,Mesh,Quaternion,RenderingGroup,ShaderMaterial,Vector2} from '@babylonjs/core';
import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js';
import {projectedCoverage} from './village-lod.js';

const vertexSource=`precision highp float;
attribute vec3 position;attribute vec3 normal;
uniform mat4 viewProjection;
uniform vec3 inkCamera;uniform vec2 inkFogRange;
#include<instancesDeclaration>
#ifdef INSTANCES
attribute vec2 villageInk;
#endif
varying float inkCoverage;
void main(void){
  #include<instancesVertex>
  vec2 ink=vec2(0.0);
  #ifdef INSTANCES
  ink=villageInk;
  #endif
  vec4 p=finalWorld*vec4(position,1.0);
  p.xyz+=normalize(mat3(finalWorld)*normal)*ink.y;
  inkCoverage=ink.x*(1.0-smoothstep(inkFogRange.x,inkFogRange.y,distance(p.xyz,inkCamera)));gl_Position=viewProjection*p;
}`;
const fragmentSource=`precision highp float;
uniform vec3 inkColor;uniform float inkBaseReady;varying float inkCoverage;
float inkBayer2(vec2 p){return 2.0*mod(p.x+p.y,2.0)+mod(p.y,2.0);}
void main(void){
  if(inkBaseReady<0.5)discard;
  vec2 p=mod(floor(gl_FragCoord.xy),4.0);
  float threshold=(4.0*inkBayer2(mod(p,2.0))+inkBayer2(floor(p/2.0))+0.5)/16.0;
  if(inkCoverage<threshold)discard;
  gl_FragColor=vec4(inkColor,1.0);
}`;

export function villageOutlineSort(a,b){
  const inkA=!!a.getMaterial()?.metadata?.villageOutline,inkB=!!b.getMaterial()?.metadata?.villageOutline;
  return Number(inkA)-Number(inkB)||RenderingGroup.PainterSortCompare(a,b);
}

export const outlineBaseReady=(baseRenderId,renderId)=>baseRenderId===renderId;

// A bounded, instanced back-face pass sharing existing geometry. No extra
// texture, full-screen target, shadow pass, or geometry buffer is allocated.
export class VillageOutlines {
  constructor(world,records,stats){
    this.world=world;this.stats=stats;this.sources=new Map();this.baseObservers=[];this.entries=[];this.selected=new Set();this.next=0;
    this.material=new ShaderMaterial('village-ink',world.scene,{vertexSource,fragmentSource},{attributes:['position','normal','villageInk'],uniforms:['world','viewProjection','inkColor','inkCamera','inkFogRange','inkBaseReady']});
    this.material.setFloat('inkBaseReady',0);
    this.material.backFaceCulling=true;this.material.cullBackFaces=false;this.material.disableDepthWrite=true;
    this.material.metadata={villageOutline:true};
    Object.assign(this.material.stencil,{enabled:true,func:Constants.NOTEQUAL,funcRef:4,funcMask:4,mask:0,opStencilDepthPass:Constants.KEEP});
    world.scene.setRenderingOrder(0,villageOutlineSort);
    this.material.setColor3('inkColor',new Color3(.065,.052,.044));
    this.material.setVector2('inkFogRange',new Vector2(world.scene.fogStart,world.scene.fogEnd));
    const sourceFor=original=>{
      if(this.sources.has(original))return this.sources.get(original);
      const shell=new Mesh(original.name+'-village-ink',world.scene);original.geometry.applyToMesh(shell);
      this.sources.set(original,shell);shell.material=this.material;shell.isVisible=false;shell.isPickable=false;
      shell.overrideMaterialSideOrientation=original.overrideMaterialSideOrientation;
      shell.registerInstancedBuffer('villageInk',2);shell.instancedBuffers.villageInk=new Vector2(0,0);
      // A new LOD/texture shader can miss a draw while its hull is already
      // ready. Require an actual base draw in this same main-camera render.
      // A shadow-map draw or yesterday's ready state must not authorize ink.
      let baseRenderId=-1;
      const observer=original.onBeforeDrawObservable.add(()=>{if(!world.scene._isInIntermediateRendering())baseRenderId=world.scene.getRenderId();});
      this.baseObservers.push({original,observer});
      shell.onBeforeDrawObservable.add(()=>{
        const ready=outlineBaseReady(baseRenderId,world.scene.getRenderId());
        this.material.getEffect()?.setFloat('inkBaseReady',ready?1:0);
        if(!ready)this.stats.outlineSuppressedDraws=(this.stats.outlineSuppressedDraws??0)+1;
      });
      shell.useLODScreenCoverage=original.useLODScreenCoverage;
      for(const lod of original.getLODLevels())shell.addLODLevel(lod.distanceOrScreenCoverage,lod.mesh?sourceFor(lod.mesh):null);
      return shell;
    };
    for(const record of records)for(const mesh of record.meshes){
      if(['ground-detail','shrub','garden'].includes(record.placement.kind))continue;
      const shell=sourceFor(mesh.sourceMesh??mesh).createInstance(mesh.name+'-ink');
      shell.parent=mesh;shell.position.setAll(0);shell.rotationQuaternion=Quaternion.Identity();shell.scaling.setAll(1);
      shell.isPickable=false;shell.isVisible=false;shell.instancedBuffers.villageInk=new Vector2(0,.018);
      // Use the base instance's exact LOD decision, never a second sphere test.
      shell.getLOD=camera=>{
        const base=mesh.getLOD(camera),selected=base?this.sources.get(base):null;
        shell._currentLOD=selected??null;return selected??null;
      };
      this.entries.push({record,mesh,shell,coverage:0});
    }
    this.observer=world.scene.onBeforeRenderObservable.add(()=>this.update(performance.now()));
  }
  async prepare(){
    for(const source of this.sources.values()){
      await this.material.forceCompilationAsync(source,{useInstances:true});
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
      for(const entry of this.selected)if(!selected.has(entry))entry.shell.isVisible=false;
      this.selected=selected;this.stats.outlineInstances=selected.size;
    }
    for(const entry of this.selected){
      const {record,mesh,shell}=entry;
      const coverage=mesh.instancedBuffers?.treeCoverage??1;
      shell.isVisible=record.root.isEnabled()&&coverage>0;
      shell.instancedBuffers.villageInk.set(coverage*Math.min(1,(entry.coverage-.02)/.025),record.placement.kind==='tree'?.007:.012);
    }
  }
  dispose(){
    this.world.scene.onBeforeRenderObservable.remove(this.observer);
    this.world.scene.setRenderingOrder(0);
    for(const {original,observer}of this.baseObservers)original.onBeforeDrawObservable.remove(observer);
    for(const {shell}of this.entries)shell.dispose();
    for(const shell of this.sources.values())shell.dispose();this.material.dispose();
  }
}
