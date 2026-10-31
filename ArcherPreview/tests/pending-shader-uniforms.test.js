import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,ShaderMaterial,Effect,FreeCamera,Vector3,TransformNode,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {WebGLPipelineContext} from '@babylonjs/core/Engines/WebGL/webGLPipelineContext.js';
import {bindCaveFogMaterial,caveFogFallback,readyShaderEffect} from '../src/cave-fog-binding.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {bindCaveRock} from '../src/cave-rock-shell.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';

const report={scope:'CPU/NullEngine regression using the actual Babylon 9.31 Effect prototype, WebGLPipelineContext and production fog/ink binders. Pending shader state is injected. No browser automation or physical iPhone/WebGL-driver claim.',baseline:{deviceLog:{revision:'e9e18b2',character:'warrior-v3',loadingSeconds:3.689,frames:52,failed:true,running:false,lastFrameError:"undefined is not an object (evaluating 'this._uniforms[e]')"},priorActualHelperProbe:{error:"Cannot read properties of undefined (reading 'caveFogActive')",stack:['WebGLPipelineContext.setFloat webGLPipelineContext.js:426:48','Effect.setFloat effect.pure.js:1035:31','bindCaveFogMaterial src/cave-fog-binding.js:16:143'],note:'Observed before the fix by calling the then-current helper with a real pending WebGLPipelineContext. This original log is retained; no old production source is reinstalled.'}},checks:{}};
const names=['caveFogActive','caveFogRect','cavePlayerView','caveBossView','caveFogMap','caveRockMap','caveRockToGamma'];
function save(){mkdirSync(new URL('../reports/ios-uniform-fix/',import.meta.url),{recursive:true});writeFileSync(new URL('../reports/ios-uniform-fix/uniform-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;
 const camera=new FreeCamera('uniform-camera',new Vector3(-5,4,13),scene);camera.target=new Vector3(-5,0,0);camera.setTarget(camera.target);scene.activeCamera=camera;
 const material=new ShaderMaterial('pending-uniform-regression',scene,{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;void main(){gl_Position=worldViewProjection*vec4(position,1.);}',fragmentSource:'precision highp float;void main(){gl_FragColor=vec4(1.);}'},{attributes:['position'],uniforms:['worldViewProjection',...names],samplers:['caveFogMap','caveRockMap']},false);
 const world={scene,camera,terrain:{heightAt:()=>0},ground:null,cave:false,touchDevice:true},f={engine,scene,camera,material,world,fogs:[],inks:[]};
 caveFogFallback(scene).getInternalTexture().isReady=true;
 t.after(()=>{for(const ink of f.inks)ink.dispose();for(const fog of f.fogs)fog.dispose();if(material._drawWrapper.effect?.uniformRegressionProbe)material._drawWrapper.setEffect(null);scene.dispose();engine.dispose();save();});return f;
}
function probe(label){
 const calls=[],values=new Map(),textures=new Map(),gpu={isDisposed:false,supportsUniformBuffers:false,getUniforms:(_p,n)=>n.map(name=>name),getAttributes:()=>[],setFloat:(name,value)=>{calls.push({kind:'float',name,value});values.set(name,value);return true;},setFloat4:(name,...value)=>{calls.push({kind:'vec4',name,value});values.set(name,value);return true;},setTexture:(slot,name,texture)=>{calls.push({kind:'texture',name,slot,texture:texture?.name});textures.set(name,texture);}};
 const pipeline=new WebGLPipelineContext();pipeline.engine=gpu;
 const effect=Object.create(Effect.prototype);Object.assign(effect,{uniformRegressionProbe:true,label,_pipelineContext:pipeline,_engine:gpu,_uniforms:{},_samplers:{},_isReady:false,_isDisposed:false});
 return {effect,pipeline,calls,values,textures,ready(){pipeline._fillEffectInformation(effect,{},names,effect._uniforms,['caveFogMap','caveRockMap'],effect._samplers,[],[]);effect._isReady=true;return this;}};
}
function install(f,p){f.material._drawWrapper.setEffect(p.effect);return p;}
function cave(f){const fog=new CaveFogRuntime(f.world,{isOpaque:()=>false});f.fogs.push(fog);f.world.cave=true;f.world.caveFog=fog;fog.texture.getInternalTexture().isReady=true;fog.update({x:-5,y:0,z:0},0,{force:true});assert.equal(fog.fog.ready,true);return fog;}

test('the original error requires an uninitialized WebGL pipeline uniform table, not a missing Effect',t=>{
 const p=probe('old-failure');assert.equal(p.effect.isReady(),false);assert.equal(p.pipeline._uniforms,undefined);
 let error;try{p.effect.setFloat('caveFogActive',0);}catch(e){error=e;}
 assert.ok(error instanceof TypeError);assert.match(error.message,/undefined/);assert.match(error.message,/caveFogActive/);assert.match(error.stack,/WebGLPipelineContext.setFloat/);assert.match(error.stack,/Effect.setFloat/);assert.equal(p.calls.length,0);
 report.baseline.reproducedWithActualClasses={error:error.message,stack:error.stack.split('\n').slice(0,4),effectExists:true,effectReady:false,pipelineUniforms:'undefined'};save();
});

test('village fallback queues values through 200 pending-variant frames without any uniform/texture GPU write',t=>{
 const f=fixture(t),p=install(f,probe('pending-village'));
 for(let frame=0;frame<200;frame++){bindCaveFogMaterial(f.scene,f.material);bindCaveFogMaterial(f.scene,f.material,p.effect);bindCaveRock(f.material,f.world);bindCaveRock(f.material,f.world,p.effect);}
 assert.equal(p.calls.length,0);assert.equal(p.pipeline._uniforms,undefined);assert.equal(f.material._floats.caveFogActive,0);assert.strictEqual(f.material._textures.caveFogMap,caveFogFallback(f.scene));assert.strictEqual(f.material._textures.caveRockMap,caveFogFallback(f.scene));assert.equal(readyShaderEffect(p.effect),null);
 report.checks.pendingVillage={frames:200,gpuCalls:0,queuedFogActive:f.material._floats.caveFogActive,uniformTableStillUninitialized:true};
});

test('ready effects receive explicit live binds while default calls and disposed-ready effects remain queue-only',t=>{
 const f=fixture(t),p=install(f,probe('ready-village').ready());
 bindCaveFogMaterial(f.scene,f.material);bindCaveRock(f.material,f.world);assert.equal(p.calls.length,0,'a ready getEffect does not turn a queue operation into GPU binding');
 bindCaveFogMaterial(f.scene,f.material,p.effect);bindCaveRock(f.material,f.world,p.effect);assert.equal(p.values.get('caveFogActive'),0);assert.equal(p.values.get('caveRockToGamma'),1);assert.strictEqual(p.textures.get('caveFogMap'),caveFogFallback(f.scene));assert.strictEqual(p.textures.get('caveRockMap'),caveFogFallback(f.scene));const good=p.calls.length;
 p.effect._isDisposed=true;assert.equal(p.effect.isReady(),true,'Babylon readiness can remain true after disposal');bindCaveFogMaterial(f.scene,f.material,p.effect);bindCaveRock(f.material,f.world,p.effect);assert.equal(p.calls.length,good);assert.equal(readyShaderEffect(p.effect),null);
 report.checks.readyAndDisposed={explicitReadyCalls:good,disposedAdditionalCalls:0,defaultReadyCalls:0};
});

test('fog activation, pending replacement variants and eight cave round trips never bind the previous mask or pipeline',t=>{
 const f=fixture(t),a=install(f,probe('variant-A').ready()),fallback=caveFogFallback(f.scene);let fog=cave(f);
 bindCaveFogMaterial(f.scene,f.material);assert.equal(a.calls.length,0);bindCaveFogMaterial(f.scene,f.material,a.effect);assert.equal(a.values.get('caveFogActive'),1);assert.deepEqual(a.values.get('cavePlayerView'),[-5,1.05,0,1]);assert.deepEqual(a.values.get('caveFogRect'),fog.rect.asArray());assert.strictEqual(a.textures.get('caveFogMap'),fog.texture);const aCount=a.calls.length;
 const b=install(f,probe('variant-B'));
 for(let frame=0;frame<100;frame++){bindCaveFogMaterial(f.scene,f.material);fog.bind(f.material);bindCaveFogMaterial(f.scene,f.material,b.effect);fog.bind(f.material,b.effect);}
 assert.equal(b.calls.length,0);assert.equal(a.calls.length,aCount);assert.strictEqual(f.material._textures.caveFogMap,fog.texture);
 b.ready();bindCaveFogMaterial(f.scene,f.material,b.effect);assert.equal(b.values.get('caveFogActive'),1);assert.strictEqual(b.textures.get('caveFogMap'),fog.texture);
 const inventories=[];
 for(let trip=0;trip<8;trip++){
  const old=fog.texture;fog.dispose();f.world.cave=false;bindCaveFogMaterial(f.scene,f.material);assert.strictEqual(f.material._textures.caveFogMap,fallback);bindCaveFogMaterial(f.scene,f.material,b.effect);assert.equal(b.values.get('caveFogActive'),0);assert.strictEqual(b.textures.get('caveFogMap'),fallback);assert.notStrictEqual(b.textures.get('caveFogMap'),old);
  assert.equal(f.scene.textures.length,1,'only the scene fallback remains after leaving');fog=cave(f);bindCaveFogMaterial(f.scene,f.material,b.effect);assert.equal(b.values.get('caveFogActive'),1);assert.strictEqual(b.textures.get('caveFogMap'),fog.texture);assert.notStrictEqual(fog.texture,old);assert.equal(f.scene.textures.length,2,'one current mask plus the shared fallback');inventories.push({trip,textures:f.scene.textures.length,observers:f.scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length});
 }
 assert.ok(inventories.every(i=>i.observers===inventories[0].observers));assert.equal(a.calls.length,aCount);
 report.checks.variantAndTravel={pendingFrames:100,pendingGpuCalls:0,retiredVariantAdditionalCalls:0,caveTrips:8,inventory:inventories,activeFog:1};
});

test('the actual village before-render observer can see a pending shared shader without binding it',t=>{
 const f=fixture(t),ink=new VillageOutlines(f.world,[],{});f.inks.push(ink);const p=probe('village-observer-pending');ink.material._drawWrapper.setEffect(p.effect);
 try{for(let i=0;i<100;i++)f.scene.onBeforeRenderObservable.notifyObservers(f.scene);assert.equal(p.calls.length,0);assert.equal(p.pipeline._uniforms,undefined);assert.equal(ink.material._floats.caveFogActive,0);}
 finally{ink.material._drawWrapper.setEffect(null);}
 report.checks.actualVillageObserver={frames:100,gpuCalls:0,uninitializedPipelineSafe:true};
});

test('the real village draw stage and character onBind update the current ready Effect during their first fogged draw',async t=>{
 const f=fixture(t),source=MeshBuilder.CreateBox('uniform-source',{size:2},f.scene);source.material=new StandardMaterial('uniform-source-material',f.scene);source.isVisible=false;
 const root=new TransformNode('uniform-instance-root',f.scene);root.position.x=-5;const instance=source.createInstance('uniform-visible-instance');instance.parent=root;instance.computeWorldMatrix(true);
 const bounds=instance.getBoundingInfo().boundingBox,record={root,meshes:[instance],placement:{kind:'rock',x:-5,z:0,asset:'uniform-source'},min:bounds.minimumWorld.clone(),max:bounds.maximumWorld.clone(),cellActive:true,fogVisible:true};
 const ink=new VillageOutlines(f.world,[record],{});f.inks.push(ink);const fog=cave(f);bindCaveFogMaterial(f.scene,ink.material);await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();const ready=ink.material.getEffect(),villageCalls=[],set=ready.setFloat.bind(ready);
 ready.setFloat=(name,value)=>{if(name==='caveFogActive')villageCalls.push({value,insideDraw:ink.drawing});return set(name,value);};
 f.scene.render();assert.ok(ink.stats.outlineDraws>0,'real hardware-instanced ink stage was submitted');assert.ok(villageCalls.some(c=>c.value===1&&c.insideDraw));assert.ok(villageCalls.every(c=>c.insideDraw),'before-render update does not write even to a ready shared effect');
 // The character callback runs after ShaderMaterial applied its cached values.
 // Its first cave draw must update the just-bound Effect immediately, without
 // waiting for a second frame to pick up the newly queued caveFogActive=1.
 const body=MeshBuilder.CreateBox('uniform-character',{size:1},f.scene);body.material=new StandardMaterial('uniform-character-material',f.scene);body.position.set(-5,1,1);const asset={meshes:[body]};attachCharacterOutlines(asset,'goblin');
 const outline=asset.meshes.find(m=>m.metadata?.moonforestOutline);assert.ok(outline);outline.material.setFloat('caveFogActive',0);bindCaveFogMaterial(f.scene,outline.material);await outline.material.forceCompilationAsync(outline);assert.equal(outline.material.isReadyForSubMesh(outline,outline.subMeshes[0],false),true);const effect=outline.subMeshes[0].effect;assert.ok(effect?.isReady());const characterCalls=[],put=effect.setFloat.bind(effect);effect.setFloat=(name,value)=>{if(name==='caveFogActive')characterCalls.push(value);return put(name,value);};
 outline.material.setFloat('caveFogActive',0);outline.material.bind(outline.getWorldMatrix(),outline,effect,outline.subMeshes[0]);assert.equal(characterCalls.at(-1),1,'first onBind writes current cave active flag to the actual bound effect');assert.strictEqual(outline.material._textures.caveFogMap,fog.texture);
 report.checks.actualDrawBindings={villageCalls,villageDraws:ink.stats.outlineDraws,characterFirstBindValues:characterCalls,firstFoggedDrawActive:1};
});
