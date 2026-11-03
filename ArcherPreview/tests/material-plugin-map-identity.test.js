import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,PBRMaterial,StandardMaterial,HemisphericLight,RawTexture} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {applyVillageToon,VillageToonShade,VillageGroundShade} from '../src/village-toon.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {CaveSurfaceShade} from '../src/witch-cave-surfaces.js';
import {CavePaintLightShade} from '../src/cave-painted-light-runtime.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {prepareMapMaterials,mapShaderCacheSize} from '../src/map-shader-cache.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {WarriorEquipment} from '../src/equipment.js';

// Actual Babylon effects, expanded GLSL, plugin uniforms and draw submissions.
// NullEngine does not rasterize pixels or establish mobile/GPU performance.
const maps=['witch-cave','monster-forest','great-plains','village'];
const outdoorNames=['MoonforestVillageToon','MoonforestTreeCoverage'];
const caveNames=['CaveRockMood','CavePaintLight','CaveFogOfWar'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(t,ubo=false){
  const engine=new NullEngine();engine._webGLVersion=2;engine.disableUniformBuffers=!ubo;
  engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.getCaps().instancedArrays=true;
  const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.fogMode=Scene.FOGMODE_LINEAR;scene.fogStart=65;scene.fogEnd=80;
  const camera=new FreeCamera('map-shader-view',new Vector3(0,2,-8),scene);camera.target=new Vector3(0,0,0);camera.setTarget(camera.target);
  new HemisphericLight('map-shader-sky',Vector3.Up(),scene);
  const world={scene,camera,ground:null,terrain:{heightAt:()=>0},lighting:{direction:Vector3.Up(),shadowsActive:false},shadows:{getShadowMap:()=>({renderList:[]})},touchDevice:true};
  caveFogFallback(scene).getInternalTexture().isReady=true;
  t.after(()=>engine.dispose());return {engine,scene,world};
}

function fogFor(world){
  const fog=new CaveFogRuntime(world,{minX:-8,minZ:-8,width:16,depth:16,isOpaque:()=>false});
  fog.texture.getInternalTexture().isReady=true;world.caveFog=fog;fog.update({x:0,z:0},0,{force:true});return fog;
}

function makeScenery(world,name,{cave=false,fogFirst=false,paint=true,surface=true,variant=null}={}){
  const mesh=MeshBuilder.CreateBox(name,{size:1},world.scene),material=mesh.material=new PBRMaterial(name,world.scene);
  mesh.isVisible=false;prepareVillageInstancing([mesh]);
  // The glTF material-added notification may attach FoW before the explicit
  // streamed-source preparation. Both real attachment orders must be safe.
  if(cave&&fogFirst)world.caveFog.attach(material);
  applyVillageToon([mesh],world.lighting);prepareTreeOcclusion([mesh]);
  if(cave){if(surface)new CaveSurfaceShade(material);if(paint)new CavePaintLightShade(material);world.caveFog?.attach(material);}
  if(variant!==null)material.customShaderNameResolve=(name,_uniforms,_buffers,_samplers,defines)=>{
    defines.MAP_CACHE_VALIDATION_VARIANT=variant;defines.rebuild();return name;
  };
  const instance=mesh.createInstance(name+'-instance');instance.instancedBuffers.treeCoverage=1;
  mesh.computeWorldMatrix(true);instance.computeWorldMatrix(true);
  return {mesh,material,instance,dispose(){instance.dispose();mesh.dispose(false,true);}};
}

function effectOf(body){return body.mesh.subMeshes[0].effect;}
function uniformLayout(material){return {...material._uniformBuffer._uniformLocations};}
function bareMaterial(world,name,Material=StandardMaterial){
  const mesh=MeshBuilder.CreateBox(name,{},world.scene),material=mesh.material=new Material(name,world.scene);
  return {mesh,material,dispose(){mesh.dispose(false,true);}};
}
function assertSource(body,cave){
  const effect=effectOf(body),fragment=effect.fragmentSourceCode,vertex=effect.vertexSourceCode;
  assert.ok(effect.isReady());assert.equal(effect._isDisposed,false);assert.match(effect.defines,/#define INSTANCES/);
  assert.match(vertex,/vTreeCoverage/);assert.match(fragment,/villageFacing/);
  for(const name of ['cavePaintFactor','caveFogShadeSurface','caveRockPaintedDetail']){
    assert.equal(fragment.includes(name),cave,`${body.material.name}: ${name} must agree with its own plugins`);
  }
  const expected=body.material.pluginManager._uniformList;
  for(const name of expected)assert.ok(effect.getUniformNames().includes(name),`actual effect is missing current plugin uniform ${name}`);
  if(!cave){
    assert.ok(!effect.getUniformNames().includes('cavePaintActive'),'outdoor effect must not inherit cave uniform table');
    assert.ok(!body.material.pluginManager._samplerList.includes('caveFogMap'),'outdoor material preparation must not request a cave sampler');
  }
  return effect;
}

for(const ubo of [false,true])for(const reverse of [false,true])test(`same engine/scene map circuit keeps scenery shader and uniform identity (UBO=${ubo}, reverse=${reverse})`,async t=>{
  const f=fixture(t,ubo),sequence=reverse?[...maps].reverse():maps;
  let outdoorEffect,caveEffect,outdoorLayout,caveLayout;
  const trace=[];
  for(let circuit=0;circuit<3;circuit++)for(const map of sequence){
    f.world.mapId=map;f.world.cave=map==='witch-cave';
    const fog=f.world.cave?fogFor(f.world):null;
    const body=makeScenery(f.world,`${map}-${circuit}`,{cave:f.world.cave});
    await prepareMapMaterials([body.mesh]);const effect=assertSource(body,f.world.cave),layout=uniformLayout(body.material);
    const own=body.material.pluginManager._plugins.filter(plugin=>[...outdoorNames,...caveNames].includes(plugin.name));
    assert.equal(new Set(own.map(plugin=>plugin.getClassName())).size,own.length,'each participating application plugin must have a distinct SDK identity');
    if(f.world.cave){
      if(caveEffect)assert.equal(effect,caveEffect,'same cave variant reuses its retained effect');
      caveEffect=effect;caveLayout=layout;
    }else{
      if(outdoorEffect)assert.equal(effect,outdoorEffect,'three outdoor maps safely share identical source');
      outdoorEffect=effect;outdoorLayout=layout;
    }
    if(outdoorEffect&&caveEffect){
      assert.notEqual(outdoorEffect,caveEffect,'different injected code must never share one compiled effect');
      assert.notEqual(outdoorEffect.key,caveEffect.key,'cache keys separate cave and outdoor GLSL');
      if(ubo)assert.notDeepEqual(outdoorLayout,caveLayout,'actual UBO offsets/layout are different');
    }
    const calls=[],render=body.mesh._processRendering;
    body.mesh._processRendering=function(mesh,sub,effect,...args){calls.push({effect,instances:args[1]?.visibleInstances?.[sub._id]??[]});return render.call(this,mesh,sub,effect,...args);};
    f.scene.render();assert.ok(calls.some(call=>call.effect===effect&&call.instances.includes(body.instance)),'real scenery instance draw uses its verified material effect');assertSource(body,f.world.cave);
    trace.push({map,circuit,effect:effect.uniqueId,uniforms:body.material.pluginManager._uniformList.length,cache:mapShaderCacheSize(f.engine)});
    body.dispose();fog?.dispose();f.world.caveFog=null;await tick();f.engine.onEndFrameObservable.notifyObservers(f.engine);
    assert.ok(mapShaderCacheSize(f.engine)<=12);assert.equal(f.scene.meshes.length,0,'map-owned geometry is released');
  }
  assert.equal(mapShaderCacheSize(f.engine),2,'twelve map visits retain only the two actual scenery variants');
  t.diagnostic(JSON.stringify({ubo,sequence,visits:trace.length,trace}));
});

for(const fogFirst of [false,true])test(`all injected plugins affect shader identity with identical final plugin (early FoW=${fogFirst})`,async t=>{
  const f=fixture(t,true);f.world.cave=true;const fog=fogFor(f.world);
  const complete=makeScenery(f.world,'full-cave',{cave:true,fogFirst});
  const partial=makeScenery(f.world,'partial-cave',{cave:true,fogFirst,paint:fogFirst,surface:!fogFirst});
  await prepareMapMaterials([complete.mesh,partial.mesh]);
  const a=effectOf(complete),b=effectOf(partial);
  assert.notEqual(a,b,'all active plugin identities affect the cache key, including plugins added before/after FoW');
  const marker=fogFirst?'caveRockPaintedDetail':'cavePaintFactor',uniform=fogFirst?'caveMoodActive':'cavePaintActive';
  assert.ok(a.fragmentSourceCode.includes(marker));assert.ok(!b.fragmentSourceCode.includes(marker));
  assert.ok(a.getUniformNames().includes(uniform));assert.ok(!b.getUniformNames().includes(uniform));
  assert.notDeepEqual(uniformLayout(complete.material),uniformLayout(partial.material));
  assertSource(complete,true);complete.dispose();partial.dispose();fog.dispose();
});

for(const reverse of [false,true])test(`actual world teardown/replace preserves incoming map shader provenance (reverse=${reverse})`,async t=>{
  const engine=new NullEngine();engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.getCaps().instancedArrays=true;
  engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
  const sequence=reverse?[...maps].reverse():maps,world=createWorld(engine,{village:true,cave:sequence[0]==='witch-cave',touchDevice:true});
  t.after(()=>engine.dispose());
  const characters={'witch-cave':'warrior-v5','monster-forest':'warrior-v4','great-plains':'warrior-plains',village:'warrior-v3'},seen=new Map();
  for(let circuit=0;circuit<2;circuit++)for(const [index,map]of sequence.entries()){
    if(circuit||index)replaceWorldMap(world,characters[map]);
    assert.equal(world.mapId,map);assert.equal(world.scene.getEngine(),engine);
    const body=makeScenery(world,'world-'+map+'-'+circuit);
    // This is the production streamed-material attachment sequence. The
    // surface and FoW owners are the actual owners replaced by world travel.
    world.caveAtmosphere?.attachMaterial(body.material);world.caveFog?.attach(body.material);world.lighting.registerMeshes([body.mesh]);
    await prepareMapMaterials([body.mesh]);const effect=assertSource(body,world.cave),kind=world.cave?'cave':'outdoor';
    if(seen.has(kind))assert.equal(effect,seen.get(kind),'same current-map program remains safely reusable');
    seen.set(kind,effect);if(seen.size===2)assert.notEqual(seen.get('cave'),seen.get('outdoor'));
    body.dispose();await tick();engine.onEndFrameObservable.notifyObservers(engine);assert.ok(mapShaderCacheSize(engine)<=12);
  }
});

// These same-base probes deliberately isolate each constructor option. Merely
// comparing a production Standard floor against PBR rock would already have
// different shader names, concealing a missing ground-variant identity.
for(const variant of ['surface','paint','village'])test(`ground and non-ground ${variant} code cannot collide within the same shader family`,async t=>{
  const f=fixture(t,true),ground=bareMaterial(f.world,'ground-'+variant),other=bareMaterial(f.world,'other-'+variant);
  if(variant==='surface'){
    new CaveSurfaceShade(ground.material,{ground:true});new CaveSurfaceShade(other.material,{ground:false});
  }else if(variant==='paint'){
    new CavePaintLightShade(ground.material,{ground:true});new CavePaintLightShade(other.material,{ground:false});
  }else{
    new VillageGroundShade(ground.material,f.world.lighting);new VillageToonShade(other.material,f.world.lighting);
  }
  await prepareMapMaterials([ground.mesh,other.mesh]);const a=effectOf(ground),b=effectOf(other);
  assert.notEqual(a,b);assert.notEqual(a.key,b.key);assert.notEqual(a.fragmentSourceCode,b.fragmentSourceCode);
  const marker=variant==='surface'?'if(caveMoodActive>.5 && caveTerrainCutaway':variant==='paint'?'color.rgb*=cavePaintFactor(vPositionW)':'float villageGroundShadow';
  assert.ok(a.fragmentSourceCode.includes(marker));assert.ok(!b.fragmentSourceCode.includes(marker));
  if(variant==='surface')assert.ok(b.fragmentSourceCode.includes('if(caveMoodActive>.5 && caveForegroundCutaway'));
  if(variant==='village')assert.ok(b.fragmentSourceCode.includes('float villageDistanceBayer2'));
  ground.dispose();other.dispose();
});

for(const Material of [StandardMaterial,PBRMaterial])test(`FoW ground sampler and UBO layout remain separate for ${Material.name}`,async t=>{
  const f=fixture(t,true);f.world.cave=true;const fog=fogFor(f.world);
  // Install the visibility owner before creating these materials, then set its
  // actual ground material before attachment. The cover geometry is irrelevant
  // to this material identity probe and is exercised by actual-world tests.
  const ground=bareMaterial(f.world,'fog-ground',Material);f.world.ground=ground.mesh;fog.attach(ground.material);
  const other=bareMaterial(f.world,'fog-non-ground',Material);fog.attach(other.material);
  await prepareMapMaterials([ground.mesh,other.mesh]);const a=effectOf(ground),b=effectOf(other);
  assert.notEqual(a,b);assert.notEqual(a.key,b.key);
  assert.ok(a.fragmentSourceCode.includes('caveGroundFog'));assert.ok(!b.fragmentSourceCode.includes('caveGroundFog'));
  // NullEngine has no linked GL reflection, and an unused sampler may also be
  // optimized away by a real driver. Check preparation requests separately.
  assert.ok(ground.material.pluginManager._samplerList.includes('caveRockMap'));assert.ok(!other.material.pluginManager._samplerList.includes('caveRockMap'));
  assert.ok(a.fragmentSourceCode.includes('float caveRockToGamma;'));assert.ok(!b.fragmentSourceCode.includes('float caveRockToGamma;'));
  assert.ok(a.getUniformNames().includes('caveRockToGamma'));assert.ok(!b.getUniformNames().includes('caveRockToGamma'));
  assert.ok('caveRockToGamma' in uniformLayout(ground.material));assert.ok(!('caveRockToGamma' in uniformLayout(other.material)));
  const color=Material===StandardMaterial?'color':'finalColor';assert.ok(b.fragmentSourceCode.includes(`${color}.rgb=caveFogShadeSurface`));
  assert.equal(/#define MOONFOREST_CAVE_FOG_STANDARD(?:\r?\n|$)/.test(a.defines),Material===StandardMaterial);
  ground.dispose();other.dispose();fog.dispose();f.world.ground=null;
});

test('actual equipment material clones skip runtime serialization and follow current cave owners across travel',async t=>{
  const f=fixture(t,true);f.world.cave=true;const first=fogFor(f.world);
  const original=new PBRMaterial('startup-equipment',f.scene);
  const texture=RawTexture.CreateRGBATexture(new Uint8Array([95,112,73,255]),1,1,f.scene,false,false);texture.getInternalTexture().isReady=true;original.emissiveTexture=texture;
  const meshes=['Golden_Oathblade','Bunnyguard_Shield'].map(name=>{const mesh=MeshBuilder.CreateBox(name,{},f.scene);mesh.material=original;return mesh;});
  const geometry=meshes.map(mesh=>mesh.geometry),internal=texture.getInternalTexture();let equipment,second;
  // Scene.addMaterial dispatches through Babylon's deferred material-added
  // queue. Let its real callback attach the original before Equipment.clone.
  const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
  function currentBindings(entry){
    const material=entry.material,mesh=entry.mesh,buffer=material._uniformBuffer,values={};
    const update=buffer.updateFloat,set=buffer.setTexture;
    buffer.updateFloat=function(name,value){if(name==='caveFogActive')values.active=value;return update.call(this,name,value);};
    buffer.setTexture=function(name,value){if(name==='caveFogMap')values.texture=value;return set.call(this,name,value);};
    try{f.scene.updateTransformMatrix(true);assert.ok(material.isReadyForSubMesh(mesh,mesh.subMeshes[0],true));material.bindForSubMesh(mesh.computeWorldMatrix(true),mesh,mesh.subMeshes[0]);}
    finally{buffer.updateFloat=update;buffer.setTexture=set;}
    return values;
  }
  try{
    await settle();assert.equal(original.pluginManager.getPlugin('CaveFogOfWar').runtime,first,'real asynchronous startup observer attached FoW before cloning');
    assert.doesNotThrow(()=>{equipment=new WarriorEquipment({meshes});},'unregistered runtime plugin names must never enter SDK clone deserialization');
    await settle();
    const entries=Object.values(equipment.slots);assert.notEqual(entries[0].material,entries[1].material);
    for(const [index,entry]of entries.entries()){
      assert.equal(entry.material.pluginManager.getPlugin('CaveFogOfWar').runtime,first,'real new-material observer attaches the cloned material');
      assert.equal(entry.material.emissiveTexture,texture);assert.equal(entry.mesh.geometry,geometry[index]);
      assert.ok(!Object.keys(entry.material.serialize().plugins).some(name=>name.startsWith('Moonforest')),'runtime plugins are omitted from serialized clone input');
    }
    await prepareMapMaterials(meshes);
    for(const entry of entries)assert.deepEqual(currentBindings(entry),{active:1,texture:first.texture});
    const firstMask=first.texture;first.dispose();f.world.caveFog=null;f.world.cave=false;
    for(const entry of entries){
      assert.equal(entry.material.pluginManager.getPlugin('CaveFogOfWar').runtime,null);
      assert.deepEqual(currentBindings(entry),{active:0,texture:caveFogFallback(f.scene)},'outdoor bind never samples the released map');
    }
    f.world.cave=true;second=fogFor(f.world);assert.notEqual(second.texture,firstMask);
    for(const entry of entries){
      assert.equal(entry.material.pluginManager.getPlugin('CaveFogOfWar').runtime,second,'re-entry reuses the plugin with its new map owner');
      assert.deepEqual(currentBindings(entry),{active:1,texture:second.texture});
      assert.equal(entry.material.emissiveTexture,texture);assert.equal(texture.getInternalTexture(),internal);assert.ok(f.scene.textures.includes(texture));
    }
    equipment.dispose();equipment=null;
    for(const mesh of meshes)assert.equal(mesh.material,original);
    assert.equal(original.emissiveTexture,texture);assert.equal(texture.getInternalTexture(),internal);
  }finally{second?.dispose();first.dispose();equipment?.dispose();for(const mesh of meshes)mesh.dispose();original.dispose(false,false);texture.dispose();}
});

test('actual Babylon effects stay bounded and evicted programs are released after many retained map variants',async t=>{
  const f=fixture(t,true),effects=[];
  for(let variant=0;variant<24;variant++){
    const body=makeScenery(f.world,'bounded-'+variant,{variant});await prepareMapMaterials([body.mesh]);
    const effect=assertSource(body,false);assert.match(effect.defines,new RegExp(`#define MAP_CACHE_VALIDATION_VARIANT ${variant}(?:\\r?\\n|$)`));effects.push(effect);
    body.dispose();await tick();f.engine.onEndFrameObservable.notifyObservers(f.engine);assert.ok(mapShaderCacheSize(f.engine)<=12);
  }
  assert.equal(new Set(effects).size,24,'real source variants produce real independent SDK effects');
  assert.equal(mapShaderCacheSize(f.engine),12);
  assert.ok(effects.slice(0,12).every(effect=>effect._isDisposed),'cache eviction releases the last effect owner');
  assert.ok(effects.slice(12).every(effect=>!effect._isDisposed));
});
