import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,FreeCamera} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {CAVE_ENTRY,caveObstacles} from '../src/witch-cave-layout.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {refreshPoseMatrices} from '../src/pose-matrices.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const base=new URL('../public/assets/',import.meta.url),packed=new Map();
const poseComparisons=[];
test.after(()=>{if(process.env.ELENA_HIDDEN_REPORT==='1')writeFileSync('reports/cave-entry-thermal-2026-11-01/pose-equivalence.json',JSON.stringify({scope:'NullEngine actual packed phase-one model vs unchanged weighted AnimationGroup controller. Quaternion antipodes represent the same orientation.',comparisons:poseComparisons},null,2)+'\n');});
async function fixture(t,{phase=1,control=false,position={x:35,z:9}}={}){
  setWorldCharacter('warrior-v5');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  engine.createRawTexture2DArray=(data,w,h,d,format,mips,invert,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invert,sampling,compression,type);texture.depth=d;texture.is2DArray=true;return texture;};
  caveFogFallback(scene).getInternalTexture().isReady=true;
  const name=phase===1?'elena':'mourning-elena',config=JSON.parse(readFileSync(new URL(name+'.json',base)));
  if(!packed.has(config.model))packed.set(config.model,readRuntimeGltf(new URL(config.model,base)));
  const source=await packed.get(config.model),gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const group of container.animationGroups)group.stop();
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('hidden-resident-test',scene);
  const library=new BossModelLibrary(scene,name);library.config=config;library.container=container;library.load=async()=>{};
  const shadow={renderList:[]},camera=new FreeCamera('hidden-camera',new Vector3(position.x,6,position.z+6),scene);scene.activeCamera=camera;
  const world={scene,cave:true,camera,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(mesh){if(!shadow.renderList.includes(mesh))shadow.renderList.push(mesh);},removeShadowCaster(mesh){const i=shadow.renderList.indexOf(mesh);if(i>=0)shadow.renderList.splice(i,1);},getShadowMap(){return shadow;}}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true,{[phase===1?'elenaModels':'mourningModels']:library}),player=new TransformNode('hidden-player',scene);player.position.set(position.x,0,position.z);world.terrain.place(player.position);
  const fog=new CaveFogRuntime(world);fog.texture.getInternalTexture().isReady=true;
  await battle.activateResident(player,{reset:true,phase});const enemy=battle.encounters[0];
  if(control)enemy.canDeferResidentPose=()=>false;
  let clock=0,action={state:'idle'},sample=null,paused=false,lastDraw=null;
  scene.onAfterAnimationsObservable.add(()=>{if(!paused)battle.poseAndContacts(player,action,sample,null);});
  scene.onBeforeRenderObservable.add(()=>{if(enemy.fogVisible!==false&&enemy.renderVisible!==false)lastDraw={shadowCasters:shadow.renderList.filter(mesh=>enemy.asset.meshes.includes(mesh)).length,matrices:enemy.poseNodes.map(node=>Array.from(node.getWorldMatrix().m))};});
  const frame=(dt=1/30)=>{clock+=dt;battle.update(dt,player);enemy.updateRenderRange(camera.position);fog.update(player,clock,{encounters:battle.encounters});scene.render();};
  t.after(()=>{battle.hide();fog.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');});
  frame();frame();
  return {engine,scene,world,battle,player,enemy,fog,shadow,camera,frame,get clock(){return clock;},get lastDraw(){return lastDraw;},setPaused(v){paused=v;},setAction(a,s=null){action=a;sample=s;},refreshFog(){fog.update(player,clock,{force:true,encounters:battle.encounters});}};
}
const near=(a,b,label,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} vs ${b}`);
function compare(a,b,label){
  let maxLocalError=0,maxWorldError=0;
  near(a.brain.time,b.brain.time,label+' brain clock');
  const ea=a.animator.active.get(a.brain.idle),eb=b.animator.active.get(b.brain.idle);
  assert.equal(ea.loop,eb.loop,label+' loop mode');assert.equal(ea.loop,true,label+' looping idle');
  near(ea.clipTime,eb.clipTime,label+' clip clock');
  near(a.groundHeight,b.groundHeight,label+' ground level');
  assert.equal(a.poseNodes.length,b.poseNodes.length);
  for(let i=0;i<a.poseNodes.length;i++){
    const na=a.poseNodes[i],nb=b.poseNodes[i];assert.equal(na.name,nb.name);
    for(const property of ['position','scaling','rotationQuaternion'])if(na[property]&&nb[property]){
      const aa=na[property].asArray(),bb=nb[property].asArray(),sign=property==='rotationQuaternion'&&aa.reduce((sum,v,j)=>sum+v*bb[j],0)<0?-1:1;
      for(let j=0;j<aa.length;j++){maxLocalError=Math.max(maxLocalError,Math.abs(aa[j]-bb[j]*sign));near(aa[j],bb[j]*sign,`${label} ${na.name}.${property}[${j}]`,2e-5);}
    }
    const ma=na.getWorldMatrix().m,mb=nb.getWorldMatrix().m;
    for(let j=0;j<16;j++){maxWorldError=Math.max(maxWorldError,Math.abs(ma[j]-mb[j]));near(ma[j],mb[j],`${label} ${na.name}[${j}]`,2e-5);}
  }
  poseComparisons.push({label,bones:a.poseNodes.length,maxLocalError,maxWorldError,clipTimeError:Math.abs(ea.clipTime-eb.clipTime),clockError:Math.abs(a.brain.time-b.brain.time)});
}
const snapshot=f=>({meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,nodes:f.scene.transformNodes.length,skeletons:f.scene.skeletons.length,materials:f.scene.materials.length,textures:f.scene.textures.length,groups:f.scene.animationGroups.length,managers:f.scene.morphTargetManagers.length});

test('hidden settled saint skips sampling/contact rig work and wakes to the original weighted pose at 30/60/slow frames',async t=>{
  for(const fps of [30,60,12]){
    const a=await fixture(t),b=await fixture(t,{control:true});
    let samples=0,aligns=0;const group=a.enemy.animator.active.get(a.enemy.brain.idle).group,go=group.goToFrame.bind(group),align=a.enemy.alignPose.bind(a.enemy);
    group.goToFrame=(...args)=>{samples++;return go(...args);};a.enemy.alignPose=(...args)=>{aligns++;return align(...args);};
    const resources=snapshot(a);
    for(let i=0;i<fps*6;i++){a.frame(1/fps);b.frame(1/fps);}
    assert.equal(a.enemy.residentPoseDeferred,true);assert.equal(samples,0);assert.equal(aligns,0);assert.equal(a.enemy.fogVisible,false);assert.equal(a.enemy.renderVisible,true);
    near(a.enemy.brain.time,b.enemy.brain.time,'hidden clock');assert.deepEqual(snapshot(a),resources);
    // FoW visibility opens before scene.animate; the first shadow/body submission
    // must already have the current idle, without an extra settling frame.
    for(const f of [a,b]){f.player.position.set(29,6,-14.5);f.camera.position.set(29,10,-8.5);f.refreshFog();}
    assert.equal(a.enemy.residentPoseDeferred,false);compare(a.enemy,b.enemy,'first prepare '+fps);
    a.frame(1/fps);b.frame(1/fps);compare(a.enemy,b.enemy,'first visible draw '+fps);assert.equal(a.enemy.fogVisible,true);
    assert.ok(a.lastDraw.shadowCasters>0);assert.ok(b.lastDraw.shadowCasters>0);
    // A normal baseline's onBeforeRender cache precedes active-mesh matrix
    // evaluation. The deferred actor must already equal the baseline's final,
    // fully evaluated pose before either body or shadow submission begins.
    for(let i=0;i<a.lastDraw.matrices.length;i++)for(let j=0;j<16;j++)near(a.lastDraw.matrices[i][j],b.enemy.poseNodes[i].getWorldMatrix().m[j],`shadow/body first draw ${fps} bone${i}[${j}]`,2e-5);
    assert.ok(a.shadow.renderList.some(mesh=>a.enemy.asset.meshes.includes(mesh)));
    a.battle.hide();b.battle.hide();
  }
});

test('distance-hidden saint restores during the first paused render without waiting for simulation',async t=>{
  const a=await fixture(t,{position:CAVE_ENTRY}),b=await fixture(t,{position:CAVE_ENTRY,control:true});
  for(let i=0;i<90;i++){a.frame();b.frame();}
  assert.equal(a.enemy.residentPoseDeferred,true);assert.equal(a.enemy.renderVisible,false);
  for(const f of [a,b]){
    f.player.position.set(29,6,-14.5);f.camera.position.set(29,10,-8.5);f.enemy.updateRenderRange(f.camera.position);
    f.fog.update(f.player,f.clock,{force:true,encounters:f.battle.encounters});
  }
  assert.equal(a.enemy.residentPoseDeferred,false);
  // Use the fully forced hierarchy as a pose oracle: no render ID or simulation
  // time advances during this paused reveal. Babylon's ordinary cached matrices
  // may otherwise retain the pre-alignment parent until its next render ID.
  for(const f of [a,b])f.battle.poseAndContacts(f.player,{state:'idle'},null,null);
  b.enemy.actor.markAsDirty();b.enemy.actor.computeWorldMatrix();b.enemy.carrier.markAsDirty();b.enemy.carrier.computeWorldMatrix();refreshPoseMatrices(b.enemy.poseNodes);
  compare(a.enemy,b.enemy,'distance first frame');
});

test('FoW beforeRender wakes a hidden idle before a paused shadow/body pass',async t=>{
  const a=await fixture(t),b=await fixture(t,{control:true});for(let i=0;i<90;i++){a.frame();b.frame();}
  assert.equal(a.enemy.residentPoseDeferred,true);const clock=a.enemy.brain.time;
  // The paused main loop suppresses its contact hook. Only the render-time FoW
  // hook can commit the deferred pose in this case.
  for(const f of [a,b]){f.player.position.set(29,6,-14.5);f.camera.position.set(29,10,-8.5);f.setPaused(true);}
  a.scene.render();
  assert.equal(a.enemy.residentPoseDeferred,false);near(a.enemy.brain.time,clock,'paused clock');assert.ok(a.lastDraw.shadowCasters>0);
  b.enemy.alignPose();b.enemy.actor.markAsDirty();b.enemy.actor.computeWorldMatrix();b.enemy.carrier.markAsDirty();b.enemy.carrier.computeWorldMatrix();refreshPoseMatrices(b.enemy.poseNodes);
  compare(a.enemy,b.enemy,'paused FoW first shadow/body pass');
});

test('same-frame approach, attack, hit, return-home, review and death never use deferred bones',async t=>{
  const f=await fixture(t);for(let i=0;i<60;i++)f.frame();assert.equal(f.enemy.residentPoseDeferred,true);
  let contacts=0;const hurt=f.enemy.hurtCapsules.bind(f.enemy);f.enemy.hurtCapsules=()=>{contacts++;return hurt();};
  // A legitimate contact sample must run the normal source contract immediately,
  // even if the previous rendered frame still marks this resident behind a wall.
  f.player.position.copyFrom(f.enemy.actor.position).addInPlaceFromFloats(0,0,2);
  f.battle.poseAndContacts(f.player,{state:'attack'},{actionId:1,contacts:[]},null);
  assert.equal(f.enemy.residentPoseDeferred,false);assert.equal(contacts,1);
  f.player.position.set(35,3,9);
  f.frame();assert.equal(f.enemy.residentPoseDeferred,true);
  f.enemy.brain.hit({damage:1});f.frame();assert.equal(f.enemy.residentPoseDeferred,false);assert.ok(f.enemy.brain.flash>0);
  for(let i=0;i<30;i++)f.frame();assert.equal(f.enemy.residentPoseDeferred,true);
  f.enemy.actor.position.x+=1;f.frame();assert.equal(f.enemy.residentPoseDeferred,false);assert.equal(f.enemy.brain.mode,'move');
  f.enemy.actor.position.set(f.enemy.home.x,6,f.enemy.home.z);for(let i=0;i<30;i++)f.frame();assert.equal(f.enemy.residentPoseDeferred,true);
  f.enemy.reviewMode=true;f.enemy.reviewMovement={x:0,z:0};f.frame();assert.equal(f.enemy.residentPoseDeferred,false);
  f.enemy.reviewMode=false;for(let i=0;i<30;i++)f.frame();assert.equal(f.enemy.residentPoseDeferred,true);
  f.player.position.copyFrom(f.enemy.actor.position).addInPlaceFromFloats(0,0,4);f.frame();assert.equal(f.enemy.engaged,true);assert.equal(f.enemy.residentPoseDeferred,false);
  f.player.position.set(35,3,9);for(let i=0;i<45;i++)f.frame();
  f.enemy.brain.hit({damage:9999});f.frame();assert.equal(f.enemy.brain.mode,'dead');assert.equal(f.enemy.residentPoseDeferred,false);
});

test('phase-two sampling, morphs and cloth retain their existing cadence while hidden',async t=>{
  const f=await fixture(t,{phase:2,position:CAVE_ENTRY});const a=f.enemy.animator,start=a.samples;
  for(let i=0;i<300;i++)f.frame();
  assert.equal(a.samples-start,150);assert.notEqual(f.enemy.residentPoseDeferred,true);near(a.sampleInterval,1/15,'distant phase-two interval');
  assert.ok(a.breathClock>10);assert.ok(a.haloTime>10);assert.equal(a.clothInitialized,true);
});

test('a real blade contact hits a previously hidden idle in the same frame and still deduplicates its action',async t=>{
  const a=await fixture(t),b=await fixture(t,{control:true});
  for(let i=0;i<90;i++){a.frame();b.frame();}assert.equal(a.enemy.residentPoseDeferred,true);
  const capsule=b.enemy.hurtCapsules()[0],point=capsule.points[0].map((v,i)=>(v+capsule.points[1][i])/2);
  const sample={actionId:77,elapsed:.6,window:{id:'blade',damage:18,interruptsBoss:false},blade:[point,[point[0],point[1]+.01,point[2]]],previous:null,bladeRadius:.055};
  const before=[a.enemy.brain.hp,b.enemy.brain.hp];
  for(const f of [a,b]){
    f.player.position.copyFrom(f.enemy.actor.position).addInPlaceFromFloats(0,0,2);
    f.battle.poseAndContacts(f.player,{state:'attack',actionId:77},sample,null);
  }
  assert.equal(a.enemy.residentPoseDeferred,false);assert.ok(a.enemy.brain.hp<before[0]);assert.equal(before[0]-a.enemy.brain.hp,before[1]-b.enemy.brain.hp);
  assert.equal(a.enemy.hitCount,1);assert.equal(b.enemy.hitCount,1);
  const hp=a.enemy.brain.hp;for(let i=0;i<10;i++)a.battle.poseAndContacts(a.player,{state:'attack',actionId:77},sample,null);
  assert.equal(a.enemy.brain.hp,hp);assert.equal(a.enemy.hitCount,1);
});

test('map hide-return, explicit resummon and scene disposal clear deferred state with stable resources',async t=>{
  const f=await fixture(t);const resources=snapshot(f);
  for(let trip=0;trip<4;trip++){
    for(let i=0;i<30;i++)f.frame();assert.equal(f.enemy.residentPoseDeferred,true);const time=f.enemy.brain.time;
    f.battle.hide();assert.equal(f.enemy.residentPoseDeferred,false);assert.equal(f.enemy.actor.isEnabled(),false);assert.equal(f.shadow.renderList.length,0);
    f.world.cave=false;for(let i=0;i<30;i++)f.frame();near(f.enemy.brain.time,time,'map pause');
    f.world.cave=true;await f.battle.activateResident(f.player);assert.equal(f.enemy.residentPoseDeferred,false);assert.equal(f.enemy.actor.isEnabled(),true);assert.deepEqual(snapshot(f),resources);
    await f.battle.activateResident(f.player,{reset:true,phase:1});assert.equal(f.enemy.residentPoseDeferred,false);assert.deepEqual(snapshot(f),resources);
  }
  f.battle.hide();f.fog.dispose();assert.doesNotThrow(()=>f.scene.render());assert.equal(f.enemy.actor.isEnabled(),false);
});
