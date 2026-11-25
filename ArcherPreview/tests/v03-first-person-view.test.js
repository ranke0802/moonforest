import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ArcRotateCamera,DirectionalLight,NullEngine,Scene,ShadowGenerator,TransformNode,Vector3,Viewport} from '@babylonjs/core';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readMapContainer} from '../src/map-container.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {CharacterAnimator} from '../src/animation.js';
import {castsPlayerShadow} from '../src/v03/actor-shadow-casters.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {PlaygroundInput} from '../src/input.js';
import {MapResumeStore,readMapResume} from '../src/map-resume.js';
import {createFirstPersonView,FIRST_PERSON,FIRST_PERSON_STORAGE_KEY} from '../src/v03/first-person-view.js';
import {zoomCamera} from '../src/camera-zoom.js';

// 2026-11-25 (user, #233 남은 일): zooming past the closest view looks through the
// warrior's eyes; zooming out comes back to the saved orbit.
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
function rig({allowed=true,storage=store()}={}){
 const camera={alpha:-Math.PI/2,beta:1.2,radius:1.7,lowerRadiusLimit:1.7,upperRadiusLimit:8.5,lowerBetaLimit:.25,upperBetaLimit:1.78};
 let applied=0;const zoom={apply(){applied++;camera.lowerRadiusLimit=1.7;camera.upperRadiusLimit=8.5;zoomCamera(camera,1);}};
 const head={scaling:new Vector3(1,1,1),absolutePosition:new Vector3(2,1.62,3),disposed:false,computed:0,computeWorldMatrix(){this.computed++;},isDisposed(){return this.disposed;}};
 const changes=[];const state={allowed};
 const view=createFirstPersonView({camera,zoom,storage,getHead:()=>head,allowed:()=>state.allowed,onChange:value=>changes.push(value)});
 return {camera,zoom,head,changes,state,view,storage,get applied(){return applied;}};
}

test('extra zoom-in at the closest view enters first person; zoom-out returns to the closest third person',()=>{
 const r=rig();
 // Not at the closest view yet: normal zoom, nothing counted.
 r.camera.radius=2.4;assert.equal(r.view.zoom(.78),false);assert.equal(r.view.active,false);
 r.camera.radius=1.7;
 assert.equal(r.view.zoom(1.1),false,'zooming out is ordinary');
 assert.equal(r.view.zoom(.85),false);assert.equal(r.view.zoom(.85),false);assert.equal(r.view.active,false,'two button taps are not enough');
 assert.equal(r.view.zoom(.85),true);assert.equal(r.view.active,true,'the third tap enters');
 assert.equal(r.camera.radius,FIRST_PERSON.radius);assert.ok(r.camera.lowerRadiusLimit<FIRST_PERSON.radius);
 assert.equal(r.head.scaling.x,1);assert.deepEqual(r.changes,[true]);
 assert.equal(r.view.cameraForSave.radius,1.7);assert.equal(r.view.cameraForSave.beta,1.2);
 const world={mapId:'great-plains',terrain:{heightAt:()=>0},navigation:{free:()=>true}};
 const actor={position:new Vector3(5,0,7),rotation:{y:.5}};
 assert.ok(new MapResumeStore(r.storage).save({character:'warrior-plains',world,actor,camera:r.view.cameraForSave},0));
 assert.equal(readMapResume(r.storage,'warrior-plains',world).camera.radius,1.7);
 // Inside: closer is used up, further returns.
 assert.equal(r.view.zoom(.5),true);assert.equal(r.view.active,true);
 assert.equal(r.view.zoom(1.18),true);assert.equal(r.view.active,false);
 assert.equal(r.camera.radius,1.7);assert.equal(r.camera.lowerRadiusLimit,1.7);assert.equal(r.applied,1,'the zoom settings re-apply the limits');
 assert.deepEqual([r.head.scaling.x,r.head.scaling.y,r.head.scaling.z],[1,1,1]);assert.deepEqual(r.changes,[true,false]);
 // Two wheel notches (exp(-.25)) also enter; the count restarts after leaving.
 assert.equal(r.view.zoom(Math.exp(-.25)),false);assert.equal(r.view.zoom(Math.exp(-.25)),true);
});

