import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,FreeCamera,Vector3,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {enableEnemyFade} from '../../src/enemy-death.js';
import {attachCharacterOutlines} from '../../src/character-outlines.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {applyElenaStyle} from '../../src/elena-style.js';
import {applyHitFlash} from '../../src/hit-feedback.js';

// Keep the before-change evidence reproducible after the source is fixed.
const original=execFileSync('git',['show','71f9165:ArcherPreview/src/boss-shader-warmup.js'],{encoding:'utf8'}).replace("'./boss-preparation.js'",JSON.stringify(new URL('../../src/boss-preparation.js',import.meta.url).href));
const {prepareBossShaders}=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));

const records=[];
for(const renderedFrames of [false,true]){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,3,-10),scene);
 const light=new DirectionalLight('sun',new Vector3(0,-1,0),scene),shadows=new ShadowGenerator(256,light),material=new PBRMaterial('boss-paint',scene);material.unlit=true;material.disableLighting=true;material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;material.metadata={moonforestMonsterToon:true};
 const mesh=MeshBuilder.CreateBox('boss',{},scene);mesh.material=material;const asset={meshes:[mesh]};applyElenaStyle(asset);attachCharacterOutlines(asset,'elena');enableEnemyFade(asset);caveFogFallback(scene).getInternalTexture().isReady=true;
 const created=[],requested=[],seen=new Set(),create=engine.createEffect.bind(engine);engine.createEffect=(...args)=>{const effect=create(...args);const record={shader:typeof args[0]==='string'?args[0]:'source',alpha:/#define ALPHABLEND\b/.test(effect.defines),id:effect.uniqueId,renderId:scene.getRenderId()};requested.push(record);if(!seen.has(effect)){seen.add(effect);created.push(record);}return effect;};
 let frames=0;await prepareBossShaders(asset,{shadows,frame:async()=>{frames++;if(renderedFrames)scene.incrementRenderId();}});
 const warm={frames,renderId:scene.getRenderId(),bodyAlpha:/#define ALPHABLEND\b/.test(mesh.subMeshes[0].effect.defines),created:[...created],requests:requested.length};
 const transitions=[];
 for(const visibility of [1,.999,.5,.1,1]){mesh.visibility=visibility;scene.incrementRenderId();const before=created.length,requestsBefore=requested.length;const ready=material.isReadyForSubMesh(mesh,mesh.subMeshes[0],false);transitions.push({visibility,ready,alpha:/#define ALPHABLEND\b/.test(mesh.subMeshes[0].effect.defines),newEffects:created.length-before,effectRequests:requested.length-requestsBefore});}
 const overlays=[];
 for(const visibility of [1,.999,.5,1]){for(const m of asset.meshes)m.visibility=visibility;applyHitFlash(asset.meshes,.1);const before=created.length;scene.render();overlays.push({visibility,builtinOverlay:mesh.renderOverlay,newEffects:created.length-before,newPrograms:created.slice(before)});}
 records.push({renderedFrames,warm,transitions,overlays});scene.dispose();engine.dispose();
}
const folder=new URL('./',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('shader-cache-baseline.json',folder),JSON.stringify({baseline:'71f9165',records,limitations:['Actual Babylon SDK effect-cache logic under NullEngine; no GPU program compilation or texture upload timing.','The no-render case also represents preparation yields that do not advance a capped or paused scene render ID.']},null,2)+'\n');
console.log(JSON.stringify(records,null,2));
