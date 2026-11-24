import { MaterialPluginBase, SceneLoader, VertexData } from '@babylonjs/core';
import { equipmentStyle } from './equipment-stats.js';
import { simplifySharedShell } from './mesh-simplify.js';
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

function trophyBladeGeometry(base,profile){
  const result=base.copy('trophy-'+profile),positions=base.getVerticesData('position');
  if(!positions)return result;
  const vertices=Float32Array.from(positions);
  for(let i=0;i<vertices.length;i+=3){
    const t=Math.max(0,Math.min(1,(.52-vertices[i+1])/1.47)),bend=Math.sin(Math.PI*t);
    if(!t)continue;
    if(profile==='knife')vertices[i]*=1-.34*bend;
    if(profile==='great')vertices[i]*=1+.60*bend;
    if(profile==='ritual')vertices[i]+=.048*Math.sin(Math.PI*t*3)*bend;
    if(profile==='fang')vertices[i]+=.080*bend*t;
    if(profile==='cleaver'){vertices[i]*=1+.8*bend*t;vertices[i]+=.056*t;}
  }
  result.setVerticesData('position',vertices);
  const indices=result.getIndices();
  if(indices){const normals=new Float32Array(vertices.length);VertexData.ComputeNormals(vertices,indices,normals);result.setVerticesData('normal',normals);}
  return result;
}

export class WarriorEquipment {
  // loadModel(url, scene) resolves an asset container holding one mesh (tests pass their own).
  constructor(container, choices = {}, { loadModel = (url, scene) => SceneLoader.LoadAssetContainerAsync(url.href ?? String(url), '', scene, undefined, '.glb'),
    loadTrophy = (scene,id)=>import('./v03/foe-weapons.js').then(({acquireFoeWeapon})=>acquireFoeWeapon(scene,id)) } = {}) {
    this.slots = {}; this.loadModel = loadModel; this.loadTrophy=loadTrophy; this.shapes = new Map(); this.blades = new Map(); this.shapeTicket = 0; this.disposed = false;
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
  shape(model, profile = '') {
    const entry = this.slots.sword;
    if (!entry || ((entry.model ?? null) === (model ?? null) && (entry.profile ?? '') === profile)) return;
    entry.profile = profile;
    entry.model = model ?? null; const ticket = ++this.shapeTicket;
    if (!model) { this.wear(null); this.releaseTrophies(null); return; }
    const trophy=model.startsWith('trophy:'),url=SWORD_MODEL_URLS[model];
    if (!url&&!trophy) return;
    let pending = this.shapes.get(model);
    if (!pending) {
      pending=trophy
        ? Promise.resolve(this.loadTrophy(entry.mesh.getScene(),model.slice(7)))
        : Promise.resolve(this.loadModel(url,entry.mesh.getScene()));
      this.shapes.set(model,pending);
    }
    pending.then(container => { if (this.disposed) { container.dispose(); return; } if (ticket === this.shapeTicket){this.wear(container);this.releaseTrophies(model);} })
      .catch(error => { this.shapes.delete(model); console.warn('[Equipment] sword model unavailable', model, error); });
  }
  releaseTrophies(equipped){
    for(const [id,pending] of this.shapes)if(id.startsWith('trophy:')&&id!==equipped){
      this.shapes.delete(id);pending.then(asset=>asset.dispose()).catch(()=>{});
    }
  }
  // Trophy blades keep the authored grip, tip reach, UVs and rig mount.
  // One derived geometry is shared by the blade and its existing outline.
  selectTrophy(finish,profile='') {
    const entry=this.slots.sword;if(!entry)return;
    const style=equipmentStyle('sword',finish);
    entry.palette.variant=style.value;entry.style=style.id;
    if(profile?.startsWith('trophy:'))this.shape(profile);
    else this.shape(style.model??null,profile);
  }
  wear(container) {
    const entry = this.slots.sword, standard = entry.geometry ??= entry.mesh.geometry;
    const source = container?.meshes.find(mesh => mesh.getTotalVertices?.() > 0), base = source?.geometry ?? standard;
    let next=base;
    if(entry.profile){
      const key=base.uniqueId+'/'+entry.profile;
      if(!this.blades.has(key))this.blades.set(key,trophyBladeGeometry(base,entry.profile));
      next=this.blades.get(key);
    }
    for (const mesh of [entry.mesh, ...entry.mesh.getChildMeshes(true)]) {
      const previous = mesh.geometry;
      if (!previous || previous === next) continue;
      const reducedOutline = mesh.metadata?.moonforestOutline && mesh.metadata.simplifiedTriangles;
      if (mesh !== entry.mesh && previous !== entry.worn && previous !== standard && !reducedOutline) continue;
      if (reducedOutline && next === entry.worn) continue;

      // All weapon models have one painted primitive. Babylon otherwise retains a
      // smaller, still-valid submesh range when switching back to a larger blade.
      mesh.releaseSubMeshes();
      next.applyToMesh(mesh);
      if (reducedOutline) {
        if (previous !== standard && previous !== entry.worn && !previous.meshes.length) previous.dispose();
        simplifySharedShell(mesh, {ratio: .5, error: .01});
      }
    }
    entry.worn = next;
    const painting = source?.material?.albedoTexture ?? source?.material?.diffuseTexture ?? source?.material?.emissiveTexture;
    entry.material.emissiveTexture = painting ?? entry.original.emissiveTexture;
  }
  inspect() { return Object.fromEntries(Object.entries(this.slots).map(([slot, entry]) => [slot, entry.style])); }
  dispose() {
    this.disposed = true; this.shapeTicket++;
    if (this.slots.sword?.geometry) {this.slots.sword.profile='';this.wear(null);}
    for (const pending of this.shapes.values()) pending.then(container => container.dispose()).catch(() => {});
    this.shapes.clear();for(const geometry of this.blades.values())geometry.dispose();this.blades.clear();
    for (const entry of Object.values(this.slots)) {
      entry.mesh.material = entry.original;
      // Both variants share the original map; the asset container owns that texture.
      entry.material.dispose(false, false);
    }
    this.slots = {};
  }
}
