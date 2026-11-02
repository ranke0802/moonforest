import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial,TransformNode,ShaderMaterial} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {readMapContainer} from '../src/map-container.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {currentFrameReadiness,waitForSceneReady} from '../src/scene-ready.js';
import {createMapTransition} from '../src/map-transition.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {CharacterAnimator} from '../src/animation.js';

const results=[],tick=()=>new Promise(r=>setTimeout(r,0)),base=new URL('../public/assets/',import.meta.url);
function readyRaw(scene){for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;}
function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new FreeCamera('arrival',new Vector3(-5,3,8),scene);camera.setTarget(new Vector3(-5,.8,0));
 const world={scene,camera,terrain:{heightAt:()=>0},ground:null,cave:false,touchDevice:true},fogs=[];
 caveFogFallback(scene);readyRaw(scene);t.after(()=>{for(const f of fogs)f.dispose();scene.dispose();engine.dispose();});
 const cave=()=>{const fog=new CaveFogRuntime(world,{isOpaque:()=>false});world.cave=true;world.caveFog=fog;fog.update({x:-5,y:0,z:0},0,{force:true});fogs.push(fog);readyRaw(scene);return fog;};
 const outline=name=>{const mesh=MeshBuilder.CreateBox(name,{},scene);mesh.position.x=-5;mesh.material=new StandardMaterial(name+' paint',scene);mesh.material.disableLighting=true;return attachCharacterOutlines({meshes:[mesh]},'warrior')[0];};
 return {engine,scene,world,camera,cave,outline};
}
async function renderReady(scene){
 // Only emulate RawTexture GPU allocation readiness, never sampler rebinding.
 readyRaw(scene);scene.render();await waitForSceneReady(scene,{timeoutMs:2000,wait:tick});scene.render();
}
const inventory=scene=>({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,pending:scene.getWaitingItemsCount(),before:scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,after:scene.onAfterRenderObservable.observers.filter(o=>!o._willBeUnregistered).length});

test('actual shield/sword draw callbacks survive cave exit without a manual sampler repair or skipped readiness check',async t=>{
 const f=fixture(t),shells=[f.outline('Bunnyguard_Shield'),f.outline('Golden_Oathblade')],fog=f.cave();await renderReady(f.scene);
 assert.ok(shells.every(s=>s.material._textures.caveFogMap===fog.texture));const mask=fog.texture;
 fog.dispose();f.world.cave=false;assert.equal(mask.getInternalTexture(),null);await renderReady(f.scene);
 const state=currentFrameReadiness(f.scene);assert.equal(state.ready,true);assert.deepEqual(state.blockers,[]);
 for(const shell of shells){assert.equal(shell.material._textures.caveFogMap,caveFogFallback(f.scene));assert.equal(shell.material._floats.caveFogActive,0);assert.ok(state.meshes.includes(shell.name));}
 assert.equal(fog.shaderDisposals.size,0);results.push({case:'reported-shield-sword-stale-mask',passed:true,blockers:state.blockers});
});

test('shipped player geometry/rig/idle and both weapon outlines remain ready across 12 cave outdoor cycles',async t=>{
 const f=fixture(t),old=MeshoptCompression._Default;await MeshoptDecoder.ready;
 MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{const value=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(value,count,stride,data,mode,filter);return value;}};
 t.after(()=>{MeshoptCompression._Default=old;});
 const config=JSON.parse(readFileSync(new URL('warrior-v3-ios.json',base))),model=new URL(config.model,base),json=JSON.parse(readFileSync(model));
 for(const b of json.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+readFileSync(new URL(b.uri,model)).toString('base64');
 const asset=await readMapContainer(f.scene,json,'',{skipMaterials:true,fileName:model.pathname.split('/').at(-1)});asset.addAllToScene();
 const actor=new TransformNode('retained-player',f.scene);actor.position.set(-5,0,0);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=actor;
 configurePlayerSize(actor,config,{warrior:true});const paint=new StandardMaterial('texture-upload-boundary',f.scene);paint.disableLighting=true;
 for(const mesh of asset.meshes)if(mesh.getTotalVertices()){mesh.material=paint;mesh.alwaysSelectAsActiveMesh=true;if(mesh.skeleton){mesh.numBoneInfluencers=mesh.isVerticesDataPresent('matricesWeightsExtra')?8:4;mesh.skeleton.useTextureToStoreBoneMatrices=true;}}
 const shells=attachCharacterOutlines(asset,'warrior');assert.equal(shells.length,2);
 const animator=new CharacterAnimator(asset.animationGroups,config.animations);animator.transition('idle',{clipTime:0,loop:true});animator.update(0);t.after(()=>animator.dispose());
 const rows=[],plateaus=new Map();for(let cycle=0;cycle<12;cycle++){
  const fog=f.cave();await renderReady(f.scene);const mask=fog.texture;
  const caveInventory=inventory(f.scene);if(plateaus.has('cave'))assert.deepEqual(caveInventory,plateaus.get('cave'));else plateaus.set('cave',caveInventory);
  fog.dispose();f.world.cave=false;const start=performance.now();await renderReady(f.scene);const ms=performance.now()-start;
  for(const shell of shells)assert.notEqual(shell.material._textures.caveFogMap,mask);
  const outsideInventory=inventory(f.scene);if(plateaus.has('outdoor'))assert.deepEqual(outsideInventory,plateaus.get('outdoor'));else plateaus.set('outdoor',outsideInventory);
  assert.equal(fog.shaderDisposals.size,0);assert.equal(config.textureProfile.maxSize,8192);assert.equal(actor.metadata.playerDimensions.height,1.6);
  rows.push({cycle:cycle+1,outdoorReadyMs:ms,cave:caveInventory,outdoor:outsideInventory});
 }
 results.push({case:'shipped-player-mask-lifecycle',passed:true,cycles:rows,model:config.model,modelHash:createHash('sha256').update(readFileSync(model)).digest('hex'),plateaus:Object.fromEntries(plateaus),limits:'Actual geometry, weights, idle and outlines; original texture images/GPU upload replaced with an unlit material in NullEngine. These wall times are not device load times.'});
});

