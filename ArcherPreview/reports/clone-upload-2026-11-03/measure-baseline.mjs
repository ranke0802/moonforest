import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,Mesh,Skeleton,MorphTargetManager,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';

const base=new URL('../../public/assets/',import.meta.url),results=[];
const cases=[['warrior-v3','warrior'],['guardian-bear','bear'],['hooded-goblin','goblin'],['elena','elena'],['mourning-elena','elena']];
for(const [id,kind]of cases){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,0,-10),scene);
 const manifest=JSON.parse(readFileSync(new URL(id+'.json',base))),{gltf,files}=await readRuntimeGltf(new URL(manifest.model,base));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');container.addAllToScene();
 const eligible=container.meshes.filter(m=>m.getTotalVertices()&&m.isVerticesDataPresent(VertexBuffer.NormalKind)&&!/outline/i.test(m.name)&&!/Lament_Mouth_Interior/.test(m.name)&&(kind!=='warrior'||['Golden_Oathblade','Bunnyguard_Shield'].includes(m.name)));
 const observed={refreshes:0,skinAndMorphRefreshes:0,skeletonClones:0,morphClones:0};
 const refresh=Mesh.prototype.refreshBoundingInfo,cloneSkin=Skeleton.prototype.clone,cloneMorph=MorphTargetManager.prototype.clone;
 Mesh.prototype.refreshBoundingInfo=function(...args){observed.refreshes++;if(args[0]===true&&args[1]===true)observed.skinAndMorphRefreshes++;return refresh.apply(this,args);};
 Skeleton.prototype.clone=function(...args){observed.skeletonClones++;return cloneSkin.apply(this,args);};
 MorphTargetManager.prototype.clone=function(...args){observed.morphClones++;return cloneMorph.apply(this,args);};
 try{
  const samples=[];
  for(const source of eligible){
   const baseline={meshes:scene.meshes.length,geometries:scene.geometries.length,skeletons:scene.skeletons.length,morphManagers:scene.morphTargetManagers.length},durations=[];let same;
   for(let n=0;n<4;n++){
    const start=performance.now(),shell=source.clone(source.name+' / silhouette',source,true),ms=performance.now()-start;
    same={geometry:shell.geometry===source.geometry,skeleton:shell.skeleton===source.skeleton,morph:shell.morphTargetManager===source.morphTargetManager,submeshes:shell.subMeshes.length,morphTargets:source.morphTargetManager?.numTargets??0};
    shell.dispose(false,false);durations.push(ms);
    if(scene.meshes.length!==baseline.meshes||scene.geometries.length!==baseline.geometries||scene.skeletons.length!==baseline.skeletons||scene.morphTargetManagers.length!==baseline.morphManagers)throw Error(id+' retained clone resources');
   }
   samples.push({name:source.name,vertices:source.getTotalVertices(),...same,firstMs:durations[0],warmMedianMs:durations.slice(1).sort((a,b)=>a-b)[1],countsAfterDispose:baseline});
  }
  results.push({id,kind,meshes:container.meshes.length,eligible:eligible.length,observed,samples});
 }finally{Mesh.prototype.refreshBoundingInfo=refresh;Skeleton.prototype.clone=cloneSkin;MorphTargetManager.prototype.clone=cloneMorph;container.dispose();loader.dispose();scene.dispose();engine.dispose();}
}
writeFileSync(new URL('./clone-baseline.json',import.meta.url),JSON.stringify({scope:'Babylon 9.31 NullEngine, actual packed mesh/skin/morph geometry; material images skipped. Four source.clone calls per eligible mesh; does not measure GPU or phone FPS.',results},null,2));
console.log(JSON.stringify(results.map(({id,eligible,observed,samples})=>({id,eligible,observed,meshes:samples.map(({name,vertices,morphTargets,firstMs,warmMedianMs})=>({name,vertices,morphTargets,firstMs,warmMedianMs}))}))));
