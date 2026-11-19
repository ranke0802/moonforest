import { MaterialPluginBase, ShadowGenerator, Vector3 } from '@babylonjs/core';
import {installVillageShadowFade,prepareShadowFade,shadowFadeAttribute} from './village-shadow-fade.js';
import {installStaticShadowCache,staticShadowCasters} from './static-shadow-cache.js';

// Painted character maps are emissive to retain their authored colors. Reuse the
// existing PBR normals and shadow result instead of adding another render pass.
class PaintedModelShade extends MaterialPluginBase {
  constructor(material, lighting) {
    super(material, 'MoonforestPaintedShade', 300, {MOONFOREST_PAINTED_SHADE:true}, true, true);
    this.doNotSerialize=true;
    this.lighting = lighting;
  }
  getClassName(){return 'MoonforestPaintedModelShade';}
  getUniforms() {
    return { ubo: [{ name: 'moonforestShade', size: 4, type: 'vec4' }], fragment: 'uniform vec4 moonforestShade;' };
  }
  bindForSubMesh(buffer) {
    const { direction, high } = this.lighting;
    buffer.updateFloat4('moonforestShade', direction.x, direction.y, direction.z, high ? 1 : 0);
  }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return { CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
      #ifndef UNLIT
      if (moonforestShade.w > 0.5) {
        float facingLight = dot(normalW, moonforestShade.xyz);
        float paintedLight = mix(0.53, 1.03, smoothstep(-0.12, 0.9, facingLight));
        // Only the key light casts shadows. aggShadow averages all enabled lights.
        float keyVisibility = numLights > 0.0 ? clamp(1.0 - numLights * (1.0 - aggShadow), 0.0, 1.0) : 1.0;
        finalEmissive *= paintedLight * mix(0.64, 1.0, keyVisibility);
      }
      #endif` };
  }
}

// Plains/village shadow passes drew every registered caster (~450K triangles a
// frame on the plains). The map covers a fixed box around the focus, so:
//  - casters wholly outside that box in the light's plane cannot touch it;
//  - outline shells only duplicate their body's silhouette;
//  - animated actors beyond ACTOR_SHADOW_RANGE cast a few texels at most.
export const ACTOR_SHADOW_RANGE=32;
// The frame guard may pull this in on a struggling phone (lighting.actorShadowRange).
const isOutlineCaster=mesh=>mesh.metadata?.moonforestOutline===true||/_Outline$/.test(mesh.name);
export function installShadowCasterCulling(shadows,lighting){
  const map=shadows.getShadowMap(),casters=[],statics=[],dynamics=[],lists={all:casters,statics,dynamics},forward=new Vector3(),right=new Vector3(),up=new Vector3(),offset=new Vector3();let frame=-1;
  const collect=()=>{
    const id=lighting.scene.getFrameId();if(id===frame)return lists;frame=id;casters.length=0;statics.length=0;dynamics.length=0;
    const list=map.renderList??[],length=list.length;
    const key=lighting.key;key.direction.normalizeToRef(forward);Vector3.CrossToRef(Vector3.UpReadOnly,forward,right);
    if(right.lengthSquared()<1e-8)right.set(1,0,0);right.normalize();Vector3.CrossToRef(forward,right,up);
    const half=key.shadowFrustumSize/2,focus=lighting.focus;
    for(let i=0;i<length;i++){
      const mesh=list[i];if(!mesh||isOutlineCaster(mesh))continue;
      const sphere=mesh.getBoundingInfo?.()?.boundingSphere;
      if(sphere){
        sphere.centerWorld.subtractToRef(focus,offset);const radius=sphere.radiusWorld;
        if(Math.abs(Vector3.Dot(offset,right))>half+radius||Math.abs(Vector3.Dot(offset,up))>half+radius)continue;
        if(mesh.skeleton&&offset.length()-radius>(lighting.actorShadowRange??ACTOR_SHADOW_RANGE))continue;
      }
      casters.push(mesh);
      // Static casters only count while drawable and fully faded in, so a
      // fading shadow is drawn live and only the settled set refreshes the cache.
      if(staticShadowCasters.has(mesh)&&(mesh.instancedBuffers?.[shadowFadeAttribute]??1)>=.999){if(mesh.isEnabled()&&mesh.isVisible)statics.push(mesh);}
      else dynamics.push(mesh);
    }
    return lists;
  };
  lighting.shadowCasterLists=collect;
  map.getCustomRenderList=()=>{collect();return lighting.staticShadows?.active?dynamics:casters;};
}

