import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,TransformNode,MeshBuilder,PBRMaterial,RawTexture} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {createMapTransition,carryPortalPose} from '../src/map-transition.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {ARENA_RADIUS,ENEMY_ARENA_RADIUS} from '../src/world-limits.js';
import {createPortalMist} from '../src/portal-mist.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {playerChinTarget,combatFocus,followTarget} from '../src/camera-follow.js';
import {applyPlayerDetail,playerDetailBias} from '../src/player-detail.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CharacterAnimator} from '../src/animation.js';
import {prepareMapResources} from '../src/startup-resources.js';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {readMapContainer} from '../src/map-container.js';
const base=new URL('../public/assets/',import.meta.url);

test('in-document travel serializes release/load, keeps the curtain until ready, and accepts the return trip',async()=>{
  const events=[],frames=[];let release;const blocker=new Promise(r=>release=r);
  const transition=createMapTransition({prepare:()=>events.push('cover'),frame:()=>new Promise(r=>frames.push(r)),release:async()=>{events.push('release');await blocker;},load:async url=>events.push('load '+url),finish:()=>events.push('reveal')});
  const first=transition.travel('forest');assert.equal(await transition.travel('duplicate'),false);
  frames.shift()();await Promise.resolve();frames.shift()();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(events,['cover','release']);release();assert.equal(await first,true);assert.equal(transition.busy,false);
  assert.deepEqual(events,['cover','release','load forest','reveal']);
  const second=transition.travel('village');frames.shift()();await Promise.resolve();frames.shift()();assert.equal(await second,true);assert.equal(events.at(-2),'load village');
});

test('failed map loading remains covered and never automatically retries',async()=>{
  let attempts=0,errors=0,reveals=0;const t=createMapTransition({prepare(){},frame:async()=>{},release:async()=>{},load:async()=>{attempts++;throw new Error('offline');},finish(){reveals++;},onError(){errors++;}});
  assert.equal(await t.travel('forest'),false);assert.equal(await t.travel('forest'),false);assert.equal(t.failed,true);assert.equal(attempts,1);assert.equal(errors,1);assert.equal(reveals,0);
});

test('portal arrival keeps the same rear-view angle, zoom, and pan across repeated turns',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('player',scene),camera=new ArcRotateCamera('camera',1.3,.88,17,Vector3.Zero(),scene),pan={x:1,y:.2,z:-2};
  try{
    actor.rotation.y=2.1;const relation=()=>Math.atan2(Math.sin(camera.alpha+actor.rotation.y),Math.cos(camera.alpha+actor.rotation.y));const original=relation();
    for(let i=0;i<8;i++){carryPortalPose(actor,camera,pan);assert.ok(Math.abs(relation()-original)<1e-12);assert.equal(camera.beta,.88);assert.equal(camera.radius,17);assert.equal(pan.y,.2);}
    assert.deepEqual(pan,{x:1,y:.2,z:-2});
  }finally{engine.dispose();}
});

