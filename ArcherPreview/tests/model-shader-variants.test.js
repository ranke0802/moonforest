import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,MultiMaterial,SubMesh,ArcRotateCamera,Vector3,Color4,RenderTargetTexture,DirectionalLight,ShadowGenerator,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {prepareModelShaders} from '../src/boss-shader-warmup.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {cameraRenderPass,hardwareInstancesForSubMesh,readMaterialVariant,withRenderPass} from '../src/render-variant-state.js';
import {inspectPreparedEffects} from '../src/prepared-effect-lifetime.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);Object.assign(engine.getCaps(),{instancedArrays:true,textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096,texture2DArrayMaxLayerCount:256});
 const raw=engine.createRawTexture.bind(engine);engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=raw(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};engine.updateRawTexture2DArray=()=>{};
 const camera=new ArcRotateCamera('variant-camera',0,1,10,Vector3.Zero(),scene),outside=engine.createRenderPassId('outside-warmup');engine.currentRenderPassId=outside;
 t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene,camera,outside};
}
const prepare=asset=>prepareModelShaders(asset,{preparation:createBossPreparation({incremental:false,timeoutMs:4000})});
const programs=engine=>new Set(Object.values(engine._compiledEffects));
function assertWarm(mesh,{instances,visibility=1,defines=[]}={}){
 mesh.visibility=visibility;
 for(const sub of mesh.subMeshes){const result=readMaterialVariant(mesh,sub,{instances,pass:cameraRenderPass(mesh.getScene())});assert.equal(result.ready,true);assert.ok(result.effect?.isReady());for(const pattern of defines)assert.match(result.effect.defines,pattern);}
}

