// 0.3: freeze the materials of skinned characters once they have drawn (2026-11-23).
// Measured on the deployed build (PC, plains): an unfrozen material re-checks its whole define set
// for every submesh every frame; freezing the 23 character/equipment materials took the render
// call from 1.52 to 1.22 ms (scenery materials: no measurable change, so they are left alone).
//
// A frozen material ignores define changes (a light added or toggled, shadows, a texture swap, a
// plugin toggle, visibility crossing 1). Babylon marks those through two doors: the material's
// _markAllSubMeshesAsDirty and each mesh's _markSubMeshesAsDirty. Both are wrapped so the material
// is unfrozen before the mark lands. The next scan freezes it again once every submesh that uses it
// has rebuilt its defines and drawn with a ready effect. As a last guard a scan also thaws a frozen
// material whose drawn submesh still has dirty defines.
// The flag is set directly: freeze()/unfreeze() would walk every submesh of the scene (markDirty),
// and neither is needed here (frozen only after drawing clean, thawed before any new mark).
// Colour/alpha written straight into a material are not dirty marks: characters do not do that
// (hit flash is a mesh overlay, fades use mesh.visibility, styles are plugin uniforms).
// Lifetime: scene-level. Keeps no mesh or material lists between scans (WeakSets only).

const hooked=new WeakSet(),hookedMeshes=new WeakSet(),excluded=new WeakSet();
const SCAN_SECONDS=1;

const frozen=material=>material.checkReadyOnlyOnce===true;
function eligible(material){
 if(!material||excluded.has(material))return false;
 const name=material.getClassName?.();
 if((name!=='PBRMaterial'&&name!=='StandardMaterial')||typeof material._markAllSubMeshesAsDirty!=='function'){excluded.add(material);return false;}
 return !material.checkReadyOnEveryCall&&material.metadata?.noFreeze!==true;
}

export function createActorMaterialFreeze(scene,{enabled=true}={}){
 const state={enabled,frozenNow:0,freezes:0,thaws:0,lateThaws:0,scans:0,lastScanMs:0};
 const thaw=material=>{material.checkReadyOnlyOnce=false;state.thaws++;};
 // Per scan only: material -> 1 ready and clean so far, 0 something unready, 2 frozen but stale.
 const verdict=new Map();
 function hookMaterial(material){
  if(hooked.has(material))return;hooked.add(material);
  const mark=material._markAllSubMeshesAsDirty;
  material._markAllSubMeshesAsDirty=function(func){if(state.enabled&&frozen(this))thaw(this);return mark.call(this,func);};
 }
 function hookMesh(mesh){
  if(hookedMeshes.has(mesh)||typeof mesh._markSubMeshesAsDirty!=='function')return;hookedMeshes.add(mesh);
  const mark=mesh._markSubMeshesAsDirty;
  mesh._markSubMeshesAsDirty=function(func){
   const subMeshes=state.enabled?this.subMeshes:null;
   if(subMeshes)for(let i=0;i<subMeshes.length;i++){const material=subMeshes[i].getMaterial(true);if(material&&hooked.has(material)&&frozen(material))thaw(material);}
   return mark.call(this,func);
  };
 }
 function scan(){
  const began=performance.now(),meshes=scene.meshes;
  for(let i=0;i<meshes.length;i++){const mesh=meshes[i];if(mesh.skeleton&&mesh.isEnabled(false)&&eligible(mesh.material))verdict.set(mesh.material,1);}
  if(verdict.size){
   // Every submesh drawn with a candidate material (skinned or not) must be clean and ready.
   for(let i=0;i<meshes.length;i++){
    const mesh=meshes[i],subMeshes=mesh.subMeshes;if(!subMeshes)continue;
    for(let j=0;j<subMeshes.length;j++){
     const material=subMeshes[j].getMaterial(true),seen=verdict.get(material);if(seen===undefined)continue;
     hookMesh(mesh);
     const wrapper=subMeshes[j]._drawWrapper,dirty=!!wrapper?.defines?.isDirty;
     if(frozen(material)){if(dirty&&wrapper._wasPreviouslyReady)verdict.set(material,2);}
     else if(seen===1&&(!wrapper?._wasPreviouslyReady||!wrapper.effect?.isReady?.()||dirty))verdict.set(material,0);
    }
   }
   for(const [material,value] of verdict){
    if(value===2){thaw(material);state.lateThaws++;}
    else if(value===1&&!frozen(material)){hookMaterial(material);material.checkReadyOnlyOnce=true;state.freezes++;}
   }
   verdict.clear();
  }
  let count=0;
  for(let i=0;i<meshes.length;i++){const material=meshes[i].skeleton?meshes[i].material:null;if(material&&hooked.has(material)&&frozen(material))count++;}
  state.frozenNow=count;state.scans++;state.lastScanMs=performance.now()-began;
 }
 let clock=0;
 const observer=scene.onAfterRenderObservable.add(()=>{
  if(!state.enabled)return;
  clock+=scene.getEngine().getDeltaTime()/1000;
  if(clock>=SCAN_SECONDS){clock=0;scan();}
 });
 state.scan=scan;
 state.dispose=()=>{scene.onAfterRenderObservable.remove(observer);verdict.clear();};
 state.setEnabled=value=>{
  state.enabled=value===true;
  if(!state.enabled)for(const material of scene.materials)if(hooked.has(material)&&frozen(material))material.checkReadyOnlyOnce=false;
 };
 scene.onDisposeObservable.addOnce(()=>state.dispose());
 return state;
}
