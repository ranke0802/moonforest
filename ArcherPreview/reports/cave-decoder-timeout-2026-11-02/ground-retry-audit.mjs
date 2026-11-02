import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {NullEngine,Scene,StandardMaterial,MeshBuilder,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {applyVillageGround} from '../../src/village-ground.js';
const base=new URL('../../public/assets/',import.meta.url),config=readFileSync(new URL('witch-cave-ground.json',base)),engine=new NullEngine(),scene=new Scene(engine),ground=MeshBuilder.CreateGround('same-floor',{},scene),material=new StandardMaterial('same-floor',scene);ground.material=material;
const world={scene,ground,floorMaterial:material,terrain:{size:160},placements:[],environmentManifest:'witch-cave',groundManifest:'witch-cave-ground',mapId:'witch-cave',lighting:{}},oldFetch=globalThis.fetch,oldLocation=globalThis.location;
globalThis.location={href:'https://ground-retry-independent.test/game/'};globalThis.fetch=async()=>new Response(config);let created=0;
const createTexture=(scene,callbacks)=>{const texture=new Texture(null,scene);texture.updateURL=url=>{texture.url=url;const internal=new InternalTexture(engine,1);texture._texture=internal;scene.addPendingData(internal);created++;queueMicrotask(()=>{internal.isReady=true;scene.removePendingData(internal);callbacks.onLoad();});};return texture;};
const result={scope:'Actual StandardMaterial/plugin manager and actual applyVillageGround twice on the same live floor. Controlled ready Texture/InternalTexture boundary; no GPU/browser.'};
try{
 await applyVillageGround(world,{createTexture});const firstDetail=material.pluginManager.getPlugin('MoonforestGroundDetail'),firstShade=material.pluginManager.getPlugin('MoonforestVillageToon');result.first={ok:true,plugins:material.pluginManager._plugins.map(p=>p.name),textures:scene.textures.length};
 try{await applyVillageGround(world,{createTexture});result.second={ok:true};}catch(error){result.second={ok:false,error:error.message};}
 result.after={created,plugins:material.pluginManager._plugins.map(p=>p.name),activePlugins:material.pluginManager._activePlugins.map(p=>({name:p.name,detailReady:p.name==='MoonforestGroundDetail'?p.isReadyForSubMesh():null,detailHasLiveInternal:p.name==='MoonforestGroundDetail'?!!p.texture.getInternalTexture():null})),textures:scene.textures.length,pending:scene.getWaitingItemsCount(),diffuseTextureStillAlive:!!material.diffuseTexture?.getInternalTexture()};
 if(process.argv.includes('--after')){
  result.after.sameDetail=material.pluginManager.getPlugin('MoonforestGroundDetail')===firstDetail;result.after.sameShade=material.pluginManager.getPlugin('MoonforestVillageToon')===firstShade;
  assert.equal(material.pluginManager._activePlugins.length,2);assert.ok(result.after.activePlugins.filter(p=>p.name==='MoonforestGroundDetail').every(p=>p.detailReady));assert.equal(result.after.sameDetail,true);assert.equal(result.after.sameShade,true);
  for(let i=0;i<100;i++){result.after.actualMaterialReady=material.isReadyForSubMesh(ground,ground.subMeshes[0],false);if(result.after.actualMaterialReady)break;await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(result.after.actualMaterialReady,true);
 }
 writeFileSync(new URL(process.argv.includes('--after')?'ground-retry-after.json':'ground-retry-before.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{world.releaseGround?.();engine.dispose();globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
