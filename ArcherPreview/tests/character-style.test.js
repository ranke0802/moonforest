import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,FreeCamera,Vector3,TransformNode,RawTexture} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {CharacterStyleSettings,CHARACTER_STYLE_DEFAULTS,normalizeCharacterStyles,setupCharacterStylePanel} from '../src/character-style-settings.js';
import {applyCharacterSurfaceStyle,setSceneCharacterStyles,characterStyleFor} from '../src/character-style.js';
import {applyMonsterToon} from '../src/monster-toon.js';
import {applyElenaStyle} from '../src/elena-style.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {WarriorEquipment} from '../src/equipment.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {FrameLoop} from '../src/frame-loop.js';

const storage=()=>({value:null,getItem(){return this.value;},setItem(_k,v){this.value=v;}});
function fixture(t,ubo=false){
  const engine=new NullEngine(),scene=new Scene(engine);engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;
  const camera=new FreeCamera('camera',new Vector3(0,2,-10),scene);camera.setTarget(new Vector3(0,1,0));
  caveFogFallback(scene).getInternalTexture().isReady=true;
  t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene,camera};
}
const counts=scene=>[scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length,scene.skeletons.length,scene.morphTargetManagers.length];
function uniforms(mesh,name){
  const result={};mesh.material.pluginManager.getPlugin(name).hardBindForSubMesh({updateFloat:(n,x)=>result[n]=x,updateFloat2:(n,x,y)=>result[n]=[x,y],updateFloat4:(n,x,y,z,w)=>result[n]=[x,y,z,w]},mesh.getScene(),mesh.getScene().getEngine(),mesh.subMeshes[0]);return result;
}
test('style preferences preserve original defaults, bound invalid data and persist independent groups',()=>{
  const s=storage(),prefs=new CharacterStyleSettings(s);
  for(const group of ['player','boss'])assert.deepEqual(prefs.value[group],CHARACTER_STYLE_DEFAULTS[group]);
  prefs.set('player',{outline:false,outlineWidth:99,brightness:NaN,internalStrength:-4});
  assert.equal(prefs.value.player.outlineWidth,3);assert.equal(prefs.value.player.brightness,1);assert.equal(prefs.value.player.internalStrength,0);
  prefs.set('boss',{brightness:1.8,outlineWidth:1.25,internal:false});assert.deepEqual(new CharacterStyleSettings(s).value,prefs.value);
  prefs.reset('player');assert.equal(prefs.value.player.outline,true);assert.equal(prefs.value.boss.brightness,1.8);
  prefs.set('unknown',{brightness:2});assert.equal(prefs.value.unknown,undefined);
  assert.equal(normalizeCharacterStyles({boss:{brightness:null}}).boss.brightness,1.35);
  assert.doesNotThrow(()=>new CharacterStyleSettings({getItem(){throw Error();},setItem(){throw Error();}}).set('boss',{outline:false}));
});

test('modal real controls stay inside fullscreen root, save/reset groups and retain camera controls',t=>{
  const {document,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),previous=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=previous);
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.getAttribute('value')===String(v));}});
  window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
  setupSettingsPanel();let changed=0;const s=storage(),panel=setupCharacterStylePanel({storage:s,onChange:()=>changed++}),q=id=>document.querySelector(id);
  const fire=(id,type,value)=>{if(value!==undefined)q(id).value=value;q(id).dispatchEvent(new window.Event(type,{bubbles:true}));};
  assert.equal(q('#camera-upward-limited').hasAttribute('checked'),true);assert.equal(panel.dialog.closest('#app'),q('#app'));
  fire('#open-character-style','click');assert.equal(panel.dialog.hasAttribute('open'),true);
  fire('#character-brightness','input','1.6');assert.equal(panel.settings.value.player.brightness,1.6);
  q('#character-outline-enabled').checked=false;fire('#character-outline-enabled','change');assert.equal(q('#character-outline-width').disabled,true);
  fire('#character-style-group','change','boss');assert.equal(q('#character-brightness').value,'1.35');
  fire('#character-internal-strength','input','.72');fire('#character-outline-width','input','1.25');assert.equal(panel.settings.value.boss.outlineWidth,1.25);assert.equal(panel.settings.value.player.outline,false);
  assert.deepEqual(new CharacterStyleSettings(s).value,panel.settings.value);fire('#reset-character-style','click');assert.deepEqual(panel.settings.value.boss,CHARACTER_STYLE_DEFAULTS.boss);assert.equal(panel.settings.value.player.brightness,1.6);
  fire('.close-style','click');assert.equal(panel.dialog.hasAttribute('open'),false);assert.ok(changed>=5);
});

