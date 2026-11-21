import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,Mesh,AbstractMesh,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {PosedCloneMesh,posedBoundsStats,posedClone,canPosedClone} from '../src/posed-bounds.js';

const base=new URL('../public/assets/',import.meta.url),vector=v=>[v.x,v.y,v.z];
function bounds(mesh){
 const box=mesh.getBoundingInfo().boundingBox,sphere=mesh.getBoundingInfo().boundingSphere;
 return {minimum:vector(box.minimum),maximum:vector(box.maximum),minimumWorld:vector(box.minimumWorld),maximumWorld:vector(box.maximumWorld),centerWorld:vector(sphere.centerWorld),radiusWorld:sphere.radiusWorld,
  submeshes:mesh.subMeshes.map(s=>({range:[s.indexStart,s.indexCount],min:vector(s.getBoundingInfo().minimum),max:vector(s.getBoundingInfo().maximum)}))};
}
async function loaded(id){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('view',new Vector3(0,1,-8),scene);
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};
 const manifest=JSON.parse(readFileSync(new URL(id+'.json',base))),{gltf,files}=await readRuntimeGltf(new URL(manifest.model,base));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 return {engine,scene,loader,container};
}
const skinned=asset=>asset.meshes.filter(mesh=>mesh.getTotalVertices()>0);
const native=container=>{const instance=container.instantiateModelsToScene(name=>name,false,{doNotInstantiate:true});return {instance,meshes:[...new Set(instance.rootNodes.flatMap(root=>[root,...root.getDescendants(false)]))].filter(node=>node instanceof AbstractMesh&&node.getTotalVertices()>0)};};

test('monster body clones copy the first clone posed bounds and match the SDK clone',async t=>{
 for(const id of ['guardian-bear','hooded-goblin']){
  const f=await loaded(id);t.after(()=>{f.container.dispose();f.loader.dispose();f.scene.dispose();f.engine.dispose();});
  const reference=native(f.container),expected=reference.meshes.map(bounds);assert.ok(expected.length,id+' has skinned meshes');
  assert.ok(reference.meshes.every(mesh=>mesh.constructor===Mesh&&mesh._internalAbstractMeshDataInfo._positions?.length===mesh.getTotalVertices()),'the SDK clone builds a point per vertex');
  const before={...posedBoundsStats},times=[];
  for(let run=0;run<3;run++){
   const start=performance.now(),asset=instantiateBossModel(f.container);times.push(performance.now()-start);const meshes=skinned(asset);
   assert.equal(meshes.length,expected.length);
   meshes.forEach((mesh,index)=>{
    assert.ok(mesh instanceof PosedCloneMesh);assert.equal(mesh.getClassName(),'Mesh');assert.equal(mesh.geometry,reference.meshes[index].geometry,'geometry stays shared');
    assert.deepEqual(bounds(mesh),expected[index],id+' '+mesh.name+' run '+run);
    assert.equal(mesh._internalAbstractMeshDataInfo._positions??null,null,'no CPU point array');
    assert.notEqual(mesh.skeleton,f.container.skeletons[0],'independent skeleton');
   });
   for(const mesh of f.container.meshes)assert.equal(Object.hasOwn(mesh,'clone'),false,'the clone hook is removed after the call');
  }
  assert.equal(posedBoundsStats.computed-before.computed,expected.length,'computed once per geometry');
  assert.equal(posedBoundsStats.reused-before.reused,expected.length*2,'later clones reuse it');
  console.log(id,'clone ms',times.map(value=>value.toFixed(1)).join(' / '));
 }
});

test('a changed pose is computed again and a later SDK refresh is untouched',async t=>{
 const f=await loaded('guardian-bear');t.after(()=>{f.container.dispose();f.loader.dispose();f.scene.dispose();f.engine.dispose();});
 const asset=instantiateBossModel(f.container),body=skinned(asset).sort((a,b)=>b.getTotalVertices()-a.getTotalVertices())[0],skeleton=body.skeleton;assert.ok(skeleton);
 const rest=bounds(posedClone(body,'rest shell',body,true));
 // Move a bone that carries vertices: the silhouette of the moved body must not reuse the rest bounds.
 const nodes=skeleton.bones.map(bone=>bone.getTransformNode?.()).filter(Boolean);assert.ok(nodes.length,'bones are driven by nodes');
 nodes.forEach((node,index)=>{node.rotationQuaternion=(node.rotationQuaternion??Quaternion.Identity()).multiply(Quaternion.FromEulerAngles(.5+index%3*.2,.3,index%2*.4));});nodes[0].position.y+=.35;
 for(const bone of skeleton.bones)bone.getTransformNode?.()?.computeWorldMatrix(true);skeleton.prepare(true);
 const before={...posedBoundsStats},moved=posedClone(body,'moved shell',body,true),sdk=Mesh.prototype.clone.call(body,'sdk shell',body,true);
 assert.deepEqual(bounds(moved),bounds(sdk),'matches the SDK clone in the new pose');
 assert.notDeepEqual(bounds(moved).minimum.concat(bounds(moved).maximum),rest.minimum.concat(rest.maximum),'the pose really changed the bounds');
 assert.equal(posedBoundsStats.computed-before.computed,1);
 const again=posedClone(body,'moved shell 2',body,true);assert.deepEqual(bounds(again),bounds(sdk));assert.equal(posedBoundsStats.reused-before.reused,1,'the second shell in that pose reuses it');
 again.refreshBoundingInfo(true,true);assert.equal(again._internalAbstractMeshDataInfo._positions.length,again.getTotalVertices(),'an explicit refresh is the SDK one');
 assert.equal(canPosedClone(again),true);again.clone=function(...args){return Mesh.prototype.clone.apply(this,args);};assert.equal(canPosedClone(again),false,'a hooked mesh keeps its own cloning');
});
