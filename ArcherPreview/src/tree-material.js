import { MaterialPluginBase, PBRMaterial } from '@babylonjs/core';

// Painted color maps already carry small-scale surface detail. Far trees keep
// that image but replace per-pixel PBR/shadow work with interpolated vertex light.
class FarTreeLight extends MaterialPluginBase {
  constructor(material, lighting) {
    super(material, 'MoonforestFarTreeLight', 300, {}, true, true);
    this.lighting = lighting;
  }
  prepareDefines(defines) { defines.NORMAL = true; }
  getUniforms() {
    return {
      ubo: ['farTreeSun', 'farTreeRim', 'farTreeFill'].map(name => ({name, size:4, type:'vec4'})),
      vertex: 'uniform vec4 farTreeSun; uniform vec4 farTreeRim; uniform vec4 farTreeFill;',
    };
  }
  bindForSubMesh(buffer) {
    const {key, rim, ambient} = this.lighting;
    const sun = key.direction, edge = rim.direction;
    buffer.updateFloat4('farTreeSun', -sun.x, -sun.y, -sun.z, key.intensity / Math.PI);
    buffer.updateFloat4('farTreeRim', -edge.x, -edge.y, -edge.z, rim.isEnabled() ? rim.intensity / Math.PI : 0);
    buffer.updateFloat4('farTreeFill', ambient.intensity, 0, 0, 0);
  }
  getCustomCode(type) {
    if (type === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: 'varying vec3 vFarTreeLight;',
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
        vec3 treeNormal = normalize(vNormalW);
        float treeSky = clamp(dot(treeNormal, normalize(vec3(0.0, 1.0, .3))) * .5 + .5, 0.0, 1.0);
        vFarTreeLight = mix(vec3(.29, .30, .39), vec3(.85, .89, 1.0), treeSky) * farTreeFill.x;
        vFarTreeLight += max(dot(treeNormal, normalize(farTreeSun.xyz)), 0.0) * farTreeSun.w * vec3(.95, .93, 1.0);
        vFarTreeLight += max(dot(treeNormal, normalize(farTreeRim.xyz)), 0.0) * farTreeRim.w * vec3(.4, .65, 1.0);`,
    };
    if (type === 'fragment') return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'varying vec3 vFarTreeLight;',
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: 'finalDiffuse *= vFarTreeLight;',
    };
    return null;
  }
}

export function createFarTreeMaterial(source, lighting) {
  const material = new PBRMaterial(`${source.name}-distant`, source.getScene());
  material.unlit = true;
  material.albedoTexture = source.albedoTexture;
  material.albedoColor.copyFrom(source.albedoColor);
  material.emissiveColor.copyFrom(source.emissiveColor);
  if (source.emissiveColor.r + source.emissiveColor.g + source.emissiveColor.b > 0) material.emissiveTexture = source.emissiveTexture;
  material.alpha = source.alpha;
  material.transparencyMode = source.transparencyMode;
  material.alphaCutOff = source.alphaCutOff;
  material.backFaceCulling = source.backFaceCulling;
  material.twoSidedLighting = source.twoSidedLighting;
  material.maxSimultaneousLights = 0;
  material.metadata = {distantTree:true};
  new FarTreeLight(material, lighting);
  material.freeze();
  return material;
}
