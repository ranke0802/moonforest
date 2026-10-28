import { MaterialPluginBase, ShadowGenerator, Vector3 } from '@babylonjs/core';
import {installVillageShadowFade,prepareShadowFade} from './village-shadow-fade.js';

// Painted character maps are emissive to retain their authored colors. Reuse the
// existing PBR normals and shadow result instead of adding another render pass.
class PaintedModelShade extends MaterialPluginBase {
  constructor(material, lighting) {
    super(material, 'MoonforestPaintedShade', 300, {}, true, true);
    this.lighting = lighting;
  }
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

export class SceneLighting {
  constructor(scene, { ambient, key, rim, shadows, touchDevice, village=false }) {
    Object.assign(this, { scene, ambient, key, rim, shadows, touchDevice, village });
    this.high = true;
    this.shadowsActive=true;this.lightDistance=village?45:25;
    this.baseDirection=key.direction.clone();
    this.highDirection=new Vector3(.65,-1,-.45);
    this.direction = key.direction.negate().normalize();
    this.focus = Vector3.Zero();
    this.requestedFocus=Vector3.Zero();this.shadowForward=Vector3.Zero();this.shadowRight=Vector3.Zero();this.shadowUp=Vector3.Zero();this.worldUp=Vector3.Up();
    this.receivers = new Set();
    this.painted = new WeakSet();
    this.registeredMaterials = new WeakSet();
    // A stable arena-sized frustum avoids per-frame bounds fitting and preserves
    // useful shadow texels when tall trees enter the cast list.
    key.position = key.direction.scale(-this.lightDistance);
    key.shadowFrustumSize = village?(touchDevice?64:80):32;
    key.shadowMinZ = 1; key.shadowMaxZ = village?120:65;
    key.autoUpdateExtends = false;
    shadows.filteringQuality = touchDevice ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
    // The scene is already capped at 30 FPS on phones. Skipping alternate
    // shadow passes reduces animated shadows to 15 Hz; worse, a moving light
    // samples the previous map with the new projection on the skipped frame.
    // Keep one bounded map synchronized with the pose and light every frame.
    shadows.getShadowMap().refreshRate = 1;
    if(village)installVillageShadowFade(shadows);
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
  refreshReceivers() {
    // Assets arrive after the first frame. Frozen receivers may have compiled
    // while the cast list was empty, so explicitly rebuild those shader defines.
    const materials=new Set([...this.receivers].map(mesh=>mesh.material).filter(Boolean));
    for(const material of materials)material.markDirty(true);
  }
  follow(position,force=false){
    this.requestedFocus.set(position.x,0,position.z);
    let x=Math.round(position.x/2)*2,y=0,z=Math.round(position.z/2)*2;
    if(this.village){
      // Quantize in the LIGHT'S plane, in whole shadow-map texels. World-space
      // 2m jumps change the sampling phase and make stationary edges shimmer.
      const forward=this.shadowForward,right=this.shadowRight,up=this.shadowUp;
      this.key.direction.normalizeToRef(forward);Vector3.CrossToRef(this.worldUp,forward,right);right.normalize();Vector3.CrossToRef(forward,right,up);
      const texel=this.key.shadowFrustumSize/this.shadows.getShadowMap().getSize().width;
      const u=Math.round(Vector3.Dot(this.requestedFocus,right)/texel)*texel,v=Math.round(Vector3.Dot(this.requestedFocus,up)/texel)*texel,d=Vector3.Dot(this.requestedFocus,forward);
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
