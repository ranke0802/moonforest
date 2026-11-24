import {Color3,PBRMaterial,Vector3} from '@babylonjs/core';
import {createActorEncounterFactory} from '../actor-encounter-adapter.js';
import {applyCharacterSurfaceStyle} from '../character-style.js';
import {isRuntimeOutline} from '../character-outlines.js';

const beasts={
  'corrupted-wolf':{id:'gray-wolf.r1',label:'검은 늑대',tint:new Color3(.27,.24,.34),style:'wolf'},
  'corrupted-bear':{id:'guardian-bear.standard',label:'마물화된 검은곰',tint:new Color3(.28,.21,.25),style:'boss'},
};

// Give the cave creature a painted coat without modifying the plains library
// or making a second copy of its texture. Meshes/range/animation remain native.
function tintCoat(asset,profile){
  const coats=new Map(),assignments=[];
  for(const mesh of asset.meshes){
    const original=mesh.material;
    if(!original?.albedoColor||!mesh.getTotalVertices()||isRuntimeOutline(mesh))continue;
    let coat=coats.get(original);
    if(!coat){
      coat=new PBRMaterial(profile.id+'-cave-coat',mesh.getScene());
      coat.unlit=true;coat.disableLighting=true;coat.metallic=0;coat.roughness=1;
      coat.albedoTexture=original.albedoTexture;coat.albedoColor=original.albedoColor.multiply(profile.tint);
      for(const field of ['alpha','useAlphaFromAlbedoTexture','transparencyMode','alphaCutOff','backFaceCulling','sideOrientation','twoSidedLighting','imageProcessingConfiguration'])coat[field]=original[field];
      coat.metadata={...original.metadata};coats.set(original,coat);
    }
    assignments.push([mesh,original]);mesh.material=coat;
  }
  applyCharacterSurfaceStyle(asset,profile.style);
  return ()=>{
    for(const [mesh,original] of assignments)if(!mesh.isDisposed())mesh.material=original;
    for(const coat of coats.values())coat.dispose(false,false);
  };
}

export function createCorruptedBeastFactory({world,battle,onDefeat}){
  const lives=new Map();
  const factory=createActorEncounterFactory({world,battle,rewardsEnabled:true,onDefeat:event=>{
    const row=lives.get(event.actorId);if(row)onDefeat({...event,id:row.id,kind:row.kind});
  }});
  return {
    async create(row){
      const profile=beasts[row.kind];
      const adapter=factory(profile.id,{mapId:world.mapId,isCurrent:row.isCurrent});
      let restore,retired=false;
      const dispose=()=>{if(retired)return;retired=true;lives.delete(adapter.id);restore?.();return adapter.dispose();};
      try{
        await adapter.warm({isCurrent:row.isCurrent});
        restore=tintCoat(adapter.encounter.asset,profile);
        await adapter.prepareVisible({isCurrent:row.isCurrent});
        await adapter.activate({player:row.player,position:new Vector3(row.x,world.terrain.heightAt(row.x,row.z),row.z),
          rotationY:row.yaw,row:{territory:row.home}},{isCurrent:row.isCurrent});
        adapter.encounter.displayName=profile.label;
        lives.set(adapter.id,row);
        return {encounter:adapter.encounter,dispose};
      }catch(error){await dispose();throw error;}
    },
    dispose(){lives.clear();return factory.dispose();}
  };
}
