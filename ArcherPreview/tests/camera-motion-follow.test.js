import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {CameraFollow,STABLE_PLAYER_FOCUS_HEIGHT,setupCameraFollowControls,playerChinTarget,combatFocus} from '../src/camera-follow.js';
import {CameraPitch} from '../src/camera-pitch.js';
import {CameraZoom} from '../src/camera-zoom.js';
import {CaveCameraGuard,caveCameraBlocked} from '../src/witch-cave-camera.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {carryPortalPose} from '../src/map-transition.js';
import {CharacterAnimator} from '../src/animation.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {projectBossHealth} from '../src/boss-health-bar.js';

const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
const mainFocus=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').split('function syncCameraFocus(')[1].split('function render(dt)')[0];
function bindMainFocus({actor,head=null,follow,pitch,world,input={panOffset:{x:0,y:0,z:0}},boss={nearestTarget:()=>null}}){
 return new Function('actor','playerHead','cameraFollow','cameraPitch','world','input','boss','elenaReview','isVillage','villageOverview','Vector3','return function syncCameraFocus('+mainFocus)(actor,head,follow,pitch,world,input,boss,null,()=>false,false,Vector3);
}

test('actual V6 running, jumping judgment and rolling poses keep a stable center while optional mode follows the real chin',async t=>{
 const engine=new NullEngine({renderWidth:1560,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 t.after(()=>{scene.dispose();engine.dispose();});
 const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('warrior-v3-ios.json',base))),source=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(source.gltf);
 for(const k of ['extensionsUsed','extensionsRequired'])gltf[k]=(gltf[k]??[]).filter(n=>n!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();for(const g of asset.animationGroups)g.stop();
 t.after(()=>loader.dispose());const actor=new TransformNode('stable-player',scene);actor.scaling.setAll(config.scale);actor.position.set(29,6,-25.5);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=actor;
 const nodes=orderPoseNodes([...asset.meshes,...asset.transformNodes]),head=asset.transformNodes.find(n=>n.name==='mixamorig:Head'),animator=new CharacterAnimator(asset.animationGroups,config.animations);assert.ok(head);t.after(()=>animator.dispose());
 const camera=new ArcRotateCamera('actual-game-camera',1.1,1.18,8.5,Vector3.Zero(),scene),follow=new CameraFollow(),pitch=new CameraPitch(camera,{warrior:true}),world={scene,camera};
 camera.inputs.clear();const sync=bindMainFocus({actor,head,follow,pitch,world,boss:{nearestTarget:()=>({actor:{position:new Vector3(35,6,-20)}})}});
 const heights=[];let poses=0;
 for(const state of ['run','judgment','dodge'])for(let frame=0;frame<=40;frame++){
  animator.transition(state,{clipTime:animator.durations[state]*frame/40,actionId:state,blendDuration:.001});animator.update(1/30);scene._animate(0);refreshPoseMatrices(nodes);
  follow.update({followMotion:false});sync(0,{snap:true});camera.getViewMatrix(true);camera.getProjectionMatrix(true);scene.updateTransformMatrix(true);
  near(camera.target.x,actor.position.x);near(camera.target.z,actor.position.z);near(camera.target.y,actor.position.y+STABLE_PLAYER_FOCUS_HEIGHT);
  const projected=projectBossHealth(scene,actor.position.add(new Vector3(0,STABLE_PLAYER_FOCUS_HEIGHT,0)),780,360);near(projected.x,390,1e-3);near(projected.y,180,1e-3);assert.equal(projected.visible,true);
  const chin=playerChinTarget(actor,head);heights.push(chin.y);follow.update({followMotion:true});
  const focus=follow.focus(actor,head);assert.ok(focus.equalsWithEpsilon(chin,1e-7));poses++;
 }
 assert.ok(Math.max(...heights)-Math.min(...heights)>.5,'actual clips reproduce head bob, airborne judgment and low roll');
 actor.position.set(33,8,-22);follow.update({followMotion:false});sync(0,{snap:true});near(camera.target.y,9.05);near(camera.target.x,33);near(camera.target.z,-22);
 follow.update({followMotion:true});const enemy=new Vector3(36,8,-20);assert.ok(follow.focus(actor,head,enemy,8.5).equalsWithEpsilon(combatFocus(playerChinTarget(actor,head),enemy,8.5),1e-7));
 t.diagnostic(JSON.stringify({actualClipPoses:poses,stableTargetHeight:STABLE_PLAYER_FOCUS_HEIGHT,animatedHeadSpan:Math.max(...heights)-Math.min(...heights)}));
});

test('real camera option defaults unchecked, persists independently and updates a paused camera immediately',t=>{
 const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),previous=globalThis.document;globalThis.document=dom.document;t.after(()=>{globalThis.document=previous;});setupSettingsPanel();
 const engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('settings-player',scene),camera=new ArcRotateCamera('settings-camera',.8,1.18,8.5,Vector3.Zero(),scene),pitch=new CameraPitch(camera,{warrior:true}),saved=storage(),follow=new CameraFollow({storage:saved});t.after(()=>{scene.dispose();engine.dispose();});
 let invalidations=0;const sync=bindMainFocus({actor,follow,pitch,world:{scene,camera}}),controls=setupCameraFollowControls(follow,{doc:dom.document,onChange:()=>{sync(0,{snap:true});invalidations++;}}),input=dom.document.getElementById('camera-follow-motion');
 assert.equal(input.checked,false);assert.equal(input.closest('details').querySelector('summary').textContent,'화면 · 카메라');assert.match(input.parentElement.textContent,/캐릭터 모션 따라가기/);
 sync(0,{snap:true});near(camera.target.y,1.05);const radius=camera.radius,alpha=camera.alpha,beta=camera.beta;
 input.checked=true;input.dispatchEvent(new dom.window.Event('change'));near(camera.target.y,1.46);assert.equal(new CameraFollow({storage:saved}).settings.followMotion,true);
 input.checked=false;input.dispatchEvent(new dom.window.Event('change'));near(camera.target.y,1.05);assert.equal(new CameraFollow({storage:saved}).settings.followMotion,false);assert.equal(invalidations,2);near(camera.radius,radius);near(camera.alpha,alpha);near(camera.beta,beta);controls.sync();
 for(const value of ['bad','null','{}','{"followMotion":"true"}'])assert.equal(new CameraFollow({storage:{getItem:()=>value}}).settings.followMotion,false);
 const denied=new CameraFollow({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});denied.update({followMotion:true});assert.equal(denied.settings.followMotion,true);assert.throws(()=>denied.update({followMotion:1}),TypeError);
});

test('village, forest and cave round trips preserve the chosen mode, orbit, magnification and ground-relative focus',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true}),actor=new TransformNode('traveller',world.scene),saved=storage(),follow=new CameraFollow({storage:saved}),pitch=new CameraPitch(world.camera,{warrior:true}),zoom=new CameraZoom(world.camera),pan={x:0,y:0,z:0};t.after(()=>engine.dispose());
 const camera=world.camera;camera.radius=13;camera.beta=1.35;actor.rotation.y=.8;const originalRear=camera.alpha+actor.rotation.y;
 for(const mode of [false,true]){follow.update({followMotion:mode});for(const map of ['warrior-v4','warrior-v5','warrior-v3','warrior-v5','warrior-v4','warrior-v3']){
  replaceWorldMap(world,map);carryPortalPose(actor,camera,pan);actor.position.set(29,map==='warrior-v5'?6:2,-25.5);pitch.follow(follow.focus(actor,null),0,{snap:true});camera.getViewMatrix(true);
  assert.equal(world.camera,camera);assert.equal(follow.settings.followMotion,mode);near(camera.radius,13);near(camera.beta,1.35);near(zoom.snapshot().factor,17/13);near(camera.target.y,actor.position.y+(mode?1.46:1.05));near(Math.sin(camera.alpha+actor.rotation.y),Math.sin(originalRear));
  assert.equal(new CameraFollow({storage:saved}).settings.followMotion,mode);
 }}
});