test('main modal pause/resume, map finish and paused preview include style dialog',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const sync=source.match(/const syncPlayback=\(\)=>\{.*\};/)[0],events=[],dialogs=new Map();
  const run=new Function('mapDeparture','mapTransition','motionSpeedControls','$','document','deathScreen','input','cancelAttackInput','frameLoop','text','frameDiagnostics','audio',sync+'return syncPlayback;');
  const call=run(null,null,{isOpen:()=>false},s=>dialogs.get(s)??{open:false},{hidden:false},{isOpen:()=>false},{reset:()=>events.push('reset')},()=>events.push('cancel'),{setPaused:v=>events.push(['pause',v])},()=>{},{suspend(){}},{setSuspended:v=>events.push(['audio',v])});
  dialogs.set('#character-style-dialog',{open:true});call();assert.ok(events.includes('reset'));assert.deepEqual(events.filter(Array.isArray),[['pause',true],['audio',true]]);
  events.length=0;dialogs.get('#character-style-dialog').open=false;call();assert.deepEqual(events,[['pause',false],['audio',false]]);
  assert.match(source,/const modalOpen=.*#character-style-dialog/);assert.match(source,/for\(const selector of \[.*#character-style-dialog/);
  const setup=source.match(/const characterStylePanel=setupCharacterStylePanel\((.*)\);/)[1];
  let value,frames=0;new Function('setupCharacterStylePanel','equipmentStorage','world','setSceneCharacterStyles','renderActivity','frameLoop','return setupCharacterStylePanel('+setup+');')(options=>options.onChange({test:1}),null,{scene:{}},(_s,v)=>value=v,{wake(){}},{invalidate:()=>frames++});
  assert.deepEqual(value,{test:1});assert.equal(frames,1,'paused slider schedules a draw without advancing combat');
  const listeners=new Map(),scheduled=new Set(),paint=[];
  const loop=new FrameLoop({runRenderLoop:f=>scheduled.add(f),stopRenderLoop:f=>scheduled.delete(f)},dt=>paint.push(dt));
  const preview=source.match(/for\(const selector of \['#motion-speed-dialog','#character-style-dialog'\]\).*;/)[0];
  new Function('$','mapDeparture','mapTransition','frameLoop',preview)(s=>({addEventListener:(event,fn)=>listeners.set(s+event,fn)}),null,null,loop);
  loop.invalidate();loop.setPaused(true);assert.equal(scheduled.size,0,'the dialog click pause handler cancels a previously scheduled preview');
  listeners.get('#character-style-dialogclick')();assert.equal(scheduled.size,1,'later bubble listener restores the reset preview');
  for(const frame of [...scheduled])frame();assert.deepEqual(paint,[0]);assert.equal(loop.running,false);
});

