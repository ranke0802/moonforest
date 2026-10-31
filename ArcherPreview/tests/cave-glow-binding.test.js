import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Constants} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

function completeNullTextureUploads(world){
 // NullEngine has no GPU upload completion. Mark the actual existing raw
 // samplers ready at that boundary so subsequent frames still draw the glow.
 caveFogFallback(world.scene);
 for(const texture of world.scene.textures){const internal=texture.getInternalTexture();if(internal)internal.isReady=true;}
}

function fixture(t){
 const engine=new NullEngine(),world=createWorld(engine,{village:true,cave:true,touchDevice:true});t.after(()=>engine.dispose());
 completeNullTextureUploads(world);
 assert.equal(engine.supportsUniformBuffers,false);assert.equal(engine.getCaps().instancedArrays,false);
 const sources=world.scene.meshes.filter(mesh=>mesh.name.startsWith('cave-glow-source-'));
 assert.equal(sources.length,2);return {engine,world,sources};
}

function lookAtInstance(world,instance){
 world.camera.setTarget(instance.position.clone());world.camera.alpha=.4;world.camera.beta=1.1;world.camera.radius=9;
 world.camera.getViewMatrix(true);world.camera.getProjectionMatrix(true);
}

for(const name of ['votive-lantern','soul-collector-arm'])test(`actual ${name} software instances bind a ready current Effect before per-instance world uploads`,t=>{
 const {world,sources}=fixture(t),source=sources.find(mesh=>mesh.name.endsWith(name)),material=source.material,buffer=source.getMeshUniformBuffer();
 assert.equal(buffer.useUbo,false);assert.equal(buffer._currentEffect,undefined);assert.ok(source.instances.length>0);
 assert.equal(material.alphaMode,Constants.ALPHA_ADD);assert.equal(material.disableDepthWrite,true);assert.equal(source.isVisible,false);
 const transfers=[],uploads=[],observedEffects=new Set(),originalTransfer=source.transferToEffect;
 material.onBindObservable.add(mesh=>{
  assert.strictEqual(mesh,source);const effect=material._activeEffect;
  assert.equal(effect.isReady(),true);assert.strictEqual(buffer._currentEffect,effect,'fallback buffer follows the actual draw Effect');
  if(!observedEffects.has(effect)){
   observedEffects.add(effect);const originalSetMatrix=effect.setMatrix;
   effect.setMatrix=function(uniform,matrix){if(uniform==='world')uploads.push(Array.from(matrix.m.slice(12,15)));return originalSetMatrix.call(this,uniform,matrix);};
  }
 });
 source.transferToEffect=function(matrix){
  assert.strictEqual(buffer._currentEffect,material._activeEffect);assert.equal(buffer._currentEffect.isReady(),true);
  transfers.push(Array.from(matrix.m.slice(12,15)));return originalTransfer.call(this,matrix);
 };
 for(const instance of source.instances){lookAtInstance(world,instance);assert.doesNotThrow(()=>world.scene.render());}
 assert.ok(transfers.length>=source.instances.length,'visible source instances actually traverse the renderer');
 for(const instance of source.instances){
  const position=instance.getWorldMatrix().m.slice(12,15),matches=value=>value.every((number,index)=>Math.abs(number-position[index])<1e-6);
  assert.ok(transfers.some(matches),'instance reaches Mesh.transferToEffect at its authored light position');
  assert.ok(uploads.some(matches),'the ready Effect receives that instance world matrix');
 }
 assert.equal(material.alphaMode,Constants.ALPHA_ADD);assert.equal(source.instances.length,name==='votive-lantern'?10:2);
});

test('glow fallback refreshes its bound Effect after a real ShaderMaterial variant recompile',t=>{
 const {world,sources}=fixture(t),source=sources[0],material=source.material,buffer=source.getMeshUniformBuffer();
 lookAtInstance(world,source.instances[0]);world.scene.render();const first=material._activeEffect;
 assert.equal(first.isReady(),true);assert.strictEqual(buffer._currentEffect,first);
 material.options.defines.push('#define CAVE_GLOW_BINDING_REGRESSION_VARIANT');world.scene.resetCachedMaterial();world.scene.render();
 const second=material._activeEffect;assert.equal(second.isReady(),true);assert.notStrictEqual(second,first,'test must exercise a new shader Effect');assert.strictEqual(buffer._currentEffect,second,'old ready Effect cannot remain in the mesh fallback buffer');
 assert.match(second.defines,/CAVE_GLOW_BINDING_REGRESSION_VARIANT/);
});

