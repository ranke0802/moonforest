import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {validHorseCoat} from './horse-coat.js';
import {WAGON_HORSE} from './wagon-horse.js';
import {createRidingSaddle,placeRidingSaddle} from './riding-saddle.js';

const COLOR_KEY='v03:stable:coat';
export const RIDING_STATS=Object.freeze({speedMultiplier:1.7,gallopSpeed:14,gallopSeconds:2.4});

export function createRidingWardrobe({world,storage,owned,fieldHorse,canBorrow=()=>true,makeHorse}){
  let coat='original',session=null;
  function reload(){
    closePreview();
    try{coat=validHorseCoat(storage.getItem(COLOR_KEY))??'original';}catch{coat='original';}
  }
  function closePreview(only=session){
    if(!only||session!==only)return;
    session=null;
    if(only.borrowed)only.horse.setCoat?.(coat);
    else only.horse.dispose();
  }
  function setCoat(value){
    const next=validHorseCoat(value);
    if(!owned()||!next)return false;
    try{storage.setItem(COLOR_KEY,next);}catch{return false;}
    coat=next;
    const field=fieldHorse();field?.setCoat?.(coat);
    if(session?.horse&&session.horse!==field)session.horse.setCoat?.(coat);
    return true;
  }
  function preview(){
    if(!owned()||!world.scene||world.scene.isDisposed)return Promise.resolve(null);
    if(session)return session.ready;
    const field=fieldHorse(),borrowed=!!field?.root&&canBorrow();
    // While mounted the portrait draws the same skinned body and saddle.
    // On foot the inventory owns just one temporary horse, without a shadow caster.
    const horse=borrowed?field:makeHorse({scene:world.scene,wagon:{x:0,z:0},mounted:true,heightAt:()=>0});
    const entry=session={horse,borrowed};
    entry.ready=Promise.resolve(horse.ready).then(root=>{
      if(session!==entry)return null;
      if(!root||world.scene.isDisposed){closePreview(entry);return null;}
      if(!borrowed){
        horse.place(0,0,0);root.computeWorldMatrix(true);
        const saddle=createRidingSaddle(root);
        placeRidingSaddle(horse,saddle,new Vector3(),new Matrix());
      }
      horse.setCoat(coat);
      const meshes=root.getChildMeshes(false,m=>m.name!=='v03-riding-reins'&&m.isEnabled());
      return {actor:root,meshes,height:WAGON_HORSE.height,width:borrowed&&horse.clip==='Horse_Gallop'?3.55:2.55,
        setCoat(value){const next=validHorseCoat(value);if(next&&session===entry)horse.setCoat(next);},
        dispose:()=>closePreview(entry)};
    }).catch(()=>{closePreview(entry);return null;});
    return entry.ready;
  }
  return {get owned(){return owned();},get coat(){return coat;},stats:RIDING_STATS,reload,setCoat,preview,closePreview};
}