test('real V6 idle rig focuses at its visible chin and orbit/pinch keep that target',async()=>{
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  try{
    const config=JSON.parse(readFileSync(new URL('warrior-v3-ios.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
    for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
    const loader=new GLTFFileLoader();loader.skipMaterials=true;const c=await loader.loadAssetContainerAsync(scene,{json:gltf},'');c.addAllToScene();
    const actor=new TransformNode('actor',scene);actor.scaling.setAll(config.scale);for(const n of new Set([...c.meshes,...c.transformNodes]))if(!n.parent)n.parent=actor;
    for(const g of c.animationGroups)g.stop();const animator=new CharacterAnimator(c.animationGroups,config.animations);animator.transition('idle',{clipTime:0,loop:true,blendDuration:.001});animator.update(.2);
    const head=c.transformNodes.find(n=>n.name==='mixamorig:Head'),chin=playerChinTarget(actor,head);
    assert.ok(chin.y>1.41&&chin.y<1.47,'chin height '+chin.y);assert.ok(chin.z>.06&&chin.z<.16,'chin depth '+chin.z);
    const camera=new ArcRotateCamera('camera',.7,1.1,17,chin.clone(),scene);
    for(const r of [.8,2,5,13,24]){camera.radius=r;followTarget(camera,playerChinTarget(actor,head),1/30);assert.ok(camera.target.equalsWithEpsilon(chin));assert.equal(camera.radius,r);assert.equal(camera.alpha,.7);}
    assert.ok(combatFocus(chin,new Vector3(0,0,10),3).equalsWithEpsilon(chin));assert.equal(combatFocus(chin,new Vector3(0,0,10),17).y,chin.y);
  }finally{engine.dispose();}
});

for(const [webgl,ubo]of [[1,false],[2,false],[2,true]])test('WebGL '+webgl+' / UBO '+ubo+' player detail preserves complete GLSL statements, textures and mips',async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('camera',1,1,17,Vector3.Zero(),scene),mesh=MeshBuilder.CreateBox('player',{},scene),material=new PBRMaterial('paint',scene),texture=RawTexture.CreateRGBATexture(new Uint8Array([128,100,150,255]),1,1,scene,true);
  try{
    if(webgl===2){engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;}
    texture.getInternalTexture().isReady=true;engine.getCaps().maxAnisotropy=8;mesh.material=material;material.albedoTexture=texture;material.emissiveTexture=texture;
    const before=scene.textures.length;applyPlayerDetail({meshes:[mesh]},camera);applyPlayerDetail({meshes:[mesh]},camera);
    assert.equal(scene.textures.length,before);assert.equal(material.albedoTexture,texture);assert.equal(texture.noMipmap,false);assert.equal(texture.anisotropicFilteringLevel,8);
    await material.forceCompilationAsync(mesh);scene.render();
    const source=mesh.subMeshes[0].effect.fragmentSourceCode;
    assert.match(source,/vec4 albedoTexture=texture(?:2D)?\(albedoSampler,[^\n]*playerDetailBias\);/);
    assert.match(source,/vec3 emissiveColorTex=texture(?:2D)?\(emissiveSampler,[^\n]*playerDetailBias\)\.rgb;/);
    assert.equal(playerDetailBias(2),0);assert.equal(playerDetailBias(17),-.45);assert.equal(playerDetailBias(50),0);
  }finally{engine.dispose();}
});

test('portal smoke owns only two non-shadowed quads and releases its small texture',async()=>{
  const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true});
  try{
    const counts=[world.scene.meshes.length,world.scene.materials.length,world.scene.textures.length];
    for(let i=0;i<5;i++){
      const mist=createPortalMist(world,{x:0,z:51});mist.texture.getInternalTexture().isReady=true;assert.equal(mist.meshes.length,2);assert.equal(mist.texture.getSize().width,128);
      assert.equal(mist.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),4);
      for(const m of mist.meshes){assert.equal(m.receiveShadows,false);assert.equal(m.isPickable,false);await mist.material.forceCompilationAsync(m);}
      mist.update(.033);world.scene.render();mist.dispose();mist.dispose();
      assert.deepEqual([world.scene.meshes.length,world.scene.materials.length,world.scene.textures.length],counts);
    }
  }finally{engine.dispose();}
});

