import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,FreeCamera,Vector3,Constants,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {applyMonsterToon} from '../src/monster-toon.js';
import {applyElenaStyle} from '../src/elena-style.js';
import {enableEnemyFade,EnemyDeath} from '../src/enemy-death.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {prepareBossShaders} from '../src/boss-shader-warmup.js';
import {fadingSurfaceBeforeInk} from '../src/character-render-cost.js';

function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('fade',new Vector3(0,1,-8),scene);camera.setTarget(Vector3.Zero());caveFogFallback(scene).getInternalTexture().isReady=true;
 t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene};
}

test('transparent enemy bodies render before their stencil-rejected ink, retaining native colour and zero extra passes',async t=>{
 const {scene}=fixture(t),material=new PBRMaterial('shared-unlit',scene);material.unlit=true;material.metadata={moonforestMonsterToon:true};material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
 const make=name=>{const body=MeshBuilder.CreateSphere(name,{segments:8},scene);body.material=material;const asset={meshes:[body]};attachCharacterOutlines(asset,'goblin');enableEnemyFade(asset);return asset;};
 const a=make('dying'),b=make('living'),body=a.meshes[0],ink=a.meshes[1],geometry=body.geometry,rig=body.skeleton;
 assert.equal(ink.material,b.meshes[1].material);assert.equal(body.material,material);assert.equal(body.material,b.meshes[0].material);
 assert.equal(material.stencil.funcRef,2);assert.equal(material.stencil.mask,2);assert.equal(ink.material.stencil.func,Constants.NOTEQUAL);assert.equal(ink.material.stencil.funcMask,2);assert.equal(ink.material.stencil.mask,0);
 const originalShader=ink.material;enableEnemyFade(a);assert.equal(ink.material,originalShader);
 await prepareBossShaders({meshes:[...a.meshes,...b.meshes]},{frame:async()=>{}});
 const inventory=()=>[scene.meshes.length,scene.materials.length,scene.geometries.length,scene.textures.length,scene.customRenderTargets.length],before=inventory(),paint=material.albedoColor.asArray(),draws=[];
 for(const mesh of [...a.meshes,...b.meshes]){const process=mesh._processRendering;mesh._processRendering=function(...args){draws.push(mesh);return process.apply(this,args);};}
 const death=new EnemyDeath();
 for(const elapsed of [0,.01,.25,1,2.5,4.5]){
  death.reset();death.advance(elapsed);for(const mesh of a.meshes)mesh.visibility=death.opacity;
  draws.length=0;scene.render();assert.equal(draws.length,4,'same two bodies and two existing hulls, without a depth prepass');
  assert.ok(draws.indexOf(body)<draws.indexOf(ink),'base pixels mark coverage before their ink');assert.ok(draws.indexOf(b.meshes[0])<draws.indexOf(ink));
  assert.deepEqual(material.albedoColor.asArray(),paint);assert.equal(material.alpha,1);assert.equal(b.meshes[0].visibility,1);assert.equal(body.geometry,geometry);assert.equal(body.skeleton,rig);assert.equal(ink.geometry,geometry);assert.deepEqual(inventory(),before);
 }
 // A body-covered pixel keeps its textured colour/alpha. The black rear hull
 // is rejected; exterior pixels retain the same outlined eased fade. This is
 // alpha/stencil math, not a browser/GPU framebuffer screenshot claim.
 const base=[.64,.43,.29],background=[.35,.47,.22],black=[.035,.025,.035],over=(dst,src,a)=>src.map((c,i)=>c*a+dst[i]*(1-a));
 for(const alpha of [.999,.9,.5,.1,.001]){
  const bodyStencil=2,inkDraws=(bodyStencil&ink.material.stencil.funcMask)!==ink.material.stencil.funcRef;
  assert.equal(inkDraws,false);const actual=over(background,base,alpha);assert.deepEqual(actual,base.map((c,i)=>c*alpha+background[i]*(1-alpha)));
  const old=over(over(background,base,alpha),black,alpha);assert.ok(old.every((c,i)=>c<actual[i]),'unmasked rear ink explains the previous blackening');
  assert.equal((0&ink.material.stencil.funcMask)!==ink.material.stencil.funcRef,true,'exterior outline is retained');
 }
});

test('fading ink bucket preserves every unrelated transparent ordering including the unchanged Mourning Witch',()=>{
 const previous=(a,b)=>a.order-b.order,entry=(order,metadata={},visibility=1)=>({order,getMesh:()=>({metadata,visibility})}),compare=fadingSurfaceBeforeInk(previous);
 const a=entry(9),b=entry(3),mourning=entry(1,{moonforestOutline:true},.5),livingInk=entry(0,{moonforestOutline:true,enemyFadeExterior:true},1),fadingInk=entry(-10,{moonforestOutline:true,enemyFadeExterior:true},.5);
 assert.equal(compare(a,b),previous(a,b));assert.equal(compare(mourning,a),previous(mourning,a));assert.equal(compare(livingInk,a),previous(livingInk,a));assert.ok(compare(fadingInk,a)>0);assert.ok(compare(fadingInk,mourning)>0);
});

test('actual bear, goblin and saint preserve source buffers, materials, rigs and shared fade resources',async t=>{
 const {scene}=fixture(t),base=new URL('../public/assets/',import.meta.url);
 for(const [name,kind]of [['guardian-bear','bear'],['hooded-goblin','goblin'],['elena','elena']]){
  const config=JSON.parse(readFileSync(new URL(name+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),json=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])json[key]=(json[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json},'');asset.addAllToScene();t.after(()=>loader.dispose());for(const group of asset.animationGroups)group.stop();
  const root=new TransformNode(name+'-actor',scene),source=new PBRMaterial(name+'-paint',scene);source.unlit=true;
  for(const mesh of asset.meshes)if(mesh.getTotalVertices())mesh.material=source;
  applyMonsterToon(asset);if(kind==='elena')applyElenaStyle(asset);
  const snapshots=asset.meshes.filter(m=>m.getTotalVertices()).map(m=>[m,m.geometry,m.skeleton,m.morphTargetManager,m.material,m.getTotalIndices()]);
  attachCharacterOutlines(asset,kind);enableEnemyFade(asset);
  for(const [mesh,g,s,m,paint,indices]of snapshots){assert.equal(mesh.geometry,g);assert.equal(mesh.skeleton,s);assert.equal(mesh.morphTargetManager,m);assert.equal(mesh.material,paint);assert.equal(mesh.getTotalIndices(),indices);assert.equal(paint.stencil.funcRef,2);assert.equal(paint.unlit,true);assert.equal(paint.reflectionTexture,null);}
  for(const ink of asset.meshes.filter(m=>m.metadata?.moonforestOutline)){assert.equal(ink.geometry,ink.parent.geometry);assert.equal(ink.skeleton,ink.parent.skeleton);assert.equal(ink.morphTargetManager,ink.parent.morphTargetManager);assert.equal(ink.material.stencil.funcRef,2);}
  root.dispose();asset.dispose();
 }
});