test('removed and hidden pooled shader materials release mask references and do not accumulate disposal observers',async t=>{
 const f=fixture(t),shell=f.outline('Bunnyguard_Shield'),fog=f.cave();await renderReady(f.scene);const material=shell.material;
 const observerCount=()=>material.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length;
 const count=observerCount();for(let i=0;i<100;i++)fog.bind(material);assert.equal(observerCount(),count);assert.equal(fog.shaderDisposals.size,1);
 f.scene.removeMaterial(material);shell.setEnabled(false);fog.dispose();
 assert.equal(material._textures.caveFogMap,caveFogFallback(f.scene),'pooled materials outside scene.materials are also detached');assert.equal(fog.shaderDisposals.size,0);assert.equal(observerCount(),count-1);
 f.scene.addMaterial(material);shell.setEnabled(true);await renderReady(f.scene);
 const next=f.cave(),other=new ShaderMaterial('temporary',f.scene,{vertexSource:'',fragmentSource:''},{samplers:['caveFogMap']});next.bind(other);assert.ok(next.shaderDisposals.has(other));other.dispose();assert.equal(next.shaderDisposals.has(other),false);
 results.push({case:'hidden-pool-and-observer-lifetime',passed:true});
});

test('late old fog callbacks cannot restore an old mask or overwrite a newer owner',async t=>{
 const f=fixture(t),shell=f.outline('Bunnyguard_Shield'),old=f.cave();await renderReady(f.scene);old.dispose();
 const next=f.cave();await renderReady(f.scene);old.bind(shell.material);assert.equal(shell.material._textures.caveFogMap,next.texture);assert.equal(old.shaderDisposals.size,0);assert.equal(next.shaderDisposals.size,1);
 next.dispose();old.bind(shell.material);assert.equal(shell.material._textures.caveFogMap,caveFogFallback(f.scene));assert.equal(shell.material._floats.caveFogActive,0);
 results.push({case:'late-old-map-bind',passed:true});
});

test('a genuine screen timeout remains finite, reports retryable state, then an explicit map retry restores live outline readiness',async t=>{
 const f=fixture(t),shell=f.outline('Bunnyguard_Shield');let fog=f.cave();await renderReady(f.scene);
 const original=shell.material.isReadyForSubMesh,seen=[];let first=true,attempts=0;
 const transition=createMapTransition({prepare(){},frame:tick,release:async()=>{fog?.dispose();fog=null;},load:async()=>{
  attempts++;if(first){shell.material.isReadyForSubMesh=()=>false;let time=0;await waitForSceneReady(f.scene,{timeoutMs:45000,now:()=>time,wait:async()=>{time+=15000;}});}
  await renderReady(f.scene);
 },finish:async()=>{},onError:error=>seen.push({name:error.name,...transition.inspect()})});
 assert.equal(await transition.travel('forest'),false);assert.equal(attempts,1);assert.equal(seen[0].busy,false);assert.equal(seen[0].retryAvailable,true);assert.equal(seen[0].name,'TimeoutError');assert.equal(seen[0].lastFailure.timeoutMs,45000);
 first=false;shell.material.isReadyForSubMesh=original;assert.equal(await transition.retry(),true);assert.equal(attempts,2);assert.equal(transition.inspect().phase,'complete');assert.equal(transition.inspect().lastFailure.recovered,true);assert.equal(currentFrameReadiness(f.scene).ready,true);assert.equal(f.scene.getWaitingItemsCount(),0);
 results.push({case:'screen-timeout-explicit-retry',passed:true,attempts,automaticRetries:0});
});

test.after(()=>{const dir=new URL('../reports/map-screen-unblock-2026-11-02/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('screen-validation.json',dir),JSON.stringify({base:'f32eb85',passed:results.length===5,cases:results,sourceHashes:Object.fromEntries(['cave-fog-runtime.js','map-transition.js','scene-ready.js'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')])),browserAutomation:false,limits:['NullEngine and controlled asynchronous boundaries; no actual device GPU, WebGL image output or mobile end-to-end timing measurement.','Scene/resource/observer plateaus are bounded ownership evidence, not a promise about immediate OS/GPU memory reclamation.']},null,2)+'\n');});
