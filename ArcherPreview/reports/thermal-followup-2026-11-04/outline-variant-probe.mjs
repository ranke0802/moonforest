import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,StandardMaterial,TransformNode,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {VillageOutlines} from '../../src/village-outlines.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';

const base=new URL('../../public/assets/',import.meta.url),cases=[['village','tree-01-round-oak','rock-01-mossy-boulder'],['great-plains','forest-01-sickly-oak','tree-02-slender-pine'],['monster-forest','forest-01-sickly-oak','tree-02-slender-pine'],['witch-cave','cave-02-rock-ledge','crate-barrel-cluster']],out=[];
for(const [map,...ids]of cases){
 const engine=new NullEngine({renderWidth:960,renderHeight:540}),scene=new Scene(engine);engine.getCaps().instancedArrays=true;scene.fogStart=65;scene.fogEnd=80;
 const camera=new FreeCamera('camera',new Vector3(0,3,-16),scene);camera.setTarget(new Vector3(0,3,0));caveFogFallback(scene).getInternalTexture().isReady=true;
 const manifest=JSON.parse(readFileSync(new URL(map+'.json',base))),records=[],sources=[],loaders=[];
 for(const [index,id]of ids.entries()){
  const model=new URL((manifest.assets[id].mobileNear??manifest.assets[id].lods[1]).model,base),decoded=await readRuntimeGltf(model),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loaders.push(loader);loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();const source=asset.meshes.find(m=>m.getTotalVertices());if(!source)throw Error('missing '+id);
  source.parent=null;source.isVisible=false;source.material=new StandardMaterial('paint-'+id,scene);source.material.disableLighting=true;
  const root=new TransformNode('root-'+id,scene);root.position.x=(index-.5)*8;const instance=source.createInstance('instance-'+id);instance.parent=root;instance.computeWorldMatrix(true);sources.push(source);records.push({root,meshes:[instance],placement:{kind:'tree'}});
 }
 const ink=new VillageOutlines({scene,camera,touchDevice:true,cave:map==='witch-cave'},records,{});await ink.prepare();for(const source of sources)await source.material.forceCompilationAsync(source,{useInstances:true});scene.render();ink.next=0;scene.render();
 let calls=0,newEffects=0;const seen=new Set(Object.values(engine._compiledEffects)),create=engine.createEffect.bind(engine);engine.createEffect=(...args)=>{calls++;const effect=create(...args);if(!seen.has(effect)){seen.add(effect);newEffects++;}return effect;};
 let elapsed=0;const drawsBefore=ink.stats.outlineDraws??0;for(let i=0;i<120;i++){const start=performance.now();scene.render();elapsed+=performance.now()-start;}
 out.push({map,assets:ids,hasVertexColors:sources.map(s=>s.isVerticesDataPresent(VertexBuffer.ColorKind)),sceneRenders:120,inkDraws:(ink.stats.outlineDraws??0)-drawsBefore,effectRequests:calls,newEffects,elapsedMs:elapsed});
 ink.dispose();for(const loader of loaders)loader.dispose();scene.dispose();engine.dispose();
}
writeFileSync(new URL('outline-variant-probe.json',import.meta.url),JSON.stringify({cases:out,scope:'Actual packed map models/geometry + Babylon 9.31 NullEngine, image loading omitted, 120 scene.render calls per map.',limitations:['Node CPU timings and Effect cache requests do not measure phone CPU, GPU time, FPS or temperature.','Only two intentionally visible sources per map; not representative of complete actual frame or draw ordering.']},null,2)+'\n');console.log(JSON.stringify(out));