for(const ubo of [false,true])test(`uniform-only adjustments preserve shared-material group separation and frozen shader/geometry identity (UBO ${ubo})`,async t=>{
  const {scene}=fixture(t,ubo),material=new PBRMaterial('shared',scene);material.unlit=true;
  const player=MeshBuilder.CreateBox('player',{},scene),boss=MeshBuilder.CreateBox('boss',{},scene),other=MeshBuilder.CreateBox('environment',{},scene);
  for(const [i,mesh] of [player,boss,other].entries()){mesh.material=material;mesh.position.x=(i-1)*2;}
  applyCharacterSurfaceStyle({meshes:[player]},'player');applyCharacterSurfaceStyle({meshes:[boss]},'boss');
  assert.equal(player.material,boss.material);assert.equal(boss.material,other.material);
  assert.deepEqual(uniforms(player,'MoonforestCharacterStyle').characterPaint,[1,0]);assert.deepEqual(uniforms(boss,'MoonforestCharacterStyle').characterPaint,[1,0]);
  const prefs=new CharacterStyleSettings();setSceneCharacterStyles(scene,prefs.value);
  for(const m of [player,boss,other])await material.forceCompilationAsync(m);scene.render();material.freeze();
  const effect=player.subMeshes[0].effect,before=counts(scene),geometry=player.geometry,draws=[];
  let bound;const update=material._uniformBuffer.updateFloat2.bind(material._uniformBuffer);
  material._uniformBuffer.updateFloat2=(name,x,y,...rest)=>{if(name==='characterPaint')bound=[x,y];return update(name,x,y,...rest);};
  material.onBindObservable.add(mesh=>draws.push([mesh.name,bound]));
  for(let i=0;i<30;i++){
    prefs.set('player',{brightness:1+i/100,internalStrength:i/100});prefs.set('boss',{brightness:2,internalStrength:.6});setSceneCharacterStyles(scene,prefs.value);draws.length=0;scene.render();
    assert.deepEqual(draws,[['player',[prefs.value.player.brightness,i/100]],['boss',[2/1.35,.6-.2]],['environment',[1,0]]],'each actual consecutive draw refreshes the frozen material');
    assert.deepEqual(uniforms(player,'MoonforestCharacterStyle').characterPaint,[prefs.value.player.brightness,i/100]);assert.deepEqual(uniforms(boss,'MoonforestCharacterStyle').characterPaint,[2/1.35,.6-.2]);assert.deepEqual(uniforms(other,'MoonforestCharacterStyle').characterPaint,[1,0]);
    assert.equal(player.subMeshes[0].effect,effect);assert.equal(player.geometry,geometry);assert.deepEqual(counts(scene),before);
  }
  const late=MeshBuilder.CreateBox('new-summon',{},scene);late.material=material;applyCharacterSurfaceStyle({meshes:[late]},'boss');assert.equal(characterStyleFor(late),prefs.value.boss);
});

test('style toggles cannot reveal FoW-hidden or pooled actors, and ink keeps its skin and visibility owner',t=>{
  const {scene,camera}=fixture(t),world={scene,camera,cave:true,terrain:{heightAt:()=>0},shadows:{getShadowMap:()=>({renderList:[]})}},fog=new CaveFogRuntime(world,{isOpaque:x=>x>=0&&x<1});world.caveFog=fog;t.after(()=>fog.dispose());
  const root=new TransformNode('pooled-boss',scene);root.position.x=5;const body=MeshBuilder.CreateBox('boss',{},scene);body.parent=root;body.material=new PBRMaterial('paint',scene);
  const asset={meshes:[body]},shell=attachCharacterOutlines(asset,'elena')[0],prefs=new CharacterStyleSettings();
  const e={active:true,actor:root,asset};fog.update({x:-5,z:0},0,{force:true,encounters:[e]});fog.beforeRender();assert.equal(shell.isVisible,false);
  prefs.set('boss',{outline:false});setSceneCharacterStyles(scene,prefs.value);assert.equal(shell.isEnabled(false),false);fog.restore();assert.equal(shell.isEnabled(false),false);
  fog.beforeRender();prefs.set('boss',{outline:true});setSceneCharacterStyles(scene,prefs.value);assert.equal(shell.isVisible,false);assert.equal(body.isVisible,false);fog.restore();
  root.setEnabled(false);prefs.set('boss',{outline:false});setSceneCharacterStyles(scene,prefs.value);prefs.set('boss',{outline:true});setSceneCharacterStyles(scene,prefs.value);assert.equal(root.isEnabled(),false);assert.equal(shell.isEnabled(),false);
  root.setEnabled(true);assert.equal(shell.isEnabled(),true);assert.equal(shell.geometry,body.geometry);
  fog.dispose();assert.equal(characterStyleFor(body).brightness,1,'unregistered body is neutral');assert.equal(characterStyleFor(shell),prefs.value.boss);
  const returning=new CaveFogRuntime(world,{isOpaque:()=>false});world.caveFog=returning;t.after(()=>returning.dispose());assert.equal(characterStyleFor(shell),prefs.value.boss,'new map runtime keeps scene-level preferences');
});