test('unmarked frozen PBR prepares opaque and future hardware instance variants in the real camera output pass',async t=>{
 const f=fixture(t),mesh=MeshBuilder.CreateBox('unmarked-player-or-prop',{},f.scene),paint=new PBRMaterial('unmarked-paint',f.scene);paint.unlit=true;mesh.material=paint;assert.equal(mesh.metadata,null);paint.freeze();
 const output=new RenderTargetTexture('camera-output',32,f.scene);f.camera.outputRenderTarget=output;const pass=output.renderPassId;assert.notEqual(pass,f.camera.renderPassId);
 await prepare({meshes:[mesh]});const prepared=programs(f.engine);assert.ok(prepared.size>=2);assert.equal(paint.isFrozen,true);assert.equal(f.engine.currentRenderPassId,f.outside);assert.ok(mesh.subMeshes[0]._getDrawWrapper(pass,false)?.effect);
 assertWarm(mesh,{instances:true,defines:[/#define INSTANCES/]});assertWarm(mesh,{instances:false});assert.deepEqual(programs(f.engine),prepared);assert.equal(paint.isFrozen,true);assert.equal(f.engine.currentRenderPassId,f.outside);
});

test('actual instanced custom-buffer MultiMaterial body reuses both submaterials and opacity variants without new programs',async t=>{
 const f=fixture(t),mesh=MeshBuilder.CreateBox('instanced-body',{},f.scene),multi=new MultiMaterial('two-surfaces',f.scene);for(let i=0;i<2;i++){const paint=new PBRMaterial('paint-'+i,f.scene);paint.unlit=true;if(i)paint.backFaceCulling=false;multi.subMaterials.push(paint);}mesh.material=multi;mesh.subMeshes=[];new SubMesh(0,0,mesh.getTotalVertices(),0,18,mesh);new SubMesh(1,0,mesh.getTotalVertices(),18,18,mesh);
 mesh.metadata={moonforestEnemyFade:true};mesh.registerInstancedBuffer('variantTint',4);mesh.instancedBuffers.variantTint=new Color4(1,1,1,1);const instance=mesh.createInstance('actual-instance');instance.instancedBuffers.variantTint=new Color4(.8,1,1,1);mesh._registerInstanceForRenderId(instance,f.scene.getRenderId());
 assert.equal(withRenderPass(f.scene,cameraRenderPass(f.scene),()=>hardwareInstancesForSubMesh(mesh,mesh.subMeshes[0])),true);
 await prepare({meshes:[mesh]});const prepared=programs(f.engine);assert.equal(mesh.visibility,1);assert.ok(mesh.subMeshes.every(sub=>sub._getDrawWrapper(cameraRenderPass(f.scene),false)?.effect));
 for(const visibility of [.5,1])for(const instances of [true,false])assertWarm(mesh,{instances,visibility,defines:instances?[/#define INSTANCES/]:[]});assert.deepEqual(programs(f.engine),prepared);assert.equal(f.engine.currentRenderPassId,f.outside);assert.ok(inspectPreparedEffects(f.engine).refs>0);
});

test('actual camera and shadow submesh passes are warmed without a scene render or new effects on the same variants',async t=>{
 const f=fixture(t),mesh=MeshBuilder.CreateBox('shadow-body',{},f.scene);mesh.material=new PBRMaterial('shadow-paint',f.scene);const light=new DirectionalLight('sun',new Vector3(.4,-1,.3),f.scene),shadows=new ShadowGenerator(32,light);shadows.addShadowCaster(mesh,false);
 const sceneRender=f.scene.render;f.scene.render=()=>assert.fail('warmup must not draw a scene');t.after(()=>{f.scene.render=sceneRender;});await prepareModelShaders({meshes:[mesh]},{shadows,preparation:createBossPreparation({incremental:false,timeoutMs:4000})});const prepared=programs(f.engine),pass=shadows.getShadowMap().renderPassId;
 for(const instances of [true,false]){assertWarm(mesh,{instances});withRenderPass(f.scene,pass,()=>{for(const sub of mesh.subMeshes)assert.equal(shadows.isReady(sub,instances,sub.getMaterial().needAlphaBlendingForMesh(mesh)),true);});}assert.deepEqual(programs(f.engine),prepared);assert.equal(f.engine.currentRenderPassId,f.outside);
});

for(const id of ['alpha-wolf','guardian-bear'])test('shipped '+id+' keeps its native skin/morph data and reuses prepared PBR variants',async t=>{
 const f=fixture(t),base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL(id+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');const loader=new GLTFFileLoader();loader.skipMaterials=true;t.after(()=>loader.dispose());const asset=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');for(const group of asset.animationGroups)group.stop();const meshes=asset.meshes.filter(mesh=>mesh.getTotalVertices()),before=meshes.map(mesh=>({geometry:mesh.geometry,skeleton:mesh.skeleton,indices:Array.from(mesh.getIndices()),weights:Array.from(mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)??[])}));assert.ok(meshes.some(mesh=>mesh.skeleton));
 for(const mesh of meshes){mesh.material=new PBRMaterial(id+'-paint',f.scene);mesh.material.unlit=true;mesh.metadata={moonforestEnemyFade:true};if(mesh.skeleton){mesh.skeleton.useTextureToStoreBoneMatrices=true;if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;}if(mesh.morphTargetManager?.numTargets)mesh.morphTargetManager.getTarget(0).influence=.4;mesh.computeWorldMatrix(true);}for(const skeleton of asset.skeletons)skeleton.prepare(true);
 await prepare({meshes});const prepared=programs(f.engine);for(const visibility of [.5,1])for(const instances of [true,false])for(const mesh of meshes)assertWarm(mesh,{instances,visibility,defines:mesh.skeleton?[/#define NUM_BONE_INFLUENCERS [48]/]:[]});assert.deepEqual(programs(f.engine),prepared);
 for(let i=0;i<meshes.length;i++){assert.equal(meshes[i].geometry,before[i].geometry);assert.equal(meshes[i].skeleton,before[i].skeleton);assert.deepEqual(Array.from(meshes[i].getIndices()),before[i].indices);assert.deepEqual(Array.from(meshes[i].getVerticesData(VertexBuffer.MatricesWeightsKind)??[]),before[i].weights);}if(id==='alpha-wolf')assert.ok(meshes.some(mesh=>mesh.morphTargetManager?.numTargets),'wolf sample exercises an actual morph manager');
 t.diagnostic(JSON.stringify({asset:id,meshes:meshes.length,bones:asset.skeletons.reduce((sum,s)=>sum+s.bones.length,0),morphTargets:meshes.reduce((sum,m)=>sum+(m.morphTargetManager?.numTargets??0),0),preparedPrograms:prepared.size,postPrepareNewPrograms:programs(f.engine).size-prepared.size}));
});
