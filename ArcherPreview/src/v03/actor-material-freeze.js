// 0.3: freeze the materials of skinned characters once they have drawn (2026-11-23).
// Measured on the deployed build (PC, plains): an unfrozen material re-checks its whole define set
// for every submesh every frame; freezing the 23 character/equipment materials took the render
// call from 1.52 to 1.22 ms (scenery materials: no measurable change, so they are left alone).
//
// A frozen material ignores define changes (a light added or toggled, shadows, a texture swap, a
// plugin toggle, visibility crossing 1). Babylon marks those through two doors: the material's
// _markAllSubMeshesAsDirty and each mesh's _markSubMeshesAsDirty. Both are wrapped so the material
// is unfrozen before the mark lands. A later scan freezes it again once every submesh that uses it
// has rebuilt its defines and drawn with a ready effect. As a last guard a scan also thaws a frozen
// material whose drawn submesh still has dirty defines.
// The flag is set directly: freeze()/unfreeze() would walk every submesh of the scene (markDirty),
// and neither is needed here (frozen only after drawing clean, thawed before any new mark).
// Colour/alpha written straight into a material are not dirty marks: characters do not do that
// (hit flash is a mesh overlay, fades use mesh.visibility, styles are plugin uniforms).
// The scan is sliced (SLICE meshes a frame): a whole-scene walk in one frame was 0.5-0.8 ms on PC,
// several ms on a phone. A cycle that sees the mesh list change is dropped, so a shifted index can
// never skip a mesh; the next cycle starts over.
// Lifetime: scene-level. Between cycles it keeps no mesh or material list (WeakSets only); during a
// cycle (a few frames) it holds the candidate materials and their draw wrappers.

const hooked=new WeakSet(),hookedMeshes=new WeakSet(),excluded=new WeakSet();
const SCAN_SECONDS=1,SLICE=400;

const frozen=material=>material.checkReadyOnlyOnce===true;
function eligible(material){
 if(!material||excluded.has(material))return false;
 const name=material.getClassName?.();
 if((name!=='PBRMaterial'&&name!=='StandardMaterial')||typeof material._markAllSubMeshesAsDirty!=='function'){excluded.add(material);return false;}
 return !material.checkReadyOnEveryCall&&material.metadata?.noFreeze!==true;
}

export function createActorMaterialFreeze(scene,{enabled=true,slice=SLICE}={}){
 const state={enabled,frozenNow:0,freezes:0,thaws:0,lateThaws:0,scans:0,dropped:0,lastScanMs:0,lastCycleFrames:0};
 const thaw=material=>{material.checkReadyOnlyOnce=false;state.thaws++;};
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

 // One cycle: phase 0 nominates the materials of enabled skinned meshes; phase 1 collects every
 // submesh that draws with a nominated material (skinned or not); finish() decides per material.
 const candidates=new Map();// material -> draw wrappers (this cycle only)
 let phase=-1,cursor=0,length=0,spent=0,frames=0;
 function begin(){candidates.clear();phase=0;cursor=0;length=scene.meshes.length;spent=0;frames=0;}
 function drop(){candidates.clear();phase=-1;state.dropped++;}
 function nominate(stop,meshes){
  for(let i=cursor;i<stop;i++){const mesh=meshes[i];if(mesh.skeleton&&mesh.isEnabled(false)&&eligible(mesh.material)&&!candidates.has(mesh.material))candidates.set(mesh.material,[]);}
 }
 function collect(stop,meshes){
  for(let i=cursor;i<stop;i++){
   const mesh=meshes[i],own=mesh.material;
   if(!own||(own.subMaterials===undefined&&!candidates.has(own)))continue;
   const subMeshes=mesh.subMeshes;if(!subMeshes)continue;
   for(let j=0;j<subMeshes.length;j++){const list=candidates.get(subMeshes[j].getMaterial(true));if(!list)continue;hookMesh(mesh);list.push(subMeshes[j]._drawWrapper);}
  }
 }
 function finish(){
  let count=0;
  for(const [material,wrappers] of candidates){
   let ready=wrappers.length>0,stale=false;
   for(let i=0;i<wrappers.length;i++){
    const wrapper=wrappers[i],dirty=!!wrapper?.defines?.isDirty;
    if(dirty&&wrapper._wasPreviouslyReady)stale=true;
    if(!wrapper?._wasPreviouslyReady||!wrapper.effect?.isReady?.()||dirty)ready=false;
   }
   if(frozen(material)){if(stale){thaw(material);state.lateThaws++;}else count++;}
   else if(ready){hookMaterial(material);material.checkReadyOnlyOnce=true;state.freezes++;count++;}
  }
  candidates.clear();phase=-1;
  state.frozenNow=count;state.scans++;state.lastScanMs=spent;state.lastCycleFrames=frames;
 }
 // Advances the cycle by up to `budget` meshes; returns false once it finished or was dropped.
 function advance(budget){
  const started=performance.now(),meshes=scene.meshes;frames++;
  if(meshes.length!==length){drop();return false;}
  const stop=Math.min(length,cursor+budget);
  if(phase===0)nominate(stop,meshes);else collect(stop,meshes);
  cursor=stop;
  if(cursor>=length){if(phase===0){phase=1;cursor=0;}else{spent+=performance.now()-started;finish();return false;}}
  spent+=performance.now()-started;return true;
 }
 function scan(){begin();while(advance(Infinity));}

 let clock=0;
 const observer=scene.onAfterRenderObservable.add(()=>{
  if(!state.enabled)return;
  if(phase>=0){advance(slice);return;}
  clock+=scene.getEngine().getDeltaTime()/1000;
  if(clock>=SCAN_SECONDS){clock=0;begin();advance(slice);}
 });
 state.scan=scan;
 state.dispose=()=>{scene.onAfterRenderObservable.remove(observer);candidates.clear();phase=-1;};
 state.setEnabled=value=>{
  state.enabled=value===true;
  if(!state.enabled){candidates.clear();phase=-1;for(const material of scene.materials)if(hooked.has(material)&&frozen(material))material.checkReadyOnlyOnce=false;}
 };
 scene.onDisposeObservable.addOnce(()=>state.dispose());
 return state;
}