test('disabled ink is absent from actual draws and re-enabling reuses the same pass',async t=>{
  const {scene}=fixture(t),body=MeshBuilder.CreateBox('visible-bear',{},scene);body.material=new PBRMaterial('painted',scene);body.material.unlit=true;
  const asset={meshes:[body]},shell=attachCharacterOutlines(asset,'bear')[0],prefs=new CharacterStyleSettings();
  for(const mesh of asset.meshes)await mesh.material.forceCompilationAsync(mesh);
  const draws=[];for(const mesh of asset.meshes){const process=mesh._processRendering;mesh._processRendering=function(...args){draws.push(mesh);return process.apply(this,args);};}
  const before=counts(scene);scene.render();assert.ok(draws.includes(body));assert.ok(draws.includes(shell));const effect=shell.subMeshes[0].effect;
  for(const enabled of [false,true,false,true]){
    prefs.set('boss',{outline:enabled});setSceneCharacterStyles(scene,prefs.value);draws.length=0;scene.render();assert.ok(draws.includes(body));assert.equal(draws.includes(shell),enabled);
    assert.equal(shell.subMeshes[0].effect,effect);assert.deepEqual(counts(scene),before);
  }
});

async function realAsset(scene,name){
  const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL(name+'.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
  // Retain actual material classes/flags/colors and the complete original rig.
  // NullEngine has no image decoder; only texture references are replaced by a
  // completed one-texel upload, never written to a production asset.
  const strip=value=>{if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(/Texture$/.test(key))delete value[key];else strip(value[key]);}};
  for(const m of gltf.materials??[])strip(m);gltf.images=[];gltf.textures=[];
  const loader=new GLTFFileLoader(),asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();for(const group of asset.animationGroups)group.stop();return {asset,config};
}

