import { Color3, PBRMaterial } from '@babylonjs/core';

const materials = new WeakMap();
// Match the warrior body's KHR_materials_unlit path. Babylon calls this class
// PBRMaterial, but UNLIT + disableLighting compile out the PBR lighting. Keeping
// the glTF material path also preserves sRGB texture decoding: StandardMaterial
// would decode the loader's hardware-decoded sRGB textures a second time.
export function applyMonsterToon(asset) {
  for (const mesh of asset.meshes) {
    const source = mesh.material;
    if (!mesh.getTotalVertices() || !source || mesh.metadata?.moonforestOutline
      || source.metadata?.moonforestMonsterToon || source.getClassName() !== 'PBRMaterial') continue;
    let toon = materials.get(source);
    if (!toon) {
      toon = new PBRMaterial(`${source.name}-painted-unlit`, mesh.getScene());
      toon.albedoTexture = source.albedoTexture;
      toon.albedoColor = source.albedoColor.clone();
      toon.alpha = source.alpha;
      toon.useAlphaFromAlbedoTexture = source.useAlphaFromAlbedoTexture;
      toon.transparencyMode = source.transparencyMode;
      toon.alphaCutOff = source.alphaCutOff;
      toon.backFaceCulling = source.backFaceCulling;
      toon.sideOrientation = source.sideOrientation;
      toon.twoSidedLighting = source.twoSidedLighting;
      toon.imageProcessingConfiguration = source.imageProcessingConfiguration;
      toon.unlit = true;
      toon.disableLighting = true;
      toon.reflectionTexture = null;
      toon.bumpTexture = null;
      toon.ambientTexture = null;
      toon.metallicTexture = null;
      toon.emissiveTexture = null;
      toon.emissiveColor = Color3.Black();
      toon.metallic = 0;
      toon.roughness = 1;
      toon.metadata = { ...source.metadata, moonforestMonsterToon: true };
      materials.set(source, toon);
    }
    mesh.material = toon;
  }
}
