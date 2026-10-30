import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {NullEngine,Scene,TransformNode,ArcRotateCamera,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {CharacterAnimator} from '../src/animation.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {attachCharacterOutlines,isRuntimeOutline} from '../src/character-outlines.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/elena-fps-followup');mkdirSync(out,{recursive:true});
const base='efae4fb',mode=process.argv.includes('--current')?'current':'baseline';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources={};
for(const file of ['boss-models.js','mourning-elena-animation.js']){
  const before=execFileSync('git',['show',`${base}:ArcherPreview/src/${file}`],{cwd:root,maxBuffer:8*1024*1024});
  writeFileSync(resolve(out,'before-'+file),before.toString('utf8').replace(/from\s+(['"])\.\/([^'"]+)\1/g,(_,quote,path)=>`from ${quote}../../src/${path}${quote}`));
  sources[file]={baseline:sha(before),current:sha(readFileSync(resolve(root,'src',file)))};
}
const {BossModelLibrary}=await import(pathToFileURL(resolve(mode==='baseline'?out:resolve(root,'src'),mode==='baseline'?'before-boss-models.js':'boss-models.js')));
const {MourningElenaAnimator}=await import(pathToFileURL(resolve(mode==='baseline'?out:resolve(root,'src'),mode==='baseline'?'before-mourning-elena-animation.js':'mourning-elena-animation.js')));
const stats=values=>{const s=[...values].sort((a,b)=>a-b);return {frames:s.length,meanMs:s.reduce((a,b)=>a+b,0)/s.length,p50Ms:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],maxMs:s.at(-1)};};
const counts=scene=>({meshes:scene.meshes.length,transformNodes:scene.transformNodes.length,skeletons:scene.skeletons.length,morphTargetManagers:scene.morphTargetManagers.length,animationGroups:scene.animationGroups.length,animatables:scene.animatables.length,geometries:scene.geometries.length,textures:scene.textures.length});
const report={generatedAt:new Date().toISOString(),base,mode,sources,cpu:cpus()[0]?.model,node:process.version,scope:'CPU only. Packed geometry/rig/morph data; material images skipped. NullEngine texture-array creation uses its inert raw-texture object with the original dimensions/depth. No GPU work, shader compile timing or FPS claim. No AI/navigation/collision timing.',coordination:process.env.ELENA_BENCHMARK_WINDOW??'Unspecified',models:[]};
for(const id of ['elena','mourning-elena']){
  const stages={},config=JSON.parse(readFileSync(resolve(root,'public/assets',id+'.json'))),modelUrl=new URL(config.model,pathToFileURL(resolve(root,'public/assets/')+'/'));
  let start=performance.now();const decoded=await readRuntimeGltf(modelUrl),gltf=structuredClone(decoded.gltf);stages.readDecodeMs=performance.now()-start;
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxTextureSize:4096,maxVertexUniformVectors:1024});
  engine.createRawTexture2DArray=(data,width,height,depth,format,mips,invertY,sampling,compression,type)=>{
    const texture=engine.createRawTexture(data,width,height,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;
  };
  const camera=new ArcRotateCamera('bench-camera',Math.PI/2,1.25,8.5,new Vector3(0,1.8,0),scene);scene.activeCamera=camera;
  const loader=new GLTFFileLoader();loader.skipMaterials=true;
  start=performance.now();const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();stages.loadContainerMs=performance.now()-start;
  const templateCounts={meshes:container.meshes.length,nodes:container.transformNodes.length,skeletons:container.skeletons.length,managers:container.morphTargetManagers.length};
  const library=new BossModelLibrary(scene,id);library.load=async()=>{};library.config=config;library.container=container;
  start=performance.now();const {asset}=await library.instantiate();stages.instantiateMs=performance.now()-start;
  const actor=new TransformNode('actor',scene),carrier=new TransformNode('carrier',scene);carrier.parent=actor;actor.scaling.setAll(config.scale);carrier.position.set(...(config.centerOffset??[0,0,0]));
  for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
  const managers=[...new Set(asset.meshes.map(m=>m.morphTargetManager).filter(Boolean))];
  start=performance.now();
  if(mode==='current')MourningElenaEncounter.prototype.prepareAsset.call({asset});
  else for(const manager of managers){manager.optimizeInfluencers=false;manager.numMaxInfluencers=manager.numTargets;manager.synchronize();}
  stages.morphPolicyMs=performance.now()-start;
  const body=asset.meshes.filter(m=>m.getTotalVertices());
  for(const mesh of body){mesh.alwaysSelectAsActiveMesh=true;mesh.isPickable=false;if(mesh.skeleton){mesh.numBoneInfluencers=mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind)?8:4;mesh.skeleton.useTextureToStoreBoneMatrices=true;}}
  const outlines=attachCharacterOutlines(asset,'elena');
  start=performance.now();const animator=id==='mourning-elena'?new MourningElenaAnimator(asset,config,actor):new CharacterAnimator(asset.animationGroups,config.animations);stages.animatorCreateMs=performance.now()-start;
  const poseNodes=orderPoseNodes([...asset.transformNodes,...asset.meshes]),trackNames=id==='mourning-elena'?['walk','cast']:['Walking','mage_soell_cast_6'];
  const phases=new Map(),sample=[],hierarchy=[],active=[],total=[];
  function frame(i,timed=false){
    const cast=i%360>=90&&i%360<270,clipTime=cast?(i%360-90)/60:i/60;
    scene.incrementRenderId();
    let t=performance.now();animator.transition(trackNames[Number(cast)],{clipTime,actionId:Math.floor(i/360),loop:!cast});animator.update(1/60);scene._animate(0);const a=performance.now();
    actor.markAsDirty();actor.computeWorldMatrix();carrier.computeWorldMatrix();refreshPoseMatrices(poseNodes);const b=performance.now();
    scene.updateTransformMatrix();scene._evaluateActiveMeshes();const c=performance.now();
    for(const manager of managers)phases.set(manager.numInfluencers,(phases.get(manager.numInfluencers)??0)+1);
    if(timed){sample.push(a-t);hierarchy.push(b-a);active.push(c-b);total.push(c-t);}
  }
  for(let i=0;i<180;i++)frame(i);global.gc?.();
  const before=counts(scene),memoryBefore=process.memoryUsage();for(let i=0;i<720;i++)frame(i,true);global.gc?.();
  report.models.push({id,modelSha256:sha(readFileSync(modelUrl)),stages,templateCounts,countsBefore:before,countsAfter:counts(scene),memoryBefore,memoryAfter:process.memoryUsage(),sampling:stats(sample),postSamplingHierarchy:stats(hierarchy),activeMeshAndSkin:stats(active),pipeline:stats(total),morphActiveCounts:Object.fromEntries(phases),meshInventory:body.map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3,bones:m.skeleton?.bones.length??0,boneTexture:!!m.skeleton?.isUsingTextureForMatrices,gpuSkin:m.computeBonesUsingShaders,influencers:m.numBoneInfluencers,morphs:m.morphTargetManager?.numTargets??0,morphTexture:!!m.morphTargetManager?.isUsingTextureForTargets})),activeMeshNames:scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length).map(m=>m.name),activeSkeletons:scene._activeSkeletons.data.slice(0,scene._activeSkeletons.length).map(s=>({name:s.name,bones:s.bones.length})),softwareSkinnedMeshes:scene._softwareSkinnedMeshes.length,bodyTriangles:body.reduce((n,m)=>n+m.getTotalIndices()/3,0),outlineTriangles:outlines.reduce((n,m)=>n+m.getTotalIndices()/3,0),morphTextureBytes:managers.reduce((n,m)=>n+m._textureWidth*m._textureHeight*m.numTargets*16,0)});
  animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();
}
writeFileSync(resolve(out,`model-performance-${mode}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.models.map(({id,stages,pipeline,sampling,postSamplingHierarchy,activeMeshAndSkin,meshInventory,morphActiveCounts,softwareSkinnedMeshes,morphTextureBytes,countsAfter})=>({id,stages,pipeline,sampling,postSamplingHierarchy,activeMeshAndSkin,meshInventory,morphActiveCounts,softwareSkinnedMeshes,morphTextureBytes,countsAfter}))));