test('first person waits for free play, follows the head with a steady eye and leaves when play is framed elsewhere',()=>{
 const r=rig({allowed:false});
 for(let i=0;i<5;i++)assert.equal(r.view.zoom(.7),false);assert.equal(r.view.active,false,'not during a cutscene, dialogue, ride, menu or cave');
 r.state.allowed=true;r.view.zoom(.7);assert.equal(r.view.active,true);
 const eye=r.view.update(1/60);
 assert.ok(eye);assert.equal(r.head.computed,1);
 // alpha -PI/2: the camera looks along +z, so the eye sits in front of the head joint.
 assert.ok(Math.abs(eye.x-2)<1e-9);assert.ok(Math.abs(eye.z-(3+FIRST_PERSON.eyeForward))<1e-9);assert.ok(Math.abs(eye.y-(1.62+FIRST_PERSON.eyeUp))<1e-9);
 // A run bob of 6 cm moves the eye only part of the way in one frame.
 r.head.absolutePosition.y+=.06;const y=r.view.update(1/60).y;
 assert.ok(y>1.62+FIRST_PERSON.eyeUp&&y<1.68+FIRST_PERSON.eyeUp,'smoothed');
 // The native head pose is also used by the unchanged shadow caster.
 r.head.scaling.setAll(.97);r.view.update(1/60);assert.equal(r.head.scaling.x,.97);
 // Pitch range while inside, restored to third person on leaving.
 r.camera.beta=.2;r.view.limitPitch();assert.equal(r.camera.beta,FIRST_PERSON.lowerBeta);
 r.camera.beta=3;r.view.limitPitch();assert.equal(r.camera.beta,FIRST_PERSON.upperBeta);
 r.state.allowed=false;assert.equal(r.view.update(1/60),null);assert.equal(r.view.active,false);
 assert.equal(r.head.scaling.x,.97);assert.equal(r.camera.radius,1.7);
 assert.equal(r.camera.lowerBetaLimit,.25);assert.equal(r.camera.upperBetaLimit,1.78);assert.equal(r.camera.beta,1.2);
 // The zoom settings changing the limits underneath also returns to third person.
 r.state.allowed=true;r.view.zoom(.7);r.view.zoom(.7);assert.equal(r.view.active,true);
 r.zoom.apply();assert.equal(r.view.update(1/60),null);assert.equal(r.view.active,false);
 // A disposed head (map change) gives up quietly.
 r.view.zoom(.7);r.view.zoom(.7);r.head.disposed=true;assert.equal(r.view.update(1/60),null);assert.equal(r.view.active,false);
});

test('the body faces where the eyes look; the switch is remembered; dispose restores the head',()=>{
 const r=rig();
 for(const alpha of [-Math.PI/2,0,1.1,2.6]){
  r.camera.alpha=alpha;const h=r.view.heading();
  assert.ok(Math.abs(Math.sin(h)-(-Math.cos(alpha)))<1e-9&&Math.abs(Math.cos(h)-(-Math.sin(alpha)))<1e-9,'forward '+alpha);
 }
 r.view.setEnabled(false);assert.equal(JSON.parse(r.storage.getItem(FIRST_PERSON_STORAGE_KEY)).enabled,false);
 for(let i=0;i<4;i++)assert.equal(r.view.zoom(.7),false);assert.equal(r.view.active,false);
 const again=rig({storage:r.storage});assert.equal(again.view.enabled,false,'read back');
 again.view.setEnabled(true);again.view.zoom(.7);again.view.zoom(.7);assert.equal(again.view.active,true);
 again.view.dispose();assert.equal(again.view.active,false);assert.equal(again.head.scaling.x,1);assert.equal(again.camera.radius,1.7);
 assert.equal(again.view.zoom(.7),false);
});

test('the game input hands a zoom step to first person first',async()=>{
 const camera={radius:3,lowerRadiusLimit:1.7,upperRadiusLimit:8};
 const used=[];const self={suspended:false,camera,callbacks:{canTurn:()=>true,zoomStep:factor=>{used.push(factor);return factor<.9;}}};
 PlaygroundInput.prototype.zoom.call(self,.8);assert.equal(camera.radius,3,'consumed');
 PlaygroundInput.prototype.zoom.call(self,.95);assert.ok(Math.abs(camera.radius-2.85)<1e-9,'passed on');
 delete self.callbacks.zoomStep;PlaygroundInput.prototype.zoom.call(self,1.2);assert.ok(Math.abs(camera.radius-2.85*1.2)<1e-9,'0.2 (no hook) unchanged');
 assert.deepEqual(used,[.8,.95]);
});

test('two touch pointers can enter and leave with a pinch, tolerating a small reverse movement',()=>{
 const r=rig(),input=Object.assign(Object.create(PlaygroundInput.prototype),{
  camera:r.camera,callbacks:{zoomStep:factor=>r.view.zoom(factor)},cameraMode:'pan',
  cameraPointers:new Map([[1,{type:'touch',x:100,y:40}],[2,{type:'touch',x:200,y:40}]]),
 });
 input.gesture=input.measureGesture();
 const move=x=>input.pointerMove({pointerId:2,pointerType:'touch',clientX:x,clientY:40});
 move(218);move(244);assert.ok(r.view.active);
 move(243);assert.ok(r.view.active,'single pixel of pinch jitter');
 move(224);assert.equal(r.view.active,false);assert.equal(r.camera.radius,1.7);
});

