import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,Vector3,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {CameraPitch,upwardFocusLift,setupCameraPitchControls,ARCHER_UPPER_BETA,WARRIOR_UPPER_BETA,UNRESTRICTED_UPPER_BETA} from '../src/camera-pitch.js';
import {PlaygroundInput} from '../src/input.js';
import {followTarget,playerChinTarget,combatFocus,CameraFollow} from '../src/camera-follow.js';
import {CharacterAnimator} from '../src/animation.js';
import {projectBossHealth} from '../src/boss-health-bar.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {carryPortalPose} from '../src/map-transition.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function fixture(t,{width=780,height=360,warrior=true,storage}={}){
 const engine=new NullEngine({renderWidth:width*2,renderHeight:height*2}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('pitch',Math.PI/2,1.35,8.5,new Vector3(0,1.45,0),scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=300;camera.lowerRadiusLimit=.8;camera.upperRadiusLimit=82;camera.inputs.clear();
 const pitch=new CameraPitch(camera,{warrior,storage}),input={camera,panOffset:{x:0,y:0,z:0}};
 t.after(()=>engine.dispose());return {engine,scene,camera,pitch,input};
}
const storage=()=>{const values=new Map();return {values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};

test('input and Babylon use the same pitch limits, including large drags and near-vertical release',t=>{
 const {camera,pitch,input}=fixture(t);assert.equal(pitch.settings.upwardLimited,true);assert.equal(camera.upperBetaLimit,WARRIOR_UPPER_BETA);assert.equal(camera.lowerBetaLimit,.25);
 const radius=camera.radius;PlaygroundInput.prototype.drag.call(input,0,-1e6,false);close(camera.beta,1.78);camera.getViewMatrix(true);close(camera.beta,1.78);
 pitch.update({upwardLimited:false});PlaygroundInput.prototype.drag.call(input,0,-1e6,false);close(camera.beta,Math.PI-.035);camera.getViewMatrix(true);close(camera.beta,UNRESTRICTED_UPPER_BETA);
 PlaygroundInput.prototype.drag.call(input,0,1e6,false);camera.getViewMatrix(true);close(camera.beta,.25);close(camera.radius,radius);
 camera.beta=2.8;pitch.update({upwardLimited:true});camera.getViewMatrix(true);close(camera.beta,1.78);
 pitch.update({upwardLimited:false});pitch.setWarrior(false);PlaygroundInput.prototype.drag.call(input,0,-1e6,false);camera.getViewMatrix(true);close(camera.beta,ARCHER_UPPER_BETA);
 pitch.setWarrior(true);assert.equal(camera.upperBetaLimit,UNRESTRICTED_UPPER_BETA,'archer does not erase the warrior preference');
});

test('normal pitch retains exact chin focus, follow smoothing, orbit and zoom bounds',t=>{
 const {scene,camera,pitch}=fixture(t),reference=new ArcRotateCamera('legacy',camera.alpha,camera.beta,camera.radius,camera.target.clone(),scene);
 const chin=new Vector3(3,7.45,-4);
 for(const beta of [.25,.88,1.1,1.48])for(const radius of [.8,2,8.5,17,82]){
  camera.beta=reference.beta=beta;camera.radius=reference.radius=radius;camera.setTarget(Vector3.Zero(),false,false,true);reference.setTarget(Vector3.Zero(),false,false,true);
  pitch.follow(chin,1/60);followTarget(reference,chin,1/60);assert.ok(camera.target.equalsWithEpsilon(reference.target,1e-10));close(upwardFocusLift(camera),0);close(camera.radius,radius);close(camera.alpha,Math.PI/2);
 }
 assert.equal(camera.lowerRadiusLimit,.8);assert.equal(camera.upperRadiusLimit,82);
});

test('upward pivot immediately prevents a below-chin eye after fast pitch/zoom changes; downward return stays smooth',t=>{
 const {camera,pitch,input}=fixture(t),chin=new Vector3(0,7.45,0);pitch.update({upwardLimited:false});
 for(const radius of [.8,8.5,17,82])for(const dt of [0,1/30,1/60]){
  camera.radius=radius;camera.beta=1.1;camera.setTarget(chin,false,false,true);PlaygroundInput.prototype.drag.call(input,0,-1e6,false);pitch.follow(chin,dt);camera.getViewMatrix(true);
  assert.ok(camera.position.y>=chin.y-.35-1e-5,`eye underground for radius ${radius}, dt ${dt}`);assert.ok(camera.position.asArray().every(Number.isFinite));close(camera.beta,UNRESTRICTED_UPPER_BETA);close(camera.radius,radius);
  const high=camera.target.y;camera.beta=1.1;pitch.follow(chin,1/60);assert.ok(camera.target.y<high&&camera.target.y>chin.y,'lowering view uses smooth follow');
 }
 camera.radius=8.5;camera.beta=2.3;pitch.follow(chin,0,{snap:true});const before=camera.target.y;camera.radius=82;pitch.follow(chin,0);camera.getViewMatrix(true);assert.ok(camera.target.y>before);assert.ok(camera.position.y>=chin.y-.35-1e-5);
});

test('real settings checkbox is on by default, persists, handles invalid storage, and updates a paused preview',t=>{
 const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),previous=globalThis.document;globalThis.document=dom.document;t.after(()=>{globalThis.document=previous;});setupSettingsPanel();
 const saved=storage(),{camera,pitch}=fixture(t,{storage:saved}),chin=new Vector3(0,1.45,0);let invalidations=0;
 const controls=setupCameraPitchControls(pitch,{doc:dom.document,onChange:()=>{pitch.follow(chin,0,{snap:true});invalidations++;}}),checkbox=dom.document.getElementById('camera-upward-limited');
 assert.equal(checkbox.checked,true);assert.equal(checkbox.closest('details').querySelector('summary').textContent,'화면 · 카메라');assert.match(checkbox.parentElement.textContent,/위쪽 시야 제한/);
 checkbox.checked=false;checkbox.dispatchEvent(new dom.window.Event('change'));camera.beta=2.65;pitch.follow(chin,0,{snap:true});camera.getViewMatrix(true);close(camera.beta,2.65);assert.equal(invalidations,1);
 const restored=new CameraPitch(camera,{warrior:true,storage:saved});assert.equal(restored.settings.upwardLimited,false);
 checkbox.checked=true;checkbox.dispatchEvent(new dom.window.Event('change'));camera.getViewMatrix(true);close(camera.beta,WARRIOR_UPPER_BETA);assert.ok(camera.position.y>=chin.y-.35-1e-5);assert.equal(invalidations,2);
 pitch.setWarrior(false);controls.sync();assert.equal(checkbox.disabled,true);close(camera.upperBetaLimit,ARCHER_UPPER_BETA);pitch.setWarrior(true);controls.sync();assert.equal(checkbox.disabled,false);
 for(const text of ['bad json','null','{}','{"upwardLimited":"false"}']){const other=new CameraPitch(camera,{warrior:true,storage:{getItem:()=>text}});assert.equal(other.settings.upwardLimited,true);}
 const blocked=new CameraPitch(camera,{warrior:true,storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});blocked.update({upwardLimited:false});assert.equal(blocked.settings.upwardLimited,false);assert.throws(()=>blocked.update({upwardLimited:0}),TypeError);
});

test('the actual main paused-render and settings callbacks correct the eye before the scene draw',t=>{
 const {scene,camera,pitch,input}=fixture(t),actor=new TransformNode('paused-player',scene),source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=source.indexOf('function syncCameraFocus('),renderStart=source.indexOf('function render(dt)',start),renderEnd=source.indexOf('  elapsed += dt;',renderStart);
 const focusFunction=source.slice(start,renderStart),pausedRender=source.slice(renderStart,renderEnd)+'}';let fogCalls=0,hudCalls=0,lootCalls=0;
 const follow=new CameraFollow();follow.update({followMotion:true});
 const main=new Function('actor','cameraPitch','cameraFollow','boss','elenaReview','input','world','isVillage','villageOverview','Vector3','mapDeparture','screenProjection','updateHealthBars','goldLootView','syncCaveFog',
  'let simulateFrame=false,playerHead=null;'+focusFunction+pausedRender+';return {render,syncCameraFocus};')(
  actor,pitch,follow,{nearestTarget:()=>null},null,input,{camera,scene},()=>false,false,Vector3,null,{beginFrame(){}},()=>hudCalls++,{project:()=>lootCalls++},()=>fogCalls++);
 pitch.update({upwardLimited:false});camera.beta=2.8;camera.radius=17;main.render(0);assert.ok(camera.position.y>=1.46-.35-1e-5);assert.equal(fogCalls,1);assert.equal(hudCalls,1);assert.equal(lootCalls,1);
 const settingStart=source.indexOf('const cameraSettingChanged=')+'const cameraSettingChanged='.length,settingEnd=source.indexOf('\n',settingStart),lambda=source.slice(settingStart,settingEnd).trim().replace(/;$/,'');let refresh=0,wake=0,invalidations=0;
 const changed=new Function('syncCameraFocus','frameDiagnostics','renderActivity','frameLoop','return '+lambda)(main.syncCameraFocus,{refresh:()=>refresh++},{wake:()=>wake++},{invalidate:()=>invalidations++});
 pitch.update({upwardLimited:true});changed();camera.getViewMatrix(true);close(camera.beta,1.78);close(camera.target.y,1.46+upwardFocusLift(camera));assert.deepEqual([refresh,wake,invalidations],[1,1,1]);assert.ok(actor.position.equals(Vector3.Zero()));
});

test('actual V6 chin and 5.7m boss HP project into S23/iPhone portrait and landscape at the expanded angle',async t=>{
 const sourceBase=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('warrior-v3-ios.json',sourceBase))),source=await readRuntimeGltf(new URL(config.model,sourceBase));
 const first=fixture(t),loader=new GLTFFileLoader();loader.skipMaterials=true;const gltf=structuredClone(source.gltf);
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const asset=await loader.loadAssetContainerAsync(first.scene,{json:gltf},'');asset.addAllToScene();const actor=new TransformNode('actual-warrior',first.scene);actor.scaling.setAll(config.scale);actor.position.set(29,6,-25.5);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=actor;for(const g of asset.animationGroups)g.stop();
 const animator=new CharacterAnimator(asset.animationGroups,config.animations);animator.transition('idle',{clipTime:0,loop:true,blendDuration:.001});animator.update(.2);const head=asset.transformNodes.find(n=>n.name==='mixamorig:Head'),chin=playerChinTarget(actor,head);assert.ok(chin.y>7.41&&chin.y<7.47);
 t.after(()=>{animator.dispose();loader.dispose();});const boss=new Vector3(29,6,-27.65),hp=boss.add(new Vector3(0,6,0)),results=[];
 for(const [name,width,height]of [['S23 landscape',780,360],['S23 portrait',360,780],['iPhone landscape',852,393],['iPhone portrait',393,852]]){
  const {scene,camera,pitch}=fixture(t,{width,height}),focus=combatFocus(chin,boss,8.5);
  camera.beta=ARCHER_UPPER_BETA;camera.setTarget(focus,false,false,true);camera.getViewMatrix(true);camera.getProjectionMatrix(true);scene.updateTransformMatrix(true);const old=projectBossHealth(scene,hp,width,height);assert.equal(old.visible,false,'reproduce the original close-range upper-edge clipping');
  camera.beta=WARRIOR_UPPER_BETA;pitch.follow(focus,1/60);camera.getViewMatrix(true);camera.getProjectionMatrix(true);scene.updateTransformMatrix(true);const fixed=projectBossHealth(scene,hp,width,height);
  assert.equal(fixed.visible,true,name);assert.ok(fixed.y>=8&&fixed.y<height-8,name+' HP label margin');assert.ok(camera.position.y>=chin.y-.35-1e-5);
  pitch.update({upwardLimited:false});camera.radius=.8;camera.beta=2.6;pitch.follow(combatFocus(chin,boss,.8),0,{snap:true});camera.getViewMatrix(true);camera.getProjectionMatrix(true);scene.updateTransformMatrix(true);assert.equal(projectBossHealth(scene,hp,width,height).visible,true,name+' close zoom with optional upper limit released');
  results.push({name,width,height,oldY:old.y,newY:fixed.y});
 }
 t.diagnostic(JSON.stringify({bossHeight:5.7,hpHeight:6,chinHeight:chin.y-6,viewports:results}));
});

