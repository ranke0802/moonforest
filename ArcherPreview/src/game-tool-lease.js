import {createToolCameraInput} from './tool-camera-input.js';
import {attachToolFineZoom} from './tool-fine-zoom.js';
// Loaded only by explicit authoring/cinematic paths. A lease borrows the game's
// existing scene/frame loop; it never creates an engine, RAF or audio context.
export function acquireGameToolLease({world,root,canvas,input,audio,getState,setReady,resetInput,reconcile},options={}){
 const initial=getState(),scene=world.scene,mapId=world.mapId,camera=world.camera,generation=world.toolGeneration??0;
 if(world.toolLease?.active)throw new Error('다른 편집 또는 연출이 화면을 사용하고 있습니다.');
 if(!initial.ready||initial.loading||initial.dead||initial.hidden||initial.settings)throw new Error('플레이 준비가 끝난 뒤 편집·연출을 시작하세요.');
 const cameraProperties=['alpha','beta','radius','fov','inertia','minZ','maxZ','lowerAlphaLimit','upperAlphaLimit','lowerBetaLimit','upperBetaLimit','lowerRadiusLimit','upperRadiusLimit','inertialAlphaOffset','inertialBetaOffset','inertialRadiusOffset','inertialPanningX','inertialPanningY'];
 const target=camera.getTarget?.().clone(),savedCamera=Object.fromEntries(cameraProperties.map(key=>[key,camera[key]]));
 const saved={ready:initial.ready,suspended:input.suspended??false,hud:root.dataset.toolHudOwner,audioSuspended:audio.suspended,
  environment:audio.environment,combatMode:audio.combatMode,bossTheme:audio.bossTheme,musicWanted:audio.musicWanted,beds:{...audio.beds?.desired}};
 const doc=root.ownerDocument,style=doc.createElement('style');
 style.textContent='#app[data-tool-hud-owner] > :not(canvas):not([data-tool-ui]):not(style){visibility:hidden!important;pointer-events:none!important}';
 let active=true,paused=false,keyboard=null,disposeObserver,contextObserver,fineZoom,borrowedSceneInput=false,cameraMode='orbit',savedInputMap=null;const ownedCameraInputs=[];
 const copyInputEntry=entry=>({...entry,...(entry.modifiers?{modifiers:{...entry.modifiers}}:{}),...(Array.isArray(entry.key)?{key:[...entry.key]}:{})});
 const ownedVoices=new Set();
 const sameWorld=()=>world.scene===scene&&world.mapId===mapId&&(world.toolGeneration??0)===generation&&!scene.isDisposed;
 const restoreState=()=>{
  if(!sameWorld()||world.toolLease?.active||getState().loading||getState().failed)return false;
  if(target)camera.setTarget(target);Object.assign(camera,savedCamera);
  camera.movement?.resetPanVelocity?.();camera.movement?.resetRotationVelocity?.();camera.movement?.resetZoomVelocity?.();
  Object.assign(audio,{environment:saved.environment,combatMode:saved.combatMode,bossTheme:saved.bossTheme,musicWanted:saved.musicWanted});
  for(const channel of ['music','ambience'])audio.beds?.request(channel,saved.beds[channel]??null,0);
  // Input can arrive after cancellation while the GPU context is unavailable.
  // Those holds belong to the interrupted tool, not resumed gameplay.
  resetInput();input.setSuspended?.(saved.suspended);
  setReady(saved.ready);const state=getState();audio.setSuspended(saved.audioSuspended||state.hidden||state.settings||state.failed);reconcile();return true;
 };
 const token={owner:options.owner??'development',audioEnabled:options.audioEnabled===true,get active(){return active;},get paused(){return paused;},
  isCurrent(){return active&&world.toolLease===token&&sameWorld();},
  attachCamera(){if(!token.isCurrent()||!options.freeCamera)return;const mapper=camera.movement?.input;
   if(mapper){savedInputMap??=mapper.inputMap;mapper.inputMap=savedInputMap.map(copyInputEntry);}
   camera.attachControl(canvas,true,false,2);
   // Babylon 9.31 resolves the first matching rule: merely assigning pan to
   // button0 leaves its earlier rotate rule winning. Own an unambiguous map.
   if(mapper)mapper.inputMap=[{source:'pointer',button:0,interaction:cameraMode==='pan'?'pan':'rotate'},{source:'pointer',button:2,interaction:'pan'},...savedInputMap.filter(entry=>entry.source!=='pointer').map(copyInputEntry)];
  },
  setCameraMode(mode){if(!['orbit','pan'].includes(mode))return;cameraMode=mode;token.attachCamera();},
  get cameraMode(){return cameraMode;},
  update(dt){
   const state=getState();
   if(!token.isCurrent()){token.cancel('map-change',{restore:false});return;}
   if(state.dead){token.cancel('death');return;}
   if(state.failed){token.cancel('error',{restore:false});return;}
   if(!paused)options.onFrame?.(Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)));
  },
  setPaused(value){
   value=Boolean(value);if(!active||value===paused)return;paused=value;token.stopAudio();
   audio.setSuspended(paused||!token.audioEnabled);options.onPause?.(paused);
  },
  playAudio(id,settings){
   if(!token.isCurrent()||paused||!token.audioEnabled)return false;
   const before=new Set(audio.voices??[]),played=audio.play(id,settings);
   for(const voice of audio.voices??[])if(!before.has(voice))ownedVoices.add(voice);
   return played;
  },
  stopAudio(){for(const voice of ownedVoices){try{voice.source.stop();}catch{}voice.cleanup();}ownedVoices.clear();},
  release(reason='complete',{restore=true}={}){
   if(!active)return;active=false;
   const owns=world.toolLease===token,same=sameWorld();
   if(owns)world.toolLease=null;
   token.stopAudio();scene.onDisposeObservable.remove(disposeObserver);scene.getEngine?.().onContextLostObservable?.remove(contextObserver);
   fineZoom?.dispose();
   style.remove();
   if(saved.hud===undefined)delete root.dataset.toolHudOwner;else root.dataset.toolHudOwner=saved.hud;
   if(owns){
    if(options.freeCamera){camera.detachControl();for(const item of ownedCameraInputs)camera.inputs.remove(item);if(keyboard&&world.camera===camera&&!scene.isDisposed)camera.inputs.add(keyboard);}
    if(savedInputMap&&camera.movement?.input)camera.movement.input.inputMap=savedInputMap;
    if(borrowedSceneInput&&world.nativeSceneInputOwner===token){delete world.nativeSceneInputOwner;if(!scene.isDisposed)scene.detachControl();}
    resetInput();input.setSuspended?.(saved.suspended);
    if(restore&&same)restoreState();
   }
   options.onRelease?.(reason,{restored:restore&&same&&owns});
  },
  cancel(reason='cancel',settings){if(!active)return;token.release(reason,settings);options.onCancel?.(reason);},
 };
 world.toolLease=token;
 try{
  resetInput();input.setSuspended?.(true);setReady(false);audio.stopAll();audio.setSuspended(!token.audioEnabled);
  if(options.hideHud){root.dataset.toolHudOwner=token.owner;root.append(style);}
  if(options.freeCamera){
   // Gameplay deliberately disconnects Babylon's DOM pointer stream. Camera
   // inputs merely subscribe to that stream; attaching only the camera leaves
   // both orbit gestures and editor pre-pointer callbacks inert in the browser.
   if(world.sceneInputMode==='manual-game'){
    borrowedSceneInput=true;world.nativeSceneInputOwner=token;scene.attachControl(true,true,true);
   }
   keyboard=camera.inputs?.attached?.keyboard??null;if(keyboard)camera.inputs.remove(keyboard);
   if(!camera.inputs?.attached?.pointers&&camera.inputs?.addPointers){camera.inputs.addPointers();ownedCameraInputs.push(camera.inputs.attached.pointers);}
   if(!camera.inputs?.attached?.mousewheel&&camera.inputs?.addMouseWheel){camera.inputs.addMouseWheel();ownedCameraInputs.push(camera.inputs.attached.mousewheel);}
   if(canvas?.ownerDocument&&camera.inputs?.add){const movement=createToolCameraInput(canvas);camera.inputs.add(movement);ownedCameraInputs.push(movement);}
   for(const key of ['inertialAlphaOffset','inertialBetaOffset','inertialRadiusOffset','inertialPanningX','inertialPanningY'])if(key in camera)camera[key]=0;
   camera.movement?.resetPanVelocity?.();camera.movement?.resetRotationVelocity?.();camera.movement?.resetZoomVelocity?.();
   camera.lowerAlphaLimit=camera.upperAlphaLimit=null;camera.lowerBetaLimit=.03;camera.upperBetaLimit=Math.PI-.03;camera.lowerRadiusLimit=.25;camera.upperRadiusLimit=Math.max(200,savedCamera.upperRadiusLimit??0);
   token.attachCamera();
   fineZoom=attachToolFineZoom(canvas,camera,{isCurrent:()=>token.isCurrent()&&!paused});
  }
  disposeObserver=scene.onDisposeObservable.addOnce(()=>token.cancel('scene-dispose',{restore:false}));
  contextObserver=scene.getEngine?.().onContextLostObservable?.add(()=>{
    world.toolRecovery={scene,mapId,generation,recover:restoreState};token.cancel('context-loss',{restore:false});
  });
  return token;
 }catch(error){token.release('error');throw error;}
}
