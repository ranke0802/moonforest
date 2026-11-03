import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {MOURNING_DEATH_KNEE_BONES} from '../src/mourning-death-knee.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),facts=[];let packed;
const error=(a,b)=>Math.min(Math.hypot(...a.asArray().map((v,i)=>v-b.asArray()[i])),a instanceof Quaternion?Math.hypot(...a.asArray().map((v,i)=>v+b.asArray()[i])):Infinity);
async function fixture(t){
 packed??=readRuntimeGltf(new URL(config.model,base));const source=await packed,json=structuredClone(source.gltf);for(const b of json.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json},'');asset.addAllToScene();
 const actor=new TransformNode('knee-test',scene),carrier=new TransformNode('knee-center',scene);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);for(const n of new Set([...asset.transformNodes,...asset.meshes]))if(!n.parent)n.parent=carrier;
 MourningElenaEncounter.prototype.prepareAsset.call({asset});const animator=new MourningElenaAnimator(asset,config,actor);t.after(()=>{animator.dispose();asset.dispose();scene.dispose();engine.dispose();});return {asset,actor,animator};
}
test('single-knee correction changes exactly three copied death rotations, preserving every other native channel and the asset clips',async t=>{
 const {asset,animator}=await fixture(t),group=asset.animationGroups.find(g=>g.name==='Chimera_Death_Lament_5p2s'),original=group.targetedAnimations.map(c=>c.animation.getKeys().map(k=>k.value.asArray?.()??k.value)),changed=new Set();let compared=0;
 for(const c of animator.deathChannels){const native=group.targetedAnimations.find(a=>a.target===c.target&&a.animation.targetProperty===c.property).animation;for(const time of[0,.09,.18,.4,.55,1.115,2.017,3,5.2]){const difference=error(c.track.sample(time),native.evaluate(time*c.track.fps));if(difference>3e-6)changed.add(c.target.name+':'+c.property);if(!MOURNING_DEATH_KNEE_BONES.includes(c.target.name)||c.property!=='rotationQuaternion'){assert.ok(difference<3e-6,c.target.name);compared++;}if(time<=.4)assert.ok(difference<3e-6,'initial original lament connection');}}
 assert.deepEqual([...changed].sort(),MOURNING_DEATH_KNEE_BONES.map(n=>n+':rotationQuaternion').sort());assert.deepEqual(group.targetedAnimations.map(c=>c.animation.getKeys().map(k=>k.value.asArray?.()??k.value)),original,'native AnimationGroups are not edited');facts.push({case:'three-local-rotation-only',unchangedChannelSamples:compared,changed:[...changed]});
});
function floorStats(asset){
 const mesh=asset.meshes.find(m=>m.name==='Elina_Chimera_Skin');for(const s of asset.skeletons)s.prepare(true);const positions=mesh.getPositionData(true,true),indices=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind),weights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind),footIds=new Set(mesh.skeleton.bones.filter(b=>/^DEF_FrontFoot.R_(Foot|Toe)/.test(b.name)).map(b=>b.getIndex())),knee=asset.transformNodes.find(n=>n.name==='DEF_FrontFoot.R_Shin').getAbsolutePosition(),world=mesh.computeWorldMatrix(true),p=new Vector3();let bodyMin=Infinity,footMin=Infinity,kneeMin=Infinity;
 for(let i=0;i<positions.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(positions[i],positions[i+1],positions[i+2],world,p);bodyMin=Math.min(bodyMin,p.y);let footWeight=0;for(let c=0;c<4;c++)if(footIds.has(indices[i/3*4+c]))footWeight+=weights[i/3*4+c];if(footWeight>.75)footMin=Math.min(footMin,p.y);if(Vector3.DistanceSquared(p,knee)<.4*.4)kneeMin=Math.min(kneeMin,p.y);}
 return {bodyMin,footMin,kneeMin};
}
test('actual prepared 4.5m skin bends the viewer-right leg with smooth cast/death entry, no floor penetration and a stable held pose',async t=>{
 const {asset,actor,animator}=await fixture(t),foot=asset.transformNodes.find(n=>n.name==='DEF_FrontFoot.R_Foot'),knee=asset.transformNodes.find(n=>n.name==='DEF_FrontFoot.R_Shin');let maximumFootMetresPerSecond=0;
 for(const fps of[30,60])for(const state of['idle','cast','cast_slam','cast_alternate']){
  animator.reset();animator.transition('walk');animator.update(.41);animator.transition(state,{clipTime:1.22});animator.update(.05);const start=animator.deathChannels.map(c=>c.target[c.property].clone());animator.transition('dead');animator.sample(0);animator.deathChannels.forEach((c,i)=>assert.ok(error(c.target[c.property],start[i])<1e-6,'death starts from the captured live pose'));
  let previous=foot.getAbsolutePosition().clone();for(let frame=0;frame<5.2*fps;frame++){animator.update(1/fps);const at=foot.getAbsolutePosition();maximumFootMetresPerSecond=Math.max(maximumFootMetresPerSecond,Vector3.Distance(previous,at)*fps);previous.copyFrom(at);assert.ok(at.asArray().every(Number.isFinite));assert.equal(animator.ensurePoseCurrent(),false,'normal sampler matrices are already current');}
  assert.equal(animator.deathTime,5.2);assert.ok(knee.getAbsolutePosition().x>1,'reference front view has this knee on screen right');const stats=floorStats(asset);assert.ok(stats.bodyMin>=-.01,'skin must not sink below the floor');assert.ok(stats.footMin>=-.01,'foot must not penetrate the floor');assert.ok(stats.kneeMin>=-.01,'knee must not penetrate the floor');
  const held=animator.deathChannels.map(c=>c.target[c.property].asArray());animator.update(4.8);assert.deepEqual(animator.deathChannels.map(c=>c.target[c.property].asArray()),held);facts.push({case:'prepared-skin-no-penetration',fps,from:state,...stats});
 }
 assert.ok(maximumFootMetresPerSecond<7.2,'a visible one-frame foot pop: '+maximumFootMetresPerSecond);
 const old=knee.getAbsolutePosition().clone();actor.position.x+=.43;assert.equal(animator.ensurePoseCurrent(),true);assert.ok(Math.abs(knee.getAbsolutePosition().x-old.x-.43)<1e-5);assert.equal(animator.ensurePoseCurrent(),false);facts.push({case:'continuity',maximumFootMetresPerSecond,per60HzFrameMetres:maximumFootMetresPerSecond/60});
});
test.after(()=>{const folder=new URL('../reports/mourning-death-knee-2026-11-03/r3/runtime-final/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('pose-validation.json',folder),JSON.stringify({scope:'Actual prepared runtime rig/skin CPU verification; original source data and 10-second lifecycle tested separately.',facts},null,2)+'\n');});
