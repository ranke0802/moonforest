import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {NullEngine,Scene,FreeCamera,Vector3,DirectionalLight,ShadowGenerator,PBRMaterial,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../../src/boss-models.js';
import {BossEncounter} from '../../src/boss-encounter.js';
import {GoblinEncounter} from '../../src/goblin-encounter.js';
import {ElenaEncounter} from '../../src/elena-encounter.js';
import {MourningElenaEncounter} from '../../src/mourning-elena-encounter.js';
import {createBossPreparation} from '../../src/boss-preparation.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {applyHitFlash} from '../../src/hit-feedback.js';

const base=new URL('../../public/assets/',import.meta.url),results=[],fileHashes={};
for(const file of ['src/boss-models.js','src/boss-shader-warmup.js','src/character-outlines.js','src/mourning-elena-encounter.js'])fileHashes[file]=createHash('sha256').update(readFileSync(new URL('../../'+file,import.meta.url))).digest('hex');
for(const [manifest,Type]of [['guardian-bear',BossEncounter],['hooded-goblin',GoblinEncounter],['elena',ElenaEncounter],['mourning-elena',MourningElenaEncounter]]){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096,texture2DArrayMaxLayerCount:256});
 const nativeRaw=engine.createRawTexture.bind(engine);engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=nativeRaw(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};engine.updateRawTexture2DArray=()=>{};
 const camera=new FreeCamera('upload-audit',new Vector3(0,4,-12),scene);camera.setTarget(new Vector3(0,1,2));const light=new DirectionalLight('sun',new Vector3(.65,-1,-.45),scene),shadows=new ShadowGenerator(256,light);caveFogFallback(scene).getInternalTexture().isReady=true;
 let stage='load',currentSlice=0;const events=[];
 for(const name of ['createVertexBuffer','createDynamicVertexBuffer','createIndexBuffer','updateDynamicVertexBuffer','updateDynamicIndexBuffer','createRawTexture','updateRawTexture','createRawTexture2DArray','updateRawTexture2DArray']){
  const original=engine[name]?.bind(engine);if(!original)continue;
  engine[name]=(...args)=>{const data=args[name.startsWith('update')?1:0],inputBytes=data?.byteLength??(Array.isArray(data)?data.length*4:0),start=performance.now(),value=original(...args),cpuCallMs=performance.now()-start;
   const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):Array.isArray(data)?new Uint8Array(Float32Array.from(data).buffer):null;
   events.push({stage,slice:currentSlice,method:name,inputBytes,byteCountIsTypedArray:!!data?.byteLength,cpuCallMs,hash:bytes?createHash('sha256').update(bytes).digest('hex'):null,...(name.startsWith('createRaw')?{width:args[1],height:args[2],...(name.includes('2DArray')?{depth:args[3]}:{})}:{})});return value;};
 }
 const config=JSON.parse(readFileSync(new URL(manifest+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();
 stage='fixture-paint';const paint=new PBRMaterial('audit-source-painted',scene);paint.unlit=true;paint.backFaceCulling=false;paint.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 stage='instantiate';const library=new BossModelLibrary(scene,manifest);Object.assign(library,{container,config,load:async()=>{}});const loaded=await library.instantiate(),asset=loaded.asset;
 const terrain={heightAt:()=>0,place(p){p.y=0;}},world={scene,terrain,shadows},player=new TransformNode('audit-player',scene),encounter=new Type(world,()=>{},()=>{},()=>{},{loadAsset:async()=>loaded});
 stage='prepare-hidden';const preparation=createBossPreparation({frame:async()=>{currentSlice++;}}),step=preparation.step.bind(preparation);preparation.step=(name,fn)=>step(name,()=>{const previous=stage;stage='prepare:'+name;try{return fn();}finally{stage=previous;}});
 await encounter.prepareHidden({preparation});
 stage='summon';await encounter.summon(player,{position:new Vector3(0,0,2.8),preparation:createBossPreparation({frame:async()=>{}})});
 stage='first-auxiliary-show';if(encounter.kind==='elena')encounter.updateRenderRange(camera.position);else{encounter.brain.start(encounter.kind==='goblin'?'Right_Jab_from_Guard':'Axe_Spin_Attack','attack');encounter.update(1/60,player);}
 stage='first-draw';scene.render();stage='repeat-draw';for(let i=0;i<3;i++)scene.render();
 stage='death-fade';for(const mesh of asset.meshes)mesh.visibility=.5;encounter.setShadowCasting(false);applyHitFlash(asset.meshes,.1);scene.render();
 const summary={};for(const event of events){const key=event.stage+' / '+event.method,row=summary[key]??={calls:0,inputBytes:0,cpuCallMs:0};row.calls++;row.inputBytes+=event.inputBytes;row.cpuCallMs+=event.cpuCallMs;}
 const rawArrays=events.filter(e=>e.method==='createRawTexture2DArray'),duplicates=rawArrays.filter((event,index)=>rawArrays.findIndex(other=>other.hash===event.hash)<index);
 results.push({manifest,vertices:asset.meshes.filter(m=>m.getTotalVertices()&&!m.metadata?.moonforestOutline).reduce((total,m)=>total+m.getTotalVertices(),0),summary,textureMorphUploads:rawArrays.map(({stage,inputBytes,width,height,depth,hash})=>({stage,inputBytes,width,height,depth,hash})),duplicateIdenticalMorphUploadCount:duplicates.length,duplicateIdenticalMorphUploadBytes:duplicates.reduce((total,e)=>total+e.inputBytes,0),events});
 encounter.hide();loader.dispose();scene.dispose();engine.dispose();
}
const folder=new URL('./',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('upload-lifecycle-baseline.json',folder),JSON.stringify({baseline:'c020469',fileHashes,results,methodology:['Actual packed geometry/skin/morph decoded through Babylon GLTFFileLoader and actual BossModelLibrary/Encounter preparation. Images/KTX omitted.','NullEngine native buffer/raw methods instrumented; texture-array API uses an inert raw texture shim. One logical texture-array call is recorded once, not again through the shim.','inputBytes counts CPU input payload, not measured VRAM. Number arrays use a four-byte-per-value proxy; typed-array byte counts are exact.','CPU call durations exclude audit SHA hashing but are not representative frame times. No GPU upload or driver completion measurement is possible.'],browserAutomation:false},null,2)+'\n');
console.log(JSON.stringify(results.map(({manifest,summary,textureMorphUploads,duplicateIdenticalMorphUploadBytes})=>({manifest,summary,textureMorphUploads,duplicateIdenticalMorphUploadBytes})),null,2));