test('actual streamed village/forest round trips retain the player and drain in-flight LODs before releasing old map resources',async t=>{
  const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene,camera=world.camera,terrain=world.terrain;
  engine.getCaps().instancedArrays=true;const oldLocation=globalThis.location;globalThis.location={href:'https://example.test/?character=warrior-v3'};
  t.after(()=>{engine.dispose();if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;});
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base)))}));
  const oldCaches=globalThis.caches,cachedRequests=[];
  globalThis.caches={open:async()=>({match:async url=>{cachedRequests.push(url);return new Response('cached');}})};
  t.after(()=>{if(oldCaches===undefined)delete globalThis.caches;else globalThis.caches=oldCaches;});
  const playerFiles=new Set(JSON.parse(readFileSync(new URL('warrior-v3-ios.json',base))).resources.map(p=>p.split('/').at(-1)));
  const player=MeshBuilder.CreateBox('retained-player',{},scene),playerTexture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene,true),playerMaterial=new PBRMaterial('retained-player-paint',scene);player.material=playerMaterial;playerMaterial.albedoTexture=playerTexture;
  const counts=()=>[scene.meshes.length,scene.transformNodes.length,scene.materials.length,scene.textures.length,scene.geometries.length,scene.onAfterRenderObservable.observers.length,scene.onBeforeRenderObservable.observers.length,scene.onDisposeObservable.observers.length,engine.onContextRestoredObservable.observers.length];
  // The glTF loader asks the scene for its one shared default material when
  // image decoding is omitted in NullEngine. Warm that fixture before counting.
  scene.defaultMaterial;playerTexture.getInternalTexture().isReady=true;
  const initial=counts();let loaded=0,holdNext=false,unblock,entered;const loadedContainers=[];
  const services={initialize:async()=>{},ground:async()=>{},loadContainer:async(model,scene)=>{
    const {gltf,files}=await readRuntimeGltf(new URL(model.pathname.split('/').at(-1),new URL('content/',base)));
    for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
    const c=await readMapContainer(scene,gltf,'',{skipMaterials:true});
    // Match OPAQUE authored materials while excluding network/GPU image decode.
    for(const mesh of c.meshes)if(mesh.getTotalVertices()){const m=new PBRMaterial('map-'+loaded+'-'+mesh.name,scene);m.transparencyMode=0;mesh.material=m;c.materials.push(m);}
    loaded++;loadedContainers.push(c);
    if(holdNext){holdNext=false;await new Promise(resolve=>{unblock=resolve;entered();});}
    return c;
  }};
  for(const character of Array.from({length:20},(_,i)=>i%2?'warrior-v3':'warrior-v4')){
    replaceWorldMap(world,character);const spawn=character==='warrior-v4'?46:71;camera.setTarget(new Vector3(0,1.46,spawn));camera.radius=13;
    assert.equal(world.scene,scene);assert.equal(world.camera,camera);assert.equal(world.terrain,terrain);assert.equal(ARENA_RADIUS,character==='warrior-v4'?62:48);assert.equal(ENEMY_ARENA_RADIUS,ARENA_RADIUS-.5);
    cachedRequests.length=0;let progress;
    await prepareMapResources(world,new URL('https://example.test/assets/'),s=>progress=s);
    assert.equal(progress.total,0);assert.ok(progress.cached>0);assert.equal(progress.complete,true);
    assert.ok(cachedRequests.every(url=>!playerFiles.has(url.split('/').at(-1))),'map travel must not download/decode the retained 8K player again');
    const state=await loadStreamedVillage(world,services);assert.equal(state.ready,true);assert.ok(state.instances>0);scene.render();
    const oldRecords=world.villagePrepared.records;
    {
      const reached=new Promise(resolve=>entered=resolve);holdNext=true;
      camera.setTarget(new Vector3(0,1.46,-30));camera.radius=2;
      const stream=world.villageStreaming;stream.active=true;stream.update(performance.now()+1000);
      assert.ok(stream.pending,'distant unvisited LOD queued');await reached;
      let released=false;const release=world.releaseEnvironment().then(()=>released=true);
      await Promise.resolve();assert.equal(released,false,'wait for the in-flight container before replacing the map');
      unblock();await release;assert.equal(loadedContainers.at(-1).meshes.length,0,'late container disposed without installation');
    }
    world.releaseResourceDownloads();
    // Observable.remove() unregisters on Babylon's next task.
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(oldRecords.every(r=>r.root.isDisposed()));assert.equal(world.villageStreaming,null);
    assert.equal(player.isDisposed(),false);assert.equal(player.material.albedoTexture,playerTexture);assert.ok(scene.textures.includes(playerTexture));
    assert.deepEqual(counts(),initial,'map resources must return to the retained-player baseline');
    assert.ok(loadedContainers.every(c=>!c.meshes.length&&!c.materials.length&&!c.textures.length&&!c.geometries.length));
  }
  t.diagnostic(JSON.stringify({roundTrips:10,modelLoads:loaded,retainedResources:counts()}));
});
