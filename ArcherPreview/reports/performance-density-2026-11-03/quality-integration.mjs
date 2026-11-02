import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {FreeCamera,MeshBuilder,NullEngine,PBRMaterial,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {WebGLShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGLShaderProcessors.js';
import {PreProcess} from '@babylonjs/core/Engines/Processors/shaderProcessor.js';
import {CHAPTER_POINTS} from '../../src/chapter-quest-points.js';
import {setupChapterQuests} from '../../src/chapter-quest.js';
import {LOOT_RARITIES,lootRarity} from '../../src/loot-rarity.js';
import {VillageOutlines} from '../../src/village-outlines.js';
import {applyVillageToon} from '../../src/village-toon.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';

const root=new URL('./',import.meta.url),shaderDir=new URL('quality-shaders/',root);
await mkdir(shaderDir,{recursive:true});
const report={timestamp:new Date().toISOString(),gpuRasterizationMeasured:false,phoneFpsMeasured:false,browserAutomationUsed:false,hashes:{},checks:[],shaders:[]};
for(const name of ['chapter-quest.js','chapter-quest-state.js','chapter-quest-props.js','village-outlines.js','loot-rarity.js'])report.hashes['src/'+name]=createHash('sha256').update(await readFile(new URL('../../src/'+name,root))).digest('hex');

function uiFixture(){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><div class="top-actions"></div></main></body></html>');
 const create=document.createElement.bind(document);
 document.createElement=(name,...args)=>{const node=create(name,...args);if(name==='dialog'){Object.defineProperty(node,'open',{get(){return this.hasAttribute('open');}});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};}return node;};
 const app=document.getElementById('app'),chest=CHAPTER_POINTS.find(p=>p.tier===5),state={ready:true,map:chest.map,position:{x:chest.x,z:chest.z}};
 let fogVisible=false,segmentClear=true,renderEligible=false;
 const world={cave:true,scene:{onDisposeObservable:{addOnce(){}}},terrain:{heightAt:()=>0},navigation:{findFree:p=>p,segmentClear:()=>segmentClear},caveFog:{allowsPoint:()=>fogVisible}};
 const api=setupChapterQuests({root:app,world,getState:()=>state,createProps:()=>({load:async()=>true,update(points,position,visible){renderEligible=visible(chest)&&world.caveFog.allowsPoint(chest);},release(){},dispose(){}})});
 const click=()=>app.querySelector('[data-chapter="interact"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 return {api,app,chest,click,setFog:value=>fogVisible=value,setLos:value=>segmentClear=value,get renderEligible(){return renderEligible;}};
}
{
 const f=uiFixture();f.api.update(1);
 const before=f.api.journey.value.bag[lootRarity(5).item]??0,hiddenButton=f.app.querySelector('[data-chapter="interact"]').hidden;
 f.click();const after=f.api.journey.value.bag[lootRarity(5).item]??0;
 report.checks.push({name:'hidden cave treasure cannot be opened',pass:after===before,point:f.chest.id,fogAllowsPoint:false,segmentClear:true,renderEligible:f.renderEligible,buttonHidden:hiddenButton,before,after});f.api.dispose();
}
{
 const f=uiFixture();f.setFog(true);f.api.update(1);f.setLos(false);f.click();
 report.checks.push({name:'LOS rechecked after target selection',pass:!f.api.journey.value.bag[lootRarity(5).item]});f.api.dispose();
}
{
 const f=uiFixture();f.setFog(true);f.api.update(1);f.setFog(false);f.click();
 report.checks.push({name:'fog rechecked after target selection',pass:!f.api.journey.value.bag[lootRarity(5).item]});f.api.dispose();
}

const compiler='C:/Users/ryank/Documents/ChatGPT/MM Project/output/witch-cave-material-fix/2026-11-01/tools/glslang/bin/glslang.exe';
for(const version of [100,300]){
 const engine=new NullEngine();engine._webGLVersion=version===300?2:1;engine.disableUniformBuffers=true;engine.getCaps().instancedArrays=true;
 engine._getShaderProcessor=()=>version===300?new WebGL2ShaderProcessor():new WebGLShaderProcessor();
 const scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,2,-8),scene);camera.setTarget(Vector3.Zero());scene.fogStart=20;scene.fogEnd=40;
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const source=MeshBuilder.CreateBox('quality-chest',{size:1},scene);source.material=new PBRMaterial('wood',scene);source.isVisible=false;
 applyVillageToon([source],{direction:Vector3.Up(),shadowsActive:false});
 const holder=new TransformNode('holder',scene),records=LOOT_RARITIES.map((grade,i)=>{const mesh=source.createInstance('chest-'+grade.tier);mesh.parent=holder;mesh.position.x=(i-2)*1.1;mesh.computeWorldMatrix(true);return {root:holder,meshes:[mesh],placement:{kind:'ground-detail',tier:grade.tier}};});
 const stats={},ink=new VillageOutlines({scene,camera,touchDevice:true},records,stats);await ink.prepare();await source.material.forceCompilationAsync(source,{useInstances:true});scene.render();
 const effect=ink.material.getEffect(),names=effect.getAttributesNames();
 assert.ok(names.includes('villageInkTint'));
 const attributeSlots=names.reduce((total,name)=>total+(name==='world'?4:1),0);
 report.checks.push({name:'ES'+version+' native outline instance attributes fit eight slots',pass:attributeSlots<=8,attributes:names,attributeSlots});
 const store=source._userInstancedBuffersStorage;
 report.checks.push({name:'ES'+version+' native tint float buffer contains every grade',pass:LOOT_RARITIES.every(grade=>records[grade.tier-1].meshes[0].instancedBuffers.villageInkTint.toHexString().toLowerCase()===grade.color),tintStride:store.strides.villageInkTint,actualTintBuffer:Array.from(store.data.villageInkTint.slice(0,15))});
 const paths=[];
 for(const [stage,expanded]of [['vert',effect.vertexSourceCode],['frag',effect.fragmentSourceCode]]){
  const options={defines:(effect.defines??'').split('\n').filter(Boolean),isFragment:stage==='frag',shouldUseHighPrecisionShader:true,processor:new WebGLShaderProcessor(),includesShadersStore:{},indexParameters:{},version:String(version),platformName:'WEBGL',processingContext:{}};
  const processed=await new Promise(resolve=>PreProcess(expanded,options,resolve,{isNDCHalfZRange:false,useReverseDepthBuffer:false,useExactSrgbConversions:false,getCaps:()=>({drawBuffersExtension:false}),_features:{needShaderCodeInlining:false}}));
  const path=fileURLToPath(new URL('es'+version+'.'+stage,shaderDir));await writeFile(path,`#version ${version}${version===300?' es':''}\n`+processed);paths.push(path);
  const compiled=spawnSync(compiler,['-S',stage,path],{encoding:'utf8'});report.shaders.push({version,stage,exit:compiled.status,output:(compiled.stdout??'')+(compiled.stderr??'')});
 }
 const linked=spawnSync(compiler,['-l',...paths],{encoding:'utf8'});report.shaders.push({version,stage:'link',exit:linked.status,output:(linked.stdout??'')+(linked.stderr??'')});
 ink.dispose();scene.dispose();engine.dispose();
}
report.success=report.checks.every(check=>check.pass)&&report.shaders.every(shader=>shader.exit===0);
await writeFile(new URL('quality-integration.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exitCode=report.success?0:1;