test('cave guard preserves stable character-center height, including low motion poses and unrestricted upward pitch',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const terrain=createWitchCaveTerrain(),actor=new TransformNode('cave-player',scene),camera=new ArcRotateCamera('cave-camera',1.3,1.18,24,Vector3.Zero(),scene),follow=new CameraFollow(),pitch=new CameraPitch(camera,{warrior:true}),world={scene,camera,terrain,cave:true,caveFog:{playerRoot:actor}},guard=new CaveCameraGuard(world);t.after(()=>{guard.dispose();scene.dispose();engine.dispose();});camera.inputs.clear();
 const sync=bindMainFocus({actor,follow,pitch,world:{...world,caveCamera:guard}});
 actor.position.set(29,terrain.heightAt(29,-25.5),-25.5);sync(0,{snap:true});guard.beginFrame();near(camera.target.y,actor.position.y+1.05);assert.equal(caveCameraBlocked(terrain,...camera.globalPosition.asArray()),false);guard.endFrame();near(camera.radius,24);
 pitch.update({upwardLimited:false});for(const beta of [.25,1.18,1.78,Math.PI-.035])for(let turn=0;turn<12;turn++){
  camera.beta=beta;camera.alpha=turn*Math.PI/6;sync(1/30,{snap:true});guard.beginFrame();assert.equal(caveCameraBlocked(terrain,...camera.globalPosition.asArray()),false,JSON.stringify({beta,turn,eye:camera.globalPosition.asArray()}));guard.endFrame();near(camera.radius,24);
 }
 follow.update({followMotion:true});sync(0,{snap:true});guard.beginFrame();assert.ok(guard.base.y>=actor.position.y+1.55);guard.endFrame();
});
