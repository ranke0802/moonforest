import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {loadOwnedModel} from './owned-model.js';

export const FOE_WEAPON_MODELS=Object.freeze({
  'goblin-warrior-dagger':new URL('./models/foe-weapons/goblin-warrior-dagger.glb',import.meta.url),
  'goblin-archer-bow':new URL('./models/foe-weapons/goblin-archer-bow.glb',import.meta.url),
  'goblin-shaman-staff':new URL('./models/foe-weapons/goblin-shaman-staff.glb',import.meta.url),
  'hobgoblin-club':new URL('./models/foe-weapons/hobgoblin-club.glb',import.meta.url),
  'ghoul-cleaver':new URL('./models/foe-weapons/ghoul-cleaver.glb',import.meta.url),
});
export const FOE_WEAPONS=Object.freeze({
  'goblin-warrior':{model:'goblin-warrior-dagger',side:'R',scale:.46,tilt:-1.48},
  'goblin-archer':{model:'goblin-archer-bow',side:'L',scale:.63,tilt:Math.PI},
  'goblin-shaman':{model:'goblin-shaman-staff',side:'R',scale:.68,tilt:2.95},
  'hobgoblin-boss':{model:'hobgoblin-club',side:'R',scale:.69,tilt:-1.36},
  'ghoul-warrior':{model:'ghoul-cleaver',side:'R',scale:.64,tilt:-1.46},
});
const scenes=new WeakMap();

// Geometry/paint are immutable and shared across simultaneously equipped actors.
// Each owner gets a separate, idempotent release. Nothing survives the last user.
export async function acquireFoeWeapon(scene,id,load=loadOwnedModel){
  const url=FOE_WEAPON_MODELS[id];
  if(!url)throw Error('Unknown field weapon '+id);
  let records=scenes.get(scene);
  if(!records){records=new Map();scenes.set(scene,records);}
  let record=records.get(id);
  if(!record){
    record={refs:0,ready:Promise.resolve().then(()=>load(scene,url)).then(source=>{
      for(const root of source.rootNodes)root.setEnabled(false);
      const mesh=source.meshes.find(m=>m.getTotalVertices?.()>0);
      if(!mesh){source.dispose();throw Error('Missing field weapon geometry '+id);}
      return {source,mesh};
    })};
    records.set(id,record);
  }
  record.refs++;
  let shared;
  try{shared=await record.ready;}catch(error){
    record.refs--;if(records.get(id)===record)records.delete(id);
    throw error;
  }
  let active=true;
  return {meshes:[shared.mesh],dispose(){
    if(!active)return;active=false;
    if(--record.refs===0){if(records.get(id)===record)records.delete(id);shared.source.dispose();}
  }};
}

// The skinned hand node is pose-driven. The displayed prop mesh uses the same
// authored grip and one draw as the version the player can take from the drop.
export function mountEnemyWeapon(scene,owner,kind,acquire=acquireFoeWeapon){
  const slot=FOE_WEAPONS[kind],hand=slot&&owner.transformNodes.find(n=>n.name==='Hand.'+slot.side);
  let disposed=false,lease,mount;
  const ready=hand?Promise.resolve().then(()=>acquire(scene,slot.model)).then(asset=>{
    if(disposed||hand.isDisposed?.()){asset.dispose();return false;}
    lease=asset;
    const source=asset.meshes[0];
    mount=new TransformNode(kind+'-weapon-grip',scene);mount.parent=hand;
    mount.position.set(slot.side==='L'?.035:-.035,-.009,.018);mount.rotation.x=slot.tilt;mount.scaling.setAll(slot.scale);
    const mesh=new Mesh(kind+'-held-weapon',scene);mesh.parent=mount;
    mesh.position.y=-.72;source.geometry.applyToMesh(mesh);
    mesh.material=source.material;mesh.isPickable=false;mesh.receiveShadows=true;
    return true;
  }).catch(error=>{if(!disposed)console.warn('[MoonForest] enemy weapon unavailable',kind,error);return false;}):Promise.resolve(false);
  return {ready,dispose(){if(disposed)return;disposed=true;mount?.dispose();lease?.dispose();}};
}
