import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {prepareMourningDeathDepth} from '../src/mourning-death-depth.js';
import {MOURNING_DEATH_DEPTH_DELTAS} from '../src/mourning-death-depth-data.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),mask=new Set(MOURNING_DEATH_DEPTH_DELTAS.filter((_,i)=>i%7===0)),facts=[];
let packed;
const hash=data=>createHash('sha256').update(Buffer.from(Float32Array.from(data).buffer)).digest('hex');
const prepare=asset=>MourningElenaEncounter.prototype.prepareAsset.call({asset});
async function fixture(t){
 packed??=readRuntimeGltf(new URL(config.model,base));const source=await packed,json=structuredClone(source.gltf);for(const b of json.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json},'');asset.addAllToScene();for(const group of asset.animationGroups)group.stop();
 const actor=new TransformNode('depth-test',scene),carrier=new TransformNode('depth-center',scene);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);for(const n of new Set([...asset.transformNodes,...asset.meshes]))if(!n.parent)n.parent=carrier;
 const body=asset.meshes.find(m=>m.name==='Elina_Chimera_Skin'),manager=body.morphTargetManager,target=manager.getTargetByName('Death_Ground_Contact');
 t.after(()=>{asset.dispose();scene.dispose();engine.dispose();});return{asset,actor,body,manager,target};
}

test('actual prepareAsset changes only the existing local death data; all base geometry, clips, other targets and live skin remain exact',async t=>{
 const {asset,actor,body,manager,target}=await fixture(t),animator=new MourningElenaAnimator(asset,config,actor);t.after(()=>animator.dispose());
 const targets=Array.from({length:manager.numTargets},(_,i)=>manager.getTarget(i)),originalTargets=targets.map(v=>[hash(v.getPositions()),hash(v.getNormals())]),positions=target.getPositions().slice(),normals=target.getNormals().slice(),geometry=[VertexBuffer.PositionKind,VertexBuffer.NormalKind,VertexBuffer.UVKind,VertexBuffer.MatricesIndicesKind,VertexBuffer.MatricesWeightsKind].map(kind=>hash(body.getVerticesData(kind))),indices=Array.from(body.getIndices()),clips=JSON.stringify(asset.animationGroups.map(g=>g.serialize()));
 const live=()=>{animator.reset();animator.transition('cast',{clipTime:.7});animator.update(.1);for(const s of asset.skeletons)s.prepare(true);assert.equal(target.influence,0);return[hash(body.getPositionData(true,true)),hash(body.getNormalsData(true,true))];};
 const beforeLive=live();prepare(asset);assert.equal(manager.numTargets,11);assert.deepEqual(live(),beforeLive);
 const changed=new Set();for(let i=0;i<positions.length;i++)if(positions[i]!==target.getPositions()[i]||normals[i]!==target.getNormals()[i])changed.add(Math.floor(i/3));assert.deepEqual(changed,mask);
 for(let i=0;i<targets.length;i++)if(targets[i]!==target)assert.deepEqual([hash(targets[i].getPositions()),hash(targets[i].getNormals())],originalTargets[i]);
 assert.deepEqual([VertexBuffer.PositionKind,VertexBuffer.NormalKind,VertexBuffer.UVKind,VertexBuffer.MatricesIndicesKind,VertexBuffer.MatricesWeightsKind].map(kind=>hash(body.getVerticesData(kind))),geometry);assert.deepEqual(Array.from(body.getIndices()),indices);assert.equal(JSON.stringify(asset.animationGroups.map(g=>g.serialize())),clips);
 facts.push({case:'scope',bodyVertices:body.getTotalVertices(),changedVertices:changed.size,newTargets:0,bodyTargets:manager.numTargets,allocatedPositionNormalBytes:target.getPositions().byteLength+target.getNormals().byteLength,otherTargetHashesExact:true,baseGeometryAndNativeClipsExact:true,liveSkinAndNormalsExact:true});
});

test('prepareAsset respects an outer freeze and once-only identity across repeated summons and SDK shared-buffer clones',async t=>{
 const {asset,manager,target}=await fixture(t);let synchronizations=0;const synchronize=manager.synchronize.bind(manager);manager.synchronize=()=>{synchronizations++;return synchronize();};
 manager.areUpdatesFrozen=true;const frozenDepth=manager._blockCounter;prepare(asset);assert.equal(manager._blockCounter,frozenDepth);assert.equal(synchronizations,0);manager.areUpdatesFrozen=false;assert.equal(synchronizations,1);
 const positions=target.getPositions(),normals=target.getNormals();for(let i=0;i<20;i++)prepare(asset);assert.strictEqual(target.getPositions(),positions);assert.strictEqual(target.getNormals(),normals);assert.equal(synchronizations,1);
 const clone=manager.clone(),cloneTarget=clone.getTargetByName(target.name);t.after(()=>clone.dispose());assert.strictEqual(cloneTarget.getPositions(),positions);assert.strictEqual(cloneTarget.getNormals(),normals);
 clone.areUpdatesFrozen=true;assert.equal(prepareMourningDeathDepth(clone,[{name:'Elina_Chimera_Skin',morphTargetManager:clone,getTotalVertices:()=>36196}]),false);clone.areUpdatesFrozen=false;assert.strictEqual(cloneTarget.getPositions(),positions);
 facts.push({case:'idempotency',summons:20,synchronizations,outerFreezeDepthPreserved:true,sharedCloneDoublePatch:false});
});

