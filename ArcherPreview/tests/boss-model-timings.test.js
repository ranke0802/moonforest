import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
const base=new URL('../public/assets/',import.meta.url);
for(const id of ['guardian-bear','hooded-goblin','elena','mourning-elena'])test(`actual ${id} timing preserves independent clones from the cached clean source`,async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,d,f,m,i,s,c,type)=>{const texture=engine.createRawTexture(data,w,h,f,m,i,s,c,type);texture.depth=d;texture.is2DArray=true;return texture;};
 const config=JSON.parse(readFileSync(new URL(id+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();
 const library=new BossModelLibrary(scene,id);Object.assign(library,{config,container,load:async()=>{}});
 t.after(()=>{container.dispose();loader.dispose();scene.dispose();engine.dispose();});
 const a=await library.instantiate(),b=await library.instantiate();
 assert.equal(a.modelTimings.mode,'clone');assert.equal(b.modelTimings.mode,'clone');
 assert.deepEqual(a.modelTimings.steps.map(s=>s.name),['model-clone','node-collection']);assert.deepEqual(b.modelTimings.steps.map(s=>s.name),['model-clone','node-collection']);
 for(const step of [...a.modelTimings.steps,...b.modelTimings.steps])assert.ok(Number.isFinite(step.ms)&&step.ms>=0);
 assert.notStrictEqual(a.asset,b.asset);assert.notStrictEqual(a.asset.skeletons[0],b.asset.skeletons[0]);
 const bodies=[a.asset.meshes.find(m=>m.getTotalVertices()>0),b.asset.meshes.find(m=>m.getTotalVertices()>0)];assert.notStrictEqual(bodies[0],bodies[1]);assert.strictEqual(bodies[0].geometry,bodies[1].geometry);
 for(let i=0;i<a.asset.animationGroups.length;i++){
  const ga=a.asset.animationGroups[i],gb=b.asset.animationGroups[i];assert.notStrictEqual(ga,gb);assert.equal(ga.targetedAnimations.length,gb.targetedAnimations.length);
  for(let j=0;j<ga.targetedAnimations.length;j++){assert.notStrictEqual(ga.targetedAnimations[j].target,gb.targetedAnimations[j].target);assert.strictEqual(ga.targetedAnimations[j].animation,gb.targetedAnimations[j].animation);}
 }
});