test('real 8K warrior/equipment and bear/saint/r9 witch keep geometry, skins, morphs, default paint and independent style uniforms',async t=>{
  const {engine,scene}=fixture(t);scene.useRightHandedSystem=true;engine.getCaps().textureFloat=true;engine.getCaps().maxVertexTextureImageUnits=16;
  const prefs=new CharacterStyleSettings();setSceneCharacterStyles(scene,prefs.value);
  const {asset:player,config}=await realAsset(scene,'warrior-v3');assert.equal(config.textureProfile.maxSize,8192);
  const white=RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene);white.getInternalTexture().isReady=true;
  for(const name of ['Golden_Oathblade','Bunnyguard_Shield'])player.meshes.find(m=>m.name===name).material.emissiveTexture=white;
  const equipment=new WarriorEquipment(player);t.after(()=>equipment.dispose());
  applyCharacterSurfaceStyle(player,'player');attachCharacterOutlines(player,'warrior');
  const originalInk=player.meshes.filter(m=>/outline/i.test(m.name)&&m.getTotalVertices());assert.ok(originalInk.length>=6);
  for(const m of originalInk){assert.ok(m.metadata.characterInkRegistered);assert.ok(uniforms(m,'MoonforestAuthoredInk').characterInk[0]===0);}
  const actors=[{asset:player,group:'player'}];
  for(const name of ['guardian-bear','elena','mourning-elena']){
    const {asset}=await realAsset(scene,name);applyMonsterToon(asset);if(name!=='guardian-bear')applyElenaStyle(asset);attachCharacterOutlines(asset,name==='guardian-bear'?'bear':'elena');actors.push({asset,group:'boss',name});
    for(const m of asset.meshes.filter(m=>m.getTotalVertices()&&!m.metadata?.moonforestOutline)){
      assert.equal(m.material.unlit,true);assert.equal(m.material.reflectionTexture,null);
      assert.deepEqual(uniforms(m,'MoonforestCharacterStyle').characterPaint,[1,0]);
      if(name!=='guardian-bear')assert.deepEqual(uniforms(m,'ElenaPaint').elenaPaintStyle,[1.35,.2]);
    }
    if(name==='mourning-elena')assert.equal(asset.meshes.filter(m=>m.name.includes('Lament_Mouth_Interior')).length,1,'no new mouth silhouette');
  }
  const all=actors.flatMap(a=>a.asset.meshes.filter(m=>m.getTotalVertices())),snapshot=all.map(m=>[m,m.geometry,m.skeleton,m.morphTargetManager,m.material]),before=counts(scene);
  const samples=[player.meshes.find(m=>m.name==='Golden_Oathblade'),originalInk[0],...actors.slice(1).map(a=>a.asset.meshes.find(m=>m.getTotalVertices()&&!m.metadata?.moonforestOutline))];
  for(const m of samples){await m.material.forceCompilationAsync(m);assert.ok(m.material.isReadyForSubMesh(m,m.subMeshes[0]),m.name+' shader ready');assert.ok(m.subMeshes[0].effect.isReady());}
  const programs=samples.map(m=>m.subMeshes[0].effect);
  for(let i=0;i<20;i++){
    prefs.set('player',{brightness:1.8,outlineWidth:i/20,internalStrength:.6,outline:i%2===0});prefs.set('boss',{brightness:.85,outlineWidth:i/20,internalStrength:.7,outline:i%2===1});setSceneCharacterStyles(scene,prefs.value);
    for(const [m,g,s,morph,mat] of snapshot){assert.equal(m.geometry,g);assert.equal(m.skeleton,s);assert.equal(m.morphTargetManager,morph);assert.equal(m.material,mat);}
    for(const [index,m] of samples.entries()){assert.ok(m.material.isReadyForSubMesh(m,m.subMeshes[0]));assert.equal(m.subMeshes[0].effect,programs[index]);}
    assert.deepEqual(counts(scene),before);
  }
  assert.deepEqual(uniforms(player.meshes.find(m=>m.name==='Golden_Oathblade'),'MoonforestCharacterStyle').characterPaint,[1.8,.6]);
  assert.deepEqual(uniforms(actors.at(-1).asset.meshes.find(m=>m.getTotalVertices()),'ElenaPaint').elenaPaintStyle,[.85,.7]);
  for(const {asset,group} of actors)applyCharacterSurfaceStyle(asset,group);assert.deepEqual(counts(scene),before,'reusing assets does not add materials or meshes');
  prefs.set('player',{outline:false});setSceneCharacterStyles(scene,prefs.value);
  const {asset:reloaded}=await realAsset(scene,'warrior-v3');applyCharacterSurfaceStyle(reloaded,'player');
  const reloadedInk=reloaded.meshes.filter(m=>m.metadata?.characterInkRegistered);assert.ok(reloadedInk.length>=6);
  for(const m of [...originalInk,...reloadedInk])assert.equal(m.isEnabled(false),false,'stored switch survives player reload');
  prefs.reset('player');setSceneCharacterStyles(scene,prefs.value);for(const m of [...originalInk,...reloadedInk]){assert.equal(m.isEnabled(false),true);assert.ok(uniforms(m,'MoonforestAuthoredInk').characterInk[0]===0);}
});
