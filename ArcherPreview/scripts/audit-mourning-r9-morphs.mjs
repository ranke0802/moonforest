// Real packed animation/binding data, with inert NullEngine textures; no GPU timing.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));
const decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
for(const k of ['extensionsUsed','extensionsRequired'])gltf[k]=(gltf[k]??[]).filter(x=>x!=='EXT_meshopt_compression');
for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+decoded.files.get(b.uri).data.toString('base64');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxTextureSize:4096,maxVertexUniformVectors:1024});
engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const t=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);t.depth=depth;t.is2DArray=true;return t;};
const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
for(const g of container.animationGroups)g.stop();
const library=new BossModelLibrary(scene,'mourning-elena');library.load=async()=>{};library.config=config;library.container=container;
const {asset}=await library.instantiate(),actor=new TransformNode('audit-actor',scene),carrier=new TransformNode('audit-center',scene);carrier.parent=actor;carrier.position.set(...config.centerOffset);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);
for(const n of new Set([...asset.meshes,...asset.transformNodes]))if(!n.parent)n.parent=carrier;
MourningElenaEncounter.prototype.prepareAsset.call({asset});const outlines=attachCharacterOutlines(asset,'elena'),animator=new MourningElenaAnimator(asset,config,actor);
const body=asset.meshes.filter(m=>m.getTotalVertices()&&!m.metadata?.moonforestOutline),managers=[...new Set(body.map(m=>m.morphTargetManager).filter(Boolean))].sort((a,b)=>b.numTargets-a.numTargets),counts=()=>({meshes:scene.meshes.length,geometries:scene.geometries.length,morphTargetManagers:scene.morphTargetManagers.length,textures:scene.textures.length,skeletons:scene.skeletons.length,animationGroups:scene.animationGroups.length});
const before=counts(),records=[];
let synchronizationCalls=0;for(const m of managers){const original=m.synchronize.bind(m);m.synchronize=(...args)=>{synchronizationCalls++;return original(...args);};}
function sample(label,time){
 const bindings=managers.map(manager=>{const values={};manager._bind({setFloat3(){},setArray(){},setFloatArray(){},setTexture(){},setFloat:(n,v)=>values[n]=v});return {slots:manager.numMaxInfluencers,active:manager.numInfluencers,shaderCount:values.morphTargetCount,targets:Array.from({length:manager.numTargets},(_,i)=>manager.getTarget(i)).filter(t=>t.influence!==0).map(t=>({name:t.name,value:t.influence}))};});
 const enabledBody=body.filter(m=>m.isEnabled()),enabledOutlines=outlines.filter(m=>m.isEnabled());
 records.push({label,time,bindings,mouthEnabled:animator.mouthMeshes.some(m=>m.isEnabled()),drawUpperBound:enabledBody.length*2+enabledOutlines.length});
}
function advanceLiving(state,seconds){animator.transition(state,{clipTime:0,staggerRemaining:state==='hit'?2:0});for(let i=0;i<Math.ceil(seconds*60);i++){animator.transition(state,{clipTime:(i+1)/60,staggerRemaining:state==='hit'?2:0});animator.update(1/60);}}
for(const [state,duration]of [['idle',6],['walk',2.4],['cast',3],['hit',1.3]]){
 animator.reset();if(state==='cast')advanceLiving('walk',.5);
 for(let i=0;i<=Math.ceil(duration*60);i++){animator.transition(state,{clipTime:i/60,staggerRemaining:state==='hit'?2:0});animator.update(i?1/60:0);sample(state,i/60);}
}
for(const [from,seconds]of [['idle',1],['walk',.5],['cast',.75],['cast',1.2],['cast',2.4],['hit',.4]]){
 animator.reset();advanceLiving('walk',.5);advanceLiving(from,seconds);animator.transition('dead');sample('death-from-'+from+'-'+seconds,0);
 for(let i=1;i<=312;i++){animator.update(1/60);sample('death-from-'+from+'-'+seconds,i/60);}
}
const groups={};for(const r of records){const g=groups[r.label]??={frames:0,maximumBodyActive:0,maximumMouthActive:0,maximumTotalActive:0,maximumDrawUpperBound:0,firstBodyPeak:null};g.frames++;const bodyCount=r.bindings[0].active,mouthCount=r.bindings[1]?.active??0;if(bodyCount>g.maximumBodyActive){g.maximumBodyActive=bodyCount;g.firstBodyPeak=r;}g.maximumMouthActive=Math.max(g.maximumMouthActive,mouthCount);g.maximumTotalActive=Math.max(g.maximumTotalActive,bodyCount+mouthCount);g.maximumDrawUpperBound=Math.max(g.maximumDrawUpperBound,r.drawUpperBound);}
const hash=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const report={generatedAt:new Date().toISOString(),scope:'Actual packed model and Babylon texture-mode bindings in CPU NullEngine; no GPU rendering/FPS measurement.',hashes:Object.fromEntries(['../src/mourning-elena-animation.js','../src/mourning-motion-v2.js','../src/mourning-elena-encounter.js','../src/character-outlines.js','../public/assets/mourning-elena.json'].map(p=>[p,hash(p)])),groups,frames:records.length,bindingsMatch:records.every(r=>r.bindings.every(b=>b.active===b.shaderCount&&b.active===b.targets.length)),memory:managers.map(m=>({width:m._textureWidth,height:m._textureHeight,layers:m.numTargets,bytes:m._textureWidth*m._textureHeight*m.numTargets*16,textureMode:m.isUsingTextureForTargets})),countsBefore:before,countsAfter:counts(),synchronizationCalls,outlineSharesBodyManagers:outlines.every(m=>m.morphTargetManager===m.parent.morphTargetManager),mouthOutline:outlines.some(m=>m.name.includes('Lament_Mouth')),drawAssumptions:'One body, one shadow and one outline submission for each enabled mesh; mouth has no outline. Actual visibility, shadow configuration and GPU draws depend on scene.'};
animator.dispose();container.dispose();loader.dispose();actor.dispose();report.countsAfterDispose=counts();scene.dispose();engine.dispose();
writeFileSync(new URL('../reports/elena-motion-v2-1/morph-runtime-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({groups:Object.fromEntries(Object.entries(groups).map(([name,g])=>[name,{...g,firstBodyPeak:undefined}])),memory:report.memory,countsBefore:before,countsAfter:report.countsAfter,countsAfterDispose:report.countsAfterDispose,synchronizationCalls,bindingsMatch:report.bindingsMatch}));