test('the shipped shield and sword render on the left and right while the native rig still casts its complete shadow',async t=>{
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);
 t.after(()=>{scene.dispose();engine.dispose();});
 scene.useRightHandedSystem=true;engine.getCaps().maxVertexUniformVectors=1024;
 const camera=scene.activeCamera=new ArcRotateCamera('eyes',-Math.PI/2,Math.PI/2,1.7,Vector3.Zero(),scene);
 camera.lowerRadiusLimit=1.7;camera.minZ=.05;
 const base=new URL('../public/assets/',import.meta.url),cfg=JSON.parse(readFileSync(new URL('warrior-v3-mobile4k.json',base)));
 const {gltf,files}=await readRuntimeGltf(new URL(cfg.model,base));
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
 delete gltf.extensionsRequired;delete gltf.extensionsUsed;
 const asset=await readMapContainer(scene,gltf,'',{skipMaterials:true});asset.addAllToScene();
 const actor=new TransformNode('player-world-transform',scene);
 for(const node of [...asset.meshes,...asset.transformNodes])if(!node.parent)node.parent=actor;
 configurePlayerSize(actor,cfg,{warrior:true});
 for(const group of asset.animationGroups)group.stop();
 const animator=new CharacterAnimator(asset.animationGroups,cfg.animations);
 attachCharacterOutlines(asset,'warrior');
 const head=asset.transformNodes.find(n=>n.name==='mixamorig:Head'),scale=head.scaling.clone();
 const shadows=new ShadowGenerator(64,new DirectionalLight('sun',new Vector3(0,-1,0),scene));
 const casters=asset.meshes.filter(castsPlayerShadow);for(const m of casters)shadows.addShadowCaster(m,false);
 const shadowDraws=new Set(),map=shadows.getShadowMap();
 map.getCustomRenderList=()=>casters;
 map.customRenderFunction=(opaque,alpha,transparent,depth)=>{
  for(const list of [opaque,alpha,transparent,depth])for(let i=0;i<list.length;i++)shadowDraws.add(list.data[i].getMesh());
 };
 const view=createFirstPersonView({camera,getHead:()=>head,getMeshes:()=>asset.meshes});
 const originalMasks=asset.meshes.map(mesh=>mesh.layerMask),count=scene.meshes.length;
 for(const [w,h] of [[1280,720],[720,1280]]){
  // NullEngine's dimensions come from its options rather than a canvas.
  engine._options.renderWidth=w;engine._options.renderHeight=h;
  const viewport=new Viewport(0,0,w,h);
  assert.ok(view.zoom(.7));assert.equal(scene.meshes.length,count+4);
  for(const state of ['idle','run','slash','attack','shieldPush']){
   animator.transition(state,{clipTime:.32,actionId:state,blendDuration:0});animator.update(.016);scene.render();
   const eye=view.update(1);camera.setTarget(eye,false,false,true);
   camera.getViewMatrix(true);camera.getProjectionMatrix(true);scene.updateTransformMatrix(true);camera.computeWorldMatrix(true);
   for(const name of ['Bunnyguard_Shield','Golden_Oathblade']){
    const source=scene.getMeshByName(name),display=scene.getMeshByName('first-person '+name);
    assert.equal(source.layerMask,0);assert.equal(display.geometry,source.geometry);assert.equal(display.material,source.material);
    assert.ok(source.parent.name.endsWith(name==='Bunnyguard_Shield'?'LeftHand':'RightHand'));
    const positions=display.getVerticesData('position'),matrix=display.computeWorldMatrix(true);
    let onSide=0;
    for(let i=0;i<positions.length;i+=3*23){
     const p=Vector3.Project(Vector3.FromArray(positions,i),matrix,scene.getTransformMatrix(),viewport);
     if(p.z>0&&p.z<1&&p.y>=0&&p.y<h&&(name==='Bunnyguard_Shield'?p.x>=0&&p.x<w/2:p.x>w/2&&p.x<w))onSide++;
    }
    assert.ok(onSide>25,name+' at '+w+'x'+h+' during '+state);
   }
  }
  shadowDraws.clear();map.render(false,false);
  for(const mesh of casters)assert.ok(shadowDraws.has(mesh),mesh.name+' in the shadow pass');
  assert.equal(shadowDraws.size,casters.length);assert.ok(head.scaling.equalsWithEpsilon(scale));
  view.exit();assert.equal(scene.meshes.length,count);
  assert.deepEqual(asset.meshes.map(mesh=>mesh.layerMask),originalMasks);
 }
});
