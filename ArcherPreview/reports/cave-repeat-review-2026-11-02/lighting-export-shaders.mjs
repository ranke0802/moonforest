import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {NullEngine,MeshBuilder,PBRMaterial,RawTexture,Vector3} from 'file:///C:/dev/moonforest-archer/ArcherPreview/node_modules/@babylonjs/core/index.js';
import {WebGL2ShaderProcessor} from 'file:///C:/dev/moonforest-archer/ArcherPreview/node_modules/@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {WebGLShaderProcessor} from 'file:///C:/dev/moonforest-archer/ArcherPreview/node_modules/@babylonjs/core/Engines/WebGL/webGLShaderProcessors.js';
import {PreProcess} from 'file:///C:/dev/moonforest-archer/ArcherPreview/node_modules/@babylonjs/core/Engines/Processors/shaderProcessor.js';
import {createWorld} from 'file:///C:/dev/moonforest-archer/ArcherPreview/src/world.js';
import {applyVillageToon} from 'file:///C:/dev/moonforest-archer/ArcherPreview/src/village-toon.js';
import {caveFogFallback} from 'file:///C:/dev/moonforest-archer/ArcherPreview/src/cave-fog-binding.js';
import {prepareMapMaterials} from 'file:///C:/dev/moonforest-archer/ArcherPreview/src/map-shader-cache.js';

const out=new URL('file:///C:/Users/ryank/Documents/ChatGPT/MM%20Project/output/cave-repeat-lighting-review/2026-11-02/shaders/');await mkdir(out,{recursive:true});const infos=[];
for(const {version,ubo}of [{version:100,ubo:false},{version:300,ubo:false},{version:300,ubo:true}]){
 const engine=new NullEngine({renderWidth:640,renderHeight:480});engine._webGLVersion=version===300?2:1;engine.disableUniformBuffers=!ubo;
 engine._getShaderProcessor=()=>version===300?new WebGL2ShaderProcessor():new WebGLShaderProcessor();engine.getCaps().instancedArrays=true;
 const world=createWorld(engine,{cave:true,touchDevice:true});
 for(const texture of [world.caveFog.texture,world.scene.metadata.cavePaintLighting.texture,caveFogFallback(world.scene)])if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
 world.caveFog.update(new Vector3(-35,3,-18),0,{force:true});
 const meshes=[];
 for(const [name,palette]of [['uv-rock',false],['palette-rock',true],['prop',false]]){
  const mesh=MeshBuilder.CreateBox(name,{size:2},world.scene);mesh.material=new PBRMaterial(name,world.scene);
  if(name!=='prop')mesh.material.metadata={caveRockTone:true,caveRockPaletteOnly:palette};
  if(!palette){const texture=RawTexture.CreateRGBATexture(new Uint8Array([180,153,119,255]),1,1,world.scene,false,false);texture.gammaSpace=true;texture.getInternalTexture().isReady=true;mesh.material.albedoTexture=texture;}
  applyVillageToon([mesh],world.lighting);world.caveAtmosphere.attachMaterial(mesh.material);world.caveFog.attach(mesh.material);await prepareMapMaterials([mesh]);meshes.push([name,mesh]);
 }
 world.scene.render();
 const targets=[...meshes,['floor',world.ground],['roof',world.scene.getMeshByName('cave-distant-ceiling')],['water',world.scene.getMeshByName('cave-still-water')],['waterfall',world.scene.getMeshByName('cave-waterfall-0')]];
 for(const [label,mesh]of targets){
  if(!mesh)throw Error('Missing target '+label);await prepareMapMaterials([mesh]);world.scene.render();const effect=mesh.subMeshes.find(s=>s.effect)?.effect??mesh.material.getEffect();
  if(!effect)throw Error('Missing actual effect '+label);const name=`es${version}-ubo${ubo?1:0}-${label}`;
  for(const [ext,source]of [['vert',effect.vertexSourceCode],['frag',effect.fragmentSourceCode]]){
   await writeFile(new URL(name+'.'+ext,out),source);
   // Expanded effects keep preprocessor branches. Strip inactive branches with
   // the same Babylon preprocessor before handing the actual version to GLSL.
   const options={defines:(effect.defines??'').split('\n').filter(Boolean),isFragment:ext==='frag',shouldUseHighPrecisionShader:true,processor:new WebGLShaderProcessor(),includesShadersStore:{},indexParameters:{},version:String(version),platformName:'WEBGL',processingContext:{}};
   const code=await new Promise(resolve=>PreProcess(source,options,resolve,{isNDCHalfZRange:false,useReverseDepthBuffer:false,useExactSrgbConversions:false,getCaps:()=>({drawBuffersExtension:false}),_features:{needShaderCodeInlining:false}}));
   await writeFile(new URL(name+'.compiled.'+ext,out),`#version ${version}${version===300?' es':''}\n`+code);
  }
  infos.push({name,version,ubo,kind:mesh.material.getClassName(),defines:effect.defines,uniformCount:(effect.fragmentSourceCode.match(/uniform vec4 cavePaintPlayer;/g)||[]).length,oneVisibilityLookup:(effect.fragmentSourceCode.match(/texture2D\(caveFogMap/g)||[]).length===1});
 }
 engine.dispose();
}
await writeFile(new URL('export.json',out),JSON.stringify(infos,null,2));console.log(JSON.stringify({directory:fileURLToPath(out),variants:infos.length,stages:infos.length*2,versions:infos.map(x=>[x.name,x.version,x.ubo])}));
