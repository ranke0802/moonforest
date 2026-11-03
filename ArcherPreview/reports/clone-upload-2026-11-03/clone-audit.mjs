import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,Mesh,AbstractMesh,Geometry,TransformNode,Skeleton,AnimationGroup,MorphTargetManager} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {BossModelLibrary,instantiateBossModel} from '../../src/boss-models.js';
const base=new URL('../../public/assets/',import.meta.url),results=[];
for(const id of ['guardian-bear','hooded-goblin','elena','mourning-elena']){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,d,f,m,i,s,c,t)=>{const tex=engine.createRawTexture(data,w,h,f,m,i,s,c,t);tex.depth=d;tex.is2DArray=true;return tex;};
 const config=JSON.parse(readFileSync(new URL(id+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const g of container.animationGroups)g.stop();
 const library=new BossModelLibrary(scene,id);library.load=async()=>{};library.config=config;library.container=container;
 const counts={meshes:container.meshes.length,transforms:container.transformNodes.length,skeletons:container.skeletons.length,bones:container.skeletons.reduce((s,x)=>s+x.bones.length,0),groups:container.animationGroups.length,tracks:container.animationGroups.reduce((s,x)=>s+x.targetedAnimations.length,0),morphManagers:new Set(container.meshes.map(m=>m.morphTargetManager).filter(Boolean)).size};
 let calls=0;const originalInstantiate=container.instantiateModelsToScene.bind(container);container.instantiateModelsToScene=(...args)=>{calls++;return originalInstantiate(...args);};
 const runtime=[];for(let j=0;j<(id==='elena'||id==='mourning-elena'?3:5);j++){const start=performance.now();const {asset}=await library.instantiate();runtime.push({ms:performance.now()-start,meshes:asset.meshes.length,nodes:asset.transformNodes.length,skeletons:asset.skeletons.length,groups:asset.animationGroups.length});}
 const measured={};const restore=[];function wrap(owner,name,label){const original=owner[name];owner[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const entry=measured[label]??={calls:0,ms:0};entry.calls++;entry.ms+=performance.now()-start;}};restore.push(()=>owner[name]=original);}
 for(const [owner,name,label] of [[container,'_topologicalSort','topologicalSort'],[TransformNode.prototype,'clone','transformClone'],[Mesh.prototype,'clone','meshClone'],[Mesh.prototype,'refreshBoundingInfo','meshRefreshBounds'],[Mesh.prototype,'_getData','meshVertexData'],[AbstractMesh,'_ApplySkeleton','applySkeleton'],[Geometry.prototype,'applyToMesh','applyGeometry'],[Skeleton.prototype,'clone','skeletonClone'],[AnimationGroup.prototype,'clone','animationGroupClone'],[MorphTargetManager.prototype,'clone','morphManagerClone']])wrap(owner,name,label);
 const instrumentStart=performance.now(),inst=originalInstantiate(n=>n,false,{doNotInstantiate:true}),sdkMs=performance.now()-instrumentStart;
 const scanStart=performance.now(),nodes=[...new Set(inst.rootNodes.flatMap(root=>[root,...root.getDescendants(false)]))];const meshes=nodes.filter(n=>n instanceof Mesh),transforms=nodes.filter(n=>n instanceof TransformNode&&!(n instanceof Mesh)),scanMs=performance.now()-scanStart;
 for(const undo of restore.reverse())undo();
 const sdkEntries={ms:sdkMs,descendantScanMs:scanMs,meshes:meshes.length,transforms:transforms.length,skeletons:inst.skeletons.length,groups:inst.animationGroups.length,inclusiveTimings:measured};
 results.push({id,counts,runtimeCalls:runtime,actualRuntimeInstantiateModelsCalls:calls,instrumentedForcedSdkClone:sdkEntries});
 console.log(JSON.stringify(results.at(-1)));
 inst.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();
}
writeFileSync(new URL('./clone-audit.json',import.meta.url),JSON.stringify({scope:'Real packed glTF geometry/animation data, Babylon NullEngine, materials skipped. Desktop CPU, instrumented timings inclusive/overlapping; forced SDK clones for residents are investigative only. No GPU upload/device FPS.',results},null,2)+'\n');
