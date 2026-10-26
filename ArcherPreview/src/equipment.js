import { MaterialPluginBase } from '@babylonjs/core';
import { EQUIPMENT_STYLES } from './equipment-stats.js';
export { EQUIPMENT_STYLES } from './equipment-stats.js';
const STORAGE_KEY = 'moonforest-warrior-equipment-v1';
const MESH_NAMES = { sword: 'Golden_Oathblade', shield: 'Bunnyguard_Shield' };
const styleOf = id => EQUIPMENT_STYLES.find(style => style.id === id) || EQUIPMENT_STYLES[0];

export function readEquipmentChoices(storage) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'); } catch { /* Use defaults. */ }
  return { sword: styleOf(saved?.sword).id, shield: styleOf(saved?.shield).id };
}
export function saveEquipmentChoices(storage, choices) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify({ sword: styleOf(choices.sword).id, shield: styleOf(choices.shield).id })); } catch { /* Session selection still works. */ }
}

// Reuse the authored UV map and its painted grain, seams and highlights. Only the
// equipment's sampled surface color changes; no geometry, mount or animation is edited.
class EquipmentPalette extends MaterialPluginBase {
  constructor(material, slot) {
    super(material, 'EquipmentPalette', 200, {}, true, true);
    this.slot = slot === 'sword' ? 0 : 1;
    this.variant = 0;
  }
  getUniforms() {
    return { ubo: [{ name: 'equipmentPalette', size: 2, type: 'vec2' }], fragment: 'uniform vec2 equipmentPalette;' };
  }
  bindForSubMesh(buffer) { buffer.updateFloat2('equipmentPalette', this.slot, this.variant); }
  getCustomCode(type) {
    if (type === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: 'varying vec3 vEquipmentLocalPosition;',
      CUSTOM_VERTEX_UPDATE_POSITION: 'vEquipmentLocalPosition = positionUpdated;',
    };
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec3 vEquipmentLocalPosition;
        vec3 equipmentTint(vec3 color, vec3 tint) {
          float lightness = dot(color, vec3(0.299, 0.587, 0.114));
          return clamp(lightness * tint, 0.0, 1.0);
        }
        vec3 equipmentSurface(vec3 color) {
          float violet = 1.0 - step(1.5, equipmentPalette.y);
          float warmth = (color.r - color.b) / max(color.r, 0.001);
          float lightness = dot(color, vec3(0.299, 0.587, 0.114));
          if (equipmentPalette.x < 0.5) {
            // The grip occupies a fixed interval on the original sword's local Y.
            // Combining position and color avoids turning the gold collars into leather.
            float grip = smoothstep(0.56, 0.59, vEquipmentLocalPosition.y)
              * (1.0 - smoothstep(0.85, 0.88, vEquipmentLocalPosition.y))
              * (1.0 - smoothstep(0.42, 0.56, lightness));
            float gold = smoothstep(0.24, 0.43, warmth) * (1.0 - grip);
            vec3 steel = equipmentTint(color, mix(vec3(0.78, 0.96, 1.14), vec3(1.01, 0.99, 1.06), violet));
            vec3 metal = equipmentTint(color, mix(vec3(1.32, 0.90, 0.61), vec3(1.01, 1.00, 1.08), violet));
            vec3 leather = equipmentTint(color, mix(vec3(0.50, 1.34, 1.30), vec3(1.45, 0.78, 1.55), violet));
            return mix(mix(steel, metal, gold), leather, grip);
          }
          // Wood is saturated brown; the ivory rabbit and its tan ears remain intact.
          float wood = smoothstep(0.43, 0.57, warmth);
          float silver = (1.0 - smoothstep(0.08, 0.20, warmth)) * smoothstep(0.20, 0.34, lightness);
          vec3 timber = equipmentTint(color, mix(vec3(0.44, 0.98, 1.03), vec3(1.10, 0.65, 1.30), violet));
          vec3 rim = equipmentTint(color, mix(vec3(1.35, 0.93, 0.63), vec3(1.00, 1.00, 1.05), violet));
          return mix(mix(color, rim, silver), timber, wood);
        }`,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        if (equipmentPalette.y > 0.5) {
          finalEmissive = toLinearSpace(equipmentSurface(toGammaSpace(finalEmissive)));
        }`,
    };
  }
}

export class WarriorEquipment {
  constructor(container, choices = {}) {
    this.slots = {};
    for (const [slot, name] of Object.entries(MESH_NAMES)) {
      const mesh = container.meshes.find(candidate => candidate.name === name);
      if (!mesh?.material?.emissiveTexture) throw new Error(`${name}: 장비 재질을 찾지 못했습니다.`);
    }
    for (const [slot, name] of Object.entries(MESH_NAMES)) {
      const mesh = container.meshes.find(candidate => candidate.name === name);
      const original = mesh.material;
      const material = original.clone(`${original.name} / selectable`);
      const clonedMap = material.emissiveTexture;
      material.emissiveTexture = original.emissiveTexture;
      if (clonedMap && clonedMap !== original.emissiveTexture) clonedMap.dispose();
      const palette = new EquipmentPalette(material, slot);
      mesh.material = material;
      this.slots[slot] = { mesh, original, material, palette, style: 'original' };
      this.select(slot, choices[slot]);
    }
  }
  select(slot, id) {
    const entry = this.slots[slot];
    if (!entry) throw new Error(`Unknown equipment slot: ${slot}`);
    const style = styleOf(id);
    entry.palette.variant = style.value;
    entry.style = style.id;
    return style.id;
  }
  inspect() { return Object.fromEntries(Object.entries(this.slots).map(([slot, entry]) => [slot, entry.style])); }
  dispose() {
    for (const entry of Object.values(this.slots)) {
      entry.mesh.material = entry.original;
      // Both variants share the original map; the asset container owns that texture.
      entry.material.dispose(false, false);
    }
    this.slots = {};
  }
}
