import { Color3, MaterialPluginBase, StandardMaterial, Vector3 } from '@babylonjs/core';

// StandardMaterial retains skinning, shadow maps, hit overlays and death fading,
// without the PBR reflection, metallic/roughness and normal-map shader paths.
class MonsterToonBands extends MaterialPluginBase {
  constructor(material, lighting) {
    super(material, 'MoonforestMonsterToon', 300, {}, true, true);
    this.lighting = lighting;
    this.fallbackDirection = new Vector3(-.65, 1, .45).normalize();
  }
  getUniforms() {
    return { ubo: [{ name: 'monsterLightDirection', size: 3, type: 'vec3' }], fragment: 'uniform vec3 monsterLightDirection;' };
  }
  bindForSubMesh(buffer) {
    const d = this.lighting?.direction || this.fallbackDirection;
    buffer.updateFloat3('monsterLightDirection', d.x, d.y, d.z);
  }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return { CUSTOM_FRAGMENT_BEFORE_FOG: `
      float toonFacing = dot(normalW, monsterLightDirection);
      // Narrow soft transitions prevent hard band edges shimmering on mobile.
      float toonLight = 0.66 + 0.18 * smoothstep(-0.14, -0.08, toonFacing)
        + 0.16 * smoothstep(0.48, 0.54, toonFacing);
      float toonShadow = numLights > 0.0 ? clamp(1.0 - numLights * (1.0 - aggShadow), 0.0, 1.0) : 1.0;
      color.rgb = baseColor.rgb * diffuseColor * toonLight * mix(0.68, 1.0, toonShadow);
    ` };
  }
}

const materials = new WeakMap();
export function applyMonsterToon(asset, lighting) {
  for (const mesh of asset.meshes) {
    const source = mesh.material;
    if (!mesh.getTotalVertices() || !source || mesh.metadata?.moonforestOutline || source.metadata?.moonforestMonsterToon) continue;
    let toon = materials.get(source);
    if (!toon) {
      toon = new StandardMaterial(`${source.name}-toon`, mesh.getScene());
      toon.diffuseTexture = source.albedoTexture || source.diffuseTexture || null;
      toon.diffuseColor = (source.albedoColor || source.diffuseColor || Color3.White()).clone();
      toon.specularColor = Color3.Black();
      toon.specularPower = 1;
      toon.maxSimultaneousLights = 2;
      toon.backFaceCulling = source.backFaceCulling;
      toon.sideOrientation = source.sideOrientation;
      toon.twoSidedLighting = !source.backFaceCulling;
      toon.alpha = source.alpha;
      toon.useAlphaFromDiffuseTexture = Boolean(source.useAlphaFromAlbedoTexture);
      toon.metadata = { moonforestMonsterToon: true };
      new MonsterToonBands(toon, lighting);
      materials.set(source, toon);
    }
    mesh.material = toon;
  }
}