test('a failed target setter rolls back both buffers and permits a clean retry without leaking the manager freeze',async t=>{
 const {asset,manager,target}=await fixture(t),positions=target.getPositions(),normals=target.getNormals(),dirty=manager._mustSynchronize,setNormals=target.setNormals;let failures=1;
 target.setNormals=function(data){if(failures-- >0)throw new Error('injected normal setter failure');return setNormals.call(this,data);};
 assert.throws(()=>prepare(asset),/injected/);assert.strictEqual(target.getPositions(),positions);assert.strictEqual(target.getNormals(),normals);assert.equal(manager.areUpdatesFrozen,false);assert.equal(manager._mustSynchronize,dirty);
 prepare(asset);assert.notStrictEqual(target.getPositions(),positions);assert.notStrictEqual(target.getNormals(),normals);assert.equal(manager.areUpdatesFrozen,false);facts.push({case:'rollback',bothOriginalArraysRestored:true,retryApplied:true});
});

test('disposing one asset does not suppress the same correction on a newly loaded target',async t=>{
 const first=await fixture(t);prepare(first.asset);const expected=hash(first.target.getPositions());first.asset.dispose();const second=await fixture(t);assert.notEqual(hash(second.target.getPositions()),expected);prepare(second.asset);assert.equal(hash(second.target.getPositions()),expected);facts.push({case:'disposed-reload',newIdentityPatched:true});
});

test('actual final death preserves the original custom-normal hemisphere instead of replacing it with reconstructed face normals',async t=>{
 const {asset,actor,body}=await fixture(t),animator=new MourningElenaAnimator(asset,config,actor);t.after(()=>animator.dispose());animator.transition('cast',{clipTime:1.2});animator.update(.1);animator.transition('dead');for(let frame=0;frame<156;frame++)animator.update(1/30);for(const skeleton of asset.skeletons)skeleton.prepare(true);
 const before=body.getNormalsData(true,true).slice();prepare(asset);const after=body.getNormalsData(true,true);let minimumNormalDot=1;
 for(let i=0;i<before.length;i+=3){if(!mask.has(i/3)){for(let axis=0;axis<3;axis++)assert.equal(after[i+axis],before[i+axis]);continue;}const dot=(before[i]*after[i]+before[i+1]*after[i+1]+before[i+2]*after[i+2])/(Math.hypot(...before.slice(i,i+3))*Math.hypot(...after.slice(i,i+3)));minimumNormalDot=Math.min(minimumNormalDot,dot);}
 assert.ok(minimumNormalDot>.45,'authored normals must not flip on locally stable geometry: '+minimumNormalDot);facts.push({case:'authored-custom-normals',minimumNormalDot,outsideMaskNormalsExact:true});
});

test('prepared death skin stays above the floor throughout the sampled 5.2 seconds and resets its existing influence on revival',async t=>{
 const {asset,actor,body,target}=await fixture(t);prepare(asset);const animator=new MourningElenaAnimator(asset,config,actor);t.after(()=>animator.dispose());animator.transition('cast',{clipTime:1.2});animator.update(.1);animator.transition('dead');
 let minimumSkinY=Infinity,maximumCorrectedVertexStep=0,previous;
 for(let frame=0;frame<=156;frame++){
  if(frame)animator.update(1/30);for(const skeleton of asset.skeletons)skeleton.prepare(true);const positions=body.getPositionData(true,true),world=body.computeWorldMatrix(true),matrix=world.m;
  for(let i=0;i<positions.length;i+=3)minimumSkinY=Math.min(minimumSkinY,positions[i]*matrix[1]+positions[i+1]*matrix[5]+positions[i+2]*matrix[9]+matrix[13]);
  const current=[];for(const i of mask){const at=i*3;current.push(positions[at],positions[at+1],positions[at+2]);}if(previous)for(let i=0;i<current.length;i+=3)maximumCorrectedVertexStep=Math.max(maximumCorrectedVertexStep,Math.hypot(current[i]-previous[i],current[i+1]-previous[i+1],current[i+2]-previous[i+2])*Math.hypot(matrix[0],matrix[1],matrix[2]));previous=current;
 }
 assert.ok(minimumSkinY>=-.01,'actual body penetration: '+minimumSkinY);assert.ok(maximumCorrectedVertexStep<.2,'unexpected single-frame local jump: '+maximumCorrectedVertexStep);assert.equal(target.influence,1);animator.reset();assert.equal(target.influence,0);facts.push({case:'whole-death-skin',frames:157,minimumSkinY,maximumCorrectedVertexStepAt30Hz:maximumCorrectedVertexStep,revivalInfluence:target.influence});
});

test.after(()=>{const folder=new URL('../reports/mourning-death-knee-2026-11-03/r3/runtime-final/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('patch-validation.json',folder),JSON.stringify({scope:'Actual Babylon SDK buffers and prepareAsset lifecycle; NullEngine is not GPU shader compilation.',facts},null,2)+'\n');});
