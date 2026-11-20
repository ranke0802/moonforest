import { MaterialPluginBase, SceneLoader } from '@babylonjs/core';
import { equipmentStyle } from './equipment-stats.js';
export { EQUIPMENT_STYLES, equipmentStyles } from './equipment-stats.js';
// Swords with their own shape (equipment-stats.js SWORD_MODELS), fitted to the standard sword's local frame.
const SWORD_MODEL_URLS = { 'soldier-sword': new URL('./v03/models/soldier-sword.glb', import.meta.url) };
const STORAGE_KEY = 'moonforest-warrior-equipment-v1';
const MESH_NAMES = { sword: 'Golden_Oathblade', shield: 'Bunnyguard_Shield' };

export function readEquipmentChoices(storage) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'); } catch { /* Use defaults. */ }
  return { sword: equipmentStyle('sword', saved?.sword).id, shield: equipmentStyle('shield', saved?.shield).id };
}
export function saveEquipmentChoices(storage, choices) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify({ sword: equipmentStyle('sword', choices.sword).id, shield: equipmentStyle('shield', choices.shield).id })); } catch { /* Session selection still works. */ }
}

// Reuse the authored UV map and its painted grain, seams and highlights. Only the
// equipment's sampled surface color changes; no geometry, mount or animation is edited.
class EquipmentPalette extends MaterialPluginBase {
  constructor(material, slot) {
    super(material, 'EquipmentPalette', 200, {MOONFOREST_EQUIPMENT_PALETTE:true}, true, true);
    this.doNotSerialize=true;
    this.slot = slot === 'sword' ? 0 : 1;
    this.variant = 0;
  }
  getClassName(){return 'MoonforestEquipmentPalette';}
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
  // loadModel(url, scene) resolves an asset container holding one mesh (tests pass their own).
  constructor(container, choices = {}, { loadModel = (url, scene) => SceneLoader.LoadAssetContainerAsync(url.href ?? String(url), '', scene, undefined, '.glb') } = {}) {
    this.slots = {}; this.loadModel = loadModel; this.shapes = new Map(); this.shapeTicket = 0; this.disposed = false;
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
    const style = equipmentStyle(slot, id);
    entry.palette.variant = style.value;
    entry.style = style.id;
    if (slot === 'sword') this.shape(style.model ?? null);
    return style.id;
  }
  // The sword's shape: null is the standard sword. A model is loaded once (a small file, on first use) and its
  // geometry and painting are put on the standard sword's mesh and on its outline shell, which share one geometry.
  shape(model) {
    const entry = this.slots.sword; if (!entry || (entry.model ?? null) === (model ?? null)) return;
    entry.model = model ?? null; const ticket = ++this.shapeTicket;
    if (!model) { this.wear(null); return; }
    const url = SWORD_MODEL_URLS[model]; if (!url) return;
    let pending = this.shapes.get(model);
    if (!pending) { pending = Promise.resolve(this.loadModel(url, entry.mesh.getScene())); this.shapes.set(model, pending); }
    pending.then(container => { if (this.disposed) { container.dispose(); return; } if (ticket === this.shapeTicket) this.wear(container); })
      .catch(error => { this.shapes.delete(model); console.warn('[Equipment] sword model unavailable', model, error); });
  }
  wear(container) {
    const entry = this.slots.sword, standard = entry.geometry ??= entry.mesh.geometry;
    const source = container?.meshes.find(mesh => mesh.getTotalVertices?.() > 0), next = source?.geometry ?? standard;
    for (const mesh of [entry.mesh, ...entry.mesh.getChildMeshes(true)]) if (mesh.geometry && mesh.geometry !== next && (mesh === entry.mesh || mesh.geometry === entry.worn || mesh.geometry === standard)) next.applyToMesh(mesh);
    entry.worn = next;
    const painting = source?.material?.albedoTexture ?? source?.material?.diffuseTexture ?? source?.material?.emissiveTexture;
    entry.material.emissiveTexture = painting ?? entry.original.emissiveTexture;
  }
  inspect() { return Object.fromEntries(Object.entries(this.slots).map(([slot, entry]) => [slot, entry.style])); }
  dispose() {
    this.disposed = true; this.shapeTicket++;
    if (this.slots.sword?.geometry) this.wear(null);
    for (const pending of this.shapes.values()) pending.then(container => container.dispose()).catch(() => {});
    this.shapes.clear();
    for (const entry of Object.values(this.slots)) {
      entry.mesh.material = entry.original;
      // Both variants share the original map; the asset container owns that texture.
      entry.material.dispose(false, false);
    }
    this.slots = {};
  }
}
