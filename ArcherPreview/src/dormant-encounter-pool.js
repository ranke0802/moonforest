// Only a completed, hidden, library-cloned manual actor is eligible. Sources,
// textures and derived shared materials retain their library ownership.
export function canReleaseDormantEncounter(enemy){
 return !!enemy?.assetPrepared&&enemy.active===false&&!enemy.loading&&!enemy.hiddenPreparationPending&&!!enemy.actor&&!enemy.actor.isEnabled();
}
export function releaseDormantEncounter(enemy,source){
 if(!canReleaseDormantEncounter(enemy))return false;
 const asset=enemy.asset;
 if(!asset||asset===source)return false;
 const sourceManagers=new Set((source?.meshes??[]).map(mesh=>mesh.morphTargetManager).filter(Boolean));
 const managers=new Set(asset.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean));
 enemy.setShadowCasting?.(false);enemy.animator?.dispose();enemy.spell?.dispose();enemy.contact?.dispose();
 if(enemy.ring&&!enemy.ring.isDisposed()){enemy.ring.material?.dispose();enemy.ring.dispose();}
 enemy.actor.dispose(false,false);
 for(const group of asset.animationGroups??[])group.dispose();
 for(const mesh of asset.meshes)if(!mesh.isDisposed())mesh.dispose(false,false);
 for(const node of asset.transformNodes??[])if(!node.isDisposed())node.dispose(false,false);
 for(const skeleton of asset.skeletons??[])skeleton.dispose();
 for(const manager of managers)if(!sourceManagers.has(manager))manager.dispose();
 enemy.asset=null;enemy.assetAcquisition=null;enemy.animator=null;enemy.assetPrepared=false;
 return true;
}

// Tail-only removal keeps stable pool indices/resident slot0. A prepare still
// using a slot stops trimming that tail; it is never detached mid-operation.
export async function trimDormantEncounterPools(groups,{limit=12,minimum=1,current=()=>true,pause=()=>Promise.resolve(),release=releaseDormantEncounter}={}){
 let total=groups.reduce((n,row)=>n+row.pool.length,0),released=0;
 for(const row of groups){
  while(total>limit&&row.pool.length>minimum){
   if(!current())return {released,retained:total,cancelled:true};
   const enemy=row.pool.at(-1);if(!canReleaseDormantEncounter(enemy))break;
   await pause();if(!current()||row.pool.at(-1)!==enemy||!canReleaseDormantEncounter(enemy))break;
   if(!release(enemy,row.models?.container))break;
   row.pool.pop();released++;total--;
  }
 }
 return {released,retained:total,cancelled:!current(),limit,minimum};
}