test('cave/forest portal carry retains expanded angle, zoom, pan and stored preference',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true}),actor=new TransformNode('traveller',world.scene),saved=storage(),pitch=new CameraPitch(world.camera,{warrior:true,storage:saved}),pan={x:1,y:.2,z:-2};t.after(()=>engine.dispose());
 assert.equal(world.camera.upperBetaLimit,WARRIOR_UPPER_BETA);pitch.update({upwardLimited:false});world.camera.beta=2.4;world.camera.radius=13;actor.rotation.y=.6;
 const original=Math.atan2(Math.sin(world.camera.alpha+actor.rotation.y),Math.cos(world.camera.alpha+actor.rotation.y));
 for(const destination of ['warrior-v4','warrior-v5','warrior-v4','warrior-v5']){
  replaceWorldMap(world,destination);carryPortalPose(actor,world.camera,pan);actor.position.set(29,6,-25.5);pitch.follow(playerChinTarget(actor,null).add(new Vector3(pan.x,pan.y,pan.z)),0,{snap:true});world.camera.getViewMatrix(true);
  close(world.camera.beta,2.4);close(world.camera.radius,13);close(Math.atan2(Math.sin(world.camera.alpha+actor.rotation.y),Math.cos(world.camera.alpha+actor.rotation.y)),original);assert.equal(pitch.settings.upwardLimited,false);assert.equal(world.camera.upperBetaLimit,UNRESTRICTED_UPPER_BETA);
 }
 assert.deepEqual(pan,{x:1,y:.2,z:-2});assert.equal(new CameraPitch(world.camera,{warrior:true,storage:saved}).settings.upwardLimited,false);
});