for(const state of ['pending','disposed'])test(`glow onBind cannot connect a ${state} Effect to its mesh fallback buffer`,t=>{
 const {world,sources}=fixture(t),source=sources[0],material=source.material,buffer=source.getMeshUniformBuffer();
 lookAtInstance(world,source.instances[0]);world.scene.render();const current=material._activeEffect;
 assert.equal(current.isReady(),true);assert.strictEqual(buffer._currentEffect,current);
 // NullEngine compiles synchronously. Inject only the asynchronous Effect
 // readiness boundary; exercise the production onBind observers unchanged.
 const invalid=Object.freeze({_isDisposed:state==='disposed',isReady:()=>state!=='pending'});
 material._activeEffect=invalid;
 try{assert.doesNotThrow(()=>material.onBindObservable.notifyObservers(source));assert.strictEqual(buffer._currentEffect,current);}
 finally{material._activeEffect=current;}
});

test('WebGL2 instanced shader variants retain hardware world attributes and bind the actual ready mesh Effect',async t=>{
 const engine=new NullEngine();engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();
 const world=createWorld(engine,{village:true,cave:true,touchDevice:true});t.after(()=>engine.dispose());completeNullTextureUploads(world);
 world.scene.updateTransformMatrix(true);
 assert.equal(engine.supportsUniformBuffers,true);
 for(const source of world.scene.meshes.filter(mesh=>mesh.name.startsWith('cave-glow-source-'))){
  // Babylon deliberately keeps per-mesh uniforms in Effect fallback buffers
  // on WebGL2 too; scene/material UBO support does not change that contract.
  const material=source.material,buffer=source.getMeshUniformBuffer();assert.equal(buffer.useUbo,false);
  assert.equal(material.isReadyForSubMesh(source,source.subMeshes[0],true),true);material.bindForSubMesh(source.getWorldMatrix(),source,source.subMeshes[0]);
  const effect=material._activeEffect;assert.equal(effect.isReady(),true);assert.match(effect.defines,/#define INSTANCES/);assert.match(effect.vertexSourceCode,/(?:attribute|in) vec4 world0/);assert.match(effect.vertexSourceCode,/finalWorld=mat4\(world0,world1,world2,world3\)/);
  assert.strictEqual(buffer._currentEffect,effect);assert.equal(material.alphaMode,Constants.ALPHA_ADD);assert.equal(material.disableDepthWrite,true);
 }
});

test('repeated real map replacements render glow instances without retaining old source buffers or changing their light geometry',t=>{
 const {world}=fixture(t);const originalCamera=world.camera;
 for(let trip=0;trip<5;trip++){
  const sources=world.scene.meshes.filter(mesh=>mesh.name.startsWith('cave-glow-source-')),before=sources.map(mesh=>({mesh,material:mesh.material,buffer:mesh.getMeshUniformBuffer()}));
  for(const source of sources){assert.equal(source.getTotalVertices(),4);assert.equal(source.getTotalIndices(),6);lookAtInstance(world,source.instances[0]);world.scene.render();assert.equal(source.material._activeEffect.isReady(),true);assert.strictEqual(source.getMeshUniformBuffer()._currentEffect,source.material._activeEffect);}
  replaceWorldMap(world,'warrior-v4');assert.strictEqual(world.camera,originalCamera);for(const old of before){assert.equal(old.mesh.isDisposed(),true);assert.equal(world.scene.materials.includes(old.material),false);}
  replaceWorldMap(world,'warrior-v5');assert.strictEqual(world.camera,originalCamera);const fresh=world.scene.meshes.filter(mesh=>mesh.name.startsWith('cave-glow-source-'));
  completeNullTextureUploads(world);
  assert.equal(fresh.length,2);for(const mesh of fresh){assert.equal(before.some(old=>old.mesh===mesh||old.buffer===mesh.getMeshUniformBuffer()),false);assert.equal(mesh.getMeshUniformBuffer()._currentEffect,undefined);}
 }
});
