import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,MeshBuilder,AssetContainer,AnimationGroup,PBRMaterial,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateStaticMap} from '../src/static-map-instances.js';

test('every shipped static map LOD preserves geometry, transforms, material, bounds and instance semantics',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>engine.dispose());
 const base=new URL('../public/assets/',import.meta.url),paths=new Set();
 for(const name of ['village.json','monster-forest.json','witch-cave.json']){
  const manifest=JSON.parse(readFileSync(new URL(name,base)));
  for(const asset of Object.values(manifest.assets))for(const lod of asset.lods??[])paths.add(lod.model);
 }
 let regularMs=0,optimizedMs=0,meshes=0;
 for(const path of paths){
  const source=await readRuntimeGltf(new URL(path,base)),gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const c=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  const m=new PBRMaterial('source-material',scene);for(const mesh of c.meshes)if(mesh.getTotalVertices())mesh.material=m;
  const parent=new TransformNode('placement',scene);parent.position.set(21,3,-9);parent.rotationQuaternion=Quaternion.FromEulerAngles(.1,2.1,-.05);parent.scaling.set(1.4,.8,1.1);
  let time=performance.now();const a=c.instantiateModelsToScene(n=>n,false,{doNotInstantiate:false});regularMs+=performance.now()-time;
  time=performance.now();const b=instantiateStaticMap(c,n=>n);optimizedMs+=performance.now()-time;
  for(const instance of [a,b])for(const r of instance.rootNodes)r.parent=parent;
  const nodes=i=>i.rootNodes.flatMap(r=>[r,...r.getDescendants(false)]),aa=nodes(a),bb=nodes(b);assert.equal(aa.length,bb.length,path);
  for(let i=0;i<aa.length;i++){
   const x=aa[i],y=bb[i];assert.equal(x.name,y.name,path);assert.equal(x.getClassName(),y.getClassName());
   const xx=x.computeWorldMatrix(true).asArray(),yy=y.computeWorldMatrix(true).asArray();for(let k=0;k<16;k++)assert.ok(Math.abs(xx[k]-yy[k])<1e-6,path);
   assert.equal(x.isEnabled(),y.isEnabled());assert.equal(x.visibility,y.visibility);assert.equal(x.isVisible,y.isVisible);
   if(x.getTotalVertices?.()){meshes++;assert.equal(x.sourceMesh,y.sourceMesh);assert.equal(x.material,y.material);assert.equal(x.getTotalVertices(),y.getTotalVertices());assert.deepEqual(x.getBoundingInfo().boundingBox.minimumWorld.asArray(),y.getBoundingInfo().boundingBox.minimumWorld.asArray());assert.deepEqual(x.subMeshes.map(s=>[s.indexStart,s.indexCount,s.materialIndex]),y.subMeshes.map(s=>[s.indexStart,s.indexCount,s.materialIndex]));}
  }
  for(const i of [a,b])for(const r of i.rootNodes)r.dispose();parent.dispose();c.dispose();m.dispose();loader.dispose();
 }
 assert.ok(paths.size>=90);const out=new URL('../reports/map-material-size-2026-11-02/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('static-instance-validation.json',out),JSON.stringify({models:paths.size,meshes,regularMs,optimizedMs,scope:'Node NullEngine CPU instantiation only, same geometry and material identity; no GPU/device timing'},null,2));
});
test('animated and non-identity-pivot containers retain the generic instantiation path',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 for(const animated of [true,false]){const c=new AssetContainer(scene),root=new TransformNode('root',scene),mesh=MeshBuilder.CreateBox('mesh',{},scene);mesh.parent=root;c.transformNodes.push(root);c.meshes.push(mesh);if(animated)c.animationGroups.push(new AnimationGroup('animation',scene));else root.billboardMode=1;let calls=0;const original=c.instantiateModelsToScene.bind(c);c.instantiateModelsToScene=(...args)=>{calls++;return original(...args);};const i=instantiateStaticMap(c,n=>n);assert.equal(calls,1);for(const r of i.rootNodes)r.dispose();c.dispose();}engine.dispose();
});