export class SceneLighting {
  constructor(scene, { ambient, key, rim, shadows, touchDevice, village=false }) {
    Object.assign(this, { scene, ambient, key, rim, shadows, touchDevice, village });
    this.high = true;
    this.shadowsActive=true;this.lightDistance=village?45:25;
    this.baseDirection=key.direction.clone();
    this.highDirection=new Vector3(.65,-1,-.45);
    this.canonicalDirections={base:this.baseDirection.clone(),high:this.highDirection.clone(),ambient:ambient.direction.clone(),rim:rim.direction.clone()};
    this.worldYaw=0;
    this.direction = key.direction.negate().normalize();
    this.focus = Vector3.Zero();
    this.requestedFocus=Vector3.Zero();this.shadowForward=Vector3.Zero();this.shadowRight=Vector3.Zero();this.shadowUp=Vector3.Zero();this.worldUp=Vector3.Up();
    this.receivers = new Set();
    this.painted = new WeakSet();
    this.registeredMaterials = new WeakSet();
    // A stable arena-sized frustum avoids per-frame bounds fitting and preserves
    // useful shadow texels when tall trees enter the cast list.
    key.position = key.direction.scale(-this.lightDistance);
    // Phones: a 64 m box again (user choice 2026-11-19: wider reach over the
    // sharper 40 m box; the static shadow cache keeps the extra casters cheap).
    key.shadowFrustumSize = village?(touchDevice?64:80):32;
    key.shadowMinZ = 1; key.shadowMaxZ = village?120:65;
    key.autoUpdateExtends = false;
    shadows.filteringQuality = touchDevice ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
    // Skipping alternate shadow passes halves animated shadow updates; worse,
    // a moving light
    // samples the previous map with the new projection on the skipped frame.
    // Keep one bounded map synchronized with the pose and light every frame.
    shadows.getShadowMap().refreshRate = 1;
    installShadowCasterCulling(shadows,this);
    if(village)installVillageShadowFade(shadows);
    this.staticShadows=installStaticShadowCache(this,{decorate:village?installVillageShadowFade:null});
    if(this.staticShadows)this.scene.metadata={...this.scene.metadata,staticShadows:this.staticShadows};
  }
  setWorldYaw(yaw){
    if(this.worldYaw===yaw)return;this.worldYaw=yaw;
    const c=Math.cos(yaw),s=Math.sin(yaw),rotate=(source,target)=>target.set(c*source.x+s*source.z,source.y,-s*source.x+c*source.z);
    rotate(this.canonicalDirections.base,this.baseDirection);rotate(this.canonicalDirections.high,this.highDirection);
    rotate(this.canonicalDirections.ambient,this.ambient.direction);rotate(this.canonicalDirections.rim,this.rim.direction);
    this.key.direction.copyFrom(this.quality==='high'?this.highDirection:this.baseDirection);
    this.direction.copyFrom(this.key.direction).negateInPlace().normalize();this.follow(this.requestedFocus,true);
  }
  registerMeshes(meshes) {
    const dirty=new Set();
    for (const mesh of meshes) {
      if (!mesh.getTotalVertices?.()) continue;
      const receiver = mesh.sourceMesh || mesh;
      if(this.village)prepareShadowFade(receiver);
      receiver.receiveShadows = this.shadowsActive;
      if (!this.receivers.has(receiver)) {
        this.receivers.add(receiver);
        receiver.onDisposeObservable.addOnce(() => this.receivers.delete(receiver));
      }
      const material = receiver.material;
      if(material&&!this.registeredMaterials.has(material)){
        this.registeredMaterials.add(material);dirty.add(material);
      }
      if (material?.getClassName() !== 'PBRMaterial' || this.painted.has(material)) continue;
      const albedo = material.albedoColor, emission = material.emissiveColor;
      if (!albedo || !emission || albedo.r + albedo.g + albedo.b > .01 || emission.r + emission.g + emission.b <= 0) continue;
      const frozen = material.isFrozen;
      material.unfreeze();
      new PaintedModelShade(material, this);
      this.painted.add(material);
      if (frozen) material.freeze();
    }
    // Streaming another LOD must not invalidate every already-warm scene
    // shader, nor invalidate the incoming shader again after it was compiled.
    for(const material of dirty)material.markDirty(true);
  }
  invalidateStaticShadows(){this.staticShadows?.invalidate();}
  refreshReceivers() {
    // Assets arrive after the first frame. Frozen receivers may have compiled
    // while the cast list was empty, so explicitly rebuild those shader defines.
    const materials=new Set([...this.receivers].map(mesh=>mesh.material).filter(Boolean));
    for(const material of materials)material.markDirty(true);
  }
  follow(position,force=false){
    this.requestedFocus.set(position.x,this.followHeight?position.y:0,position.z);
    let x=Math.round(position.x/2)*2,y=0,z=Math.round(position.z/2)*2;
    if(this.village){
      // Quantize in the LIGHT'S plane, in whole shadow-map texels. World-space
      // 2m jumps change the sampling phase and make stationary edges shimmer.
      const forward=this.shadowForward,right=this.shadowRight,up=this.shadowUp;
      this.key.direction.normalizeToRef(forward);Vector3.CrossToRef(this.worldUp,forward,right);right.normalize();Vector3.CrossToRef(forward,right,up);
      // A whole number of texels per step keeps edges still; with the static
      // shadow cache the step is ~2 m so the cached depth is not redrawn every
      // frame while walking (the box keeps a wide margin around the player).
      const texel=this.key.shadowFrustumSize/this.shadows.getShadowMap().getSize().width,step=this.staticShadows?Math.max(1,Math.round(2/texel))*texel:texel;
      const u=Math.round(Vector3.Dot(this.requestedFocus,right)/step)*step,v=Math.round(Vector3.Dot(this.requestedFocus,up)/step)*step,d=this.staticShadows?Math.round(Vector3.Dot(this.requestedFocus,forward)/step)*step:Vector3.Dot(this.requestedFocus,forward);
      x=right.x*u+up.x*v+forward.x*d;y=right.y*u+up.y*v+forward.y*d;z=right.z*u+up.z*v+forward.z*d;
    }
    if(!force&&this.focus.x===x&&this.focus.y===y&&this.focus.z===z)return;
    this.focus.set(x,y,z);
    this.key.position.set(x-this.key.direction.x*this.lightDistance,y-this.key.direction.y*this.lightDistance,z-this.key.direction.z*this.lightDistance);
    // Also invalidate explicitly after a projection move (e.g. resume/quality
    // change) so a previously cached map can never use the new light matrix.
    this.shadows.getShadowMap().resetRefreshCounter();
  }
  setQuality(quality) {
    if(this.quality===quality)return;
    this.quality=quality;
    this.high = quality === 'high';
    this.shadowsActive=this.village?quality!=='battery':this.high;
    this.key.direction.copyFrom(this.high?this.highDirection:this.baseDirection);
    this.follow(this.requestedFocus,true);
    this.direction.copyFrom(this.key.direction).negateInPlace().normalize();
    this.scene.shadowsEnabled = this.shadowsActive;
    this.ambient.intensity = this.high ? .65 : 1.05;
    this.key.intensity = this.high ? 1.65 : 1.8;
    // One directional source plus sky fill in high quality: no extra light pass.
    this.rim.setEnabled(!this.high);
    for (const mesh of this.receivers) mesh.receiveShadows = this.shadowsActive;
    this.refreshReceivers();
    if (this.shadowsActive) this.shadows.getShadowMap().resetRefreshCounter();
  }
}
