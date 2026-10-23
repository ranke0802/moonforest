import { MaterialPluginBase, ShadowGenerator, Vector3 } from '@babylonjs/core';

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
  constructor(scene, { ambient, key, rim, shadows, touchDevice }) {
    Object.assign(this, { scene, ambient, key, rim, shadows, touchDevice });
    this.high = true;
    this.baseDirection=key.direction.clone();
    this.highDirection=new Vector3(.65,-1,-.45);
    this.direction = key.direction.negate().normalize();
    this.receivers = new Set();
    this.painted = new WeakSet();
    // A stable arena-sized frustum avoids per-frame bounds fitting and preserves
    // useful shadow texels when tall trees enter the cast list.
    key.position = key.direction.scale(-25);
    key.shadowFrustumSize = 32;
    key.shadowMinZ = 1; key.shadowMaxZ = 65;
    key.autoUpdateExtends = false;
    shadows.filteringQuality = touchDevice ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
    shadows.getShadowMap().refreshRate = touchDevice ? 2 : 1;
  }
  registerMeshes(meshes) {
    for (const mesh of meshes) {
      if (!mesh.getTotalVertices?.()) continue;
      const receiver = mesh.sourceMesh || mesh;
      receiver.receiveShadows = this.high;
      if (!this.receivers.has(receiver)) {
        this.receivers.add(receiver);
        receiver.onDisposeObservable.addOnce(() => this.receivers.delete(receiver));
      }
      const material = receiver.material;
      if (material?.getClassName() !== 'PBRMaterial' || this.painted.has(material)) continue;
      const albedo = material.albedoColor, emission = material.emissiveColor;
      if (!albedo || !emission || albedo.r + albedo.g + albedo.b > .01 || emission.r + emission.g + emission.b <= 0) continue;
      const frozen = material.isFrozen;
      material.unfreeze();
      new PaintedModelShade(material, this);
      this.painted.add(material);
      if (frozen) material.freeze();
    }
    this.refreshReceivers();
  }
  refreshReceivers() {
    // Assets arrive after the first frame. Frozen receivers may have compiled
    // while the cast list was empty, so explicitly rebuild those shader defines.
    const materials=new Set([...this.receivers].map(mesh=>mesh.material).filter(Boolean));
    for(const material of materials)material.markDirty(true);
  }
  setQuality(quality) {
    if(this.quality===quality)return;
    this.quality=quality;
    this.high = quality === 'high';
    this.key.direction.copyFrom(this.high?this.highDirection:this.baseDirection);
    this.key.position.copyFrom(this.key.direction.scale(-25));
    this.direction.copyFrom(this.key.direction).negateInPlace().normalize();
    this.scene.shadowsEnabled = this.high;
    this.ambient.intensity = this.high ? .65 : 1.05;
    this.key.intensity = this.high ? 1.65 : 1.8;
    // One directional source plus sky fill in high quality: no extra light pass.
    this.rim.setEnabled(!this.high);
    for (const mesh of this.receivers) mesh.receiveShadows = this.high;
    this.refreshReceivers();
    if (this.high) this.shadows.getShadowMap().resetRefreshCounter();
  }
}
