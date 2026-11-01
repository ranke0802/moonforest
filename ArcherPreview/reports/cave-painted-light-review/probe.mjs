import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {NullEngine,MeshBuilder,PBRMaterial,RawTexture,Constants,Texture} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {applyVillageToon} from '../../src/village-toon.js';
import {applyMonsterToon} from '../../src/monster-toon.js';
import {applyElenaStyle} from '../../src/elena-style.js';
import {bindCavePaintLight,CavePaintLightRuntime,CAVE_PAINT_LIGHT_GLSL} from '../../src/cave-painted-light-runtime.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {CAVE_PAINT_LIGHT_CONFIG as config,sampleCavePaintLight,inspectCavePaintLightCache} from '../../src/cave-painted-light.js';

const report={readOnlySource:true,browserAutomation:false,physicalGpuMeasured:false,probes:[]};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const ready=scene=>{for(const t of scene.textures)if(t.getInternalTexture())t.getInternalTexture().isReady=true;};
for(const ubo of [false,true]){
 const engine=new NullEngine();engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;
 const world=createWorld(engine,{cave:true,touchDevice:true}),scene=world.scene,runtime=scene.metadata.cavePaintLighting;ready(scene);
 let frameUploads=0;const update=runtime.texture.update.bind(runtime.texture);runtime.texture.update=(...args)=>{frameUploads++;return update(...args);};
 const rock=MeshBuilder.CreateBox('probe-rock',{},scene);rock.material=new PBRMaterial('probe-rock',scene);rock.material.metadata={caveRockTone:true};
 const originalTexture=new RawTexture(new Uint8Array([160,130,100,255]),1,1,Constants.TEXTUREFORMAT_RGBA,scene,false,false,Texture.NEAREST_SAMPLINGMODE);rock.material.albedoTexture=originalTexture;applyVillageToon([rock],world.lighting);
 const actor=MeshBuilder.CreateBox('probe-character',{},scene);actor.material=new PBRMaterial('probe-character',scene);applyMonsterToon({meshes:[actor]});applyElenaStyle({meshes:[actor]});ready(scene);scene.render();
 const brightness=JSON.stringify(actor.material.metadata),beforeTexture=rock.material.albedoTexture,beforeGeometry=rock.geometry;
 for(const mesh of [rock,actor,world.ground]){await mesh.material.forceCompilationAsync(mesh);scene.render();}
 const rockEffect=rock.subMeshes.find(s=>s.effect)?.effect,actorEffect=actor.subMeshes.find(s=>s.effect)?.effect,groundEffect=world.ground.subMeshes.find(s=>s.effect)?.effect;
 assert.ok(rockEffect?.fragmentSourceCode.includes('cavePaintFactor(vPositionW)'));assert.ok(groundEffect?.fragmentSourceCode.includes('cavePaintFactor(vPositionW)'));assert.equal(actor.material.pluginManager?.getPlugin('CavePaintLight')??null,null);
 assert.equal(rock.material.fogEnabled,false);assert.equal(world.floorMaterial.fogEnabled,false);assert.equal(actor.material.fogEnabled,true);assert.deepEqual(scene.fogColor.asArray(),[.24,.23,.28]);
 assert.equal(Boolean(rockEffect?.defines?.match(/^#define FOG$/m)),false);assert.equal(Boolean(groundEffect?.defines?.match(/^#define FOG$/m)),false);
 assert.equal(rock.material.albedoTexture,beforeTexture);assert.equal(rock.geometry,beforeGeometry);assert.equal(JSON.stringify(actor.material.metadata),brightness);
 for(let i=0;i<600;i++)world.tick(i/30);assert.equal(frameUploads,0);
 const writes=[],material={setTexture:(...a)=>writes.push(['queued-texture',...a]),setVector4:(...a)=>writes.push(['queued-rect',...a]),setFloat:(...a)=>writes.push(['queued-active',...a])};
 const forbidden={_isDisposed:false,isReady:()=>false,setTexture(){assert.fail('pending effect touched');},setVector4(){assert.fail('pending effect touched');},setFloat(){assert.fail('pending effect touched');}};
 bindCavePaintLight(material,world,forbidden);assert.equal(writes.at(-1)[2],1);forbidden._isDisposed=true;forbidden.isReady=()=>true;bindCavePaintLight(material,world,forbidden);
 const active=scene.metadata.cavePaintLighting;active.dispose();bindCavePaintLight(material,world,forbidden);assert.equal(writes.at(-1)[2],0);assert.notEqual(writes.findLast(w=>w[0]==='queued-texture')[2],active.texture);
 // Restore through production map setup, then count all resource types,
 // including materials and lifecycle observers omitted by the first tests.
 replaceWorldMap(world,'warrior-v4');replaceWorldMap(world,'warrior-v5');ready(scene);scene.render();await flush();
 const counts=()=>({textures:scene.textures.length,materials:scene.materials.length,meshes:scene.meshes.length,geometries:scene.geometries.length,lights:scene.lights.length,beforeRender:scene.onBeforeRenderObservable.observers.length,onDispose:scene.onDisposeObservable.observers.length});
 const base=counts();
 for(let i=0;i<10;i++){replaceWorldMap(world,'warrior-v3');assert.equal(rock.material.fogEnabled,true,'restore the retained environment original fog flag');assert.equal(actor.material.fogEnabled,true);await flush();replaceWorldMap(world,'warrior-v5');ready(scene);scene.render();await flush();assert.equal(rock.material.fogEnabled,false);assert.equal(world.floorMaterial.fogEnabled,false);assert.equal(actor.material.fogEnabled,true);assert.deepEqual(scene.fogColor.asArray(),[.24,.23,.28]);assert.deepEqual(counts(),base);}
 const map=scene.metadata.cavePaintLighting.map,point=[-45,world.terrain.heightAt(-45,38)+.1,38],cpu=sampleCavePaintLight(map,...point);
 assert.ok(CAVE_PAINT_LIGHT_GLSL.includes(config.floorMin.toFixed(1)));assert.ok(CAVE_PAINT_LIGHT_GLSL.includes((config.floorMax-config.floorMin).toFixed(1)));assert.equal(map.data.byteLength,65536);
 const result={uboRequested:ubo,uboUsed:rock.material._uniformBuffer.useUbo,counts:base,roundTrips:10,frameUploads,texture:{bytes:map.data.byteLength,gammaSpace:scene.metadata.cavePaintLighting.texture.gammaSpace,noMipmap:scene.metadata.cavePaintLighting.texture.noMipmap,invertY:scene.metadata.cavePaintLighting.texture.invertY,hasAlpha:scene.metadata.cavePaintLighting.texture.hasAlpha},pendingAndDisposedEffectWrites:0,environmentAlbedoObjectPreserved:rock.material.albedoTexture===beforeTexture,geometryPreserved:rock.geometry===beforeGeometry,environmentEngineFog:false,environmentFogRestoredOnExit:true,characterPaintPlugin:false,characterFogEnabled:actor.material.fogEnabled,actorDefinesFog:Boolean(actorEffect?.defines?.match(/^#define FOG$/m)),characterShaderAppliesEngineFog:Boolean(actorEffect?.fragmentSourceCode?.includes('CalcFogFactor()')),sceneFogColor:scene.fogColor.asArray(),cpuSample:cpu,cpuCache:inspectCavePaintLightCache()};
 engine.dispose();assert.equal(scene.metadata?.cavePaintLighting??null,null);assert.equal(scene.textures.length,0);report.probes.push(result);
}
await writeFile(new URL('probe-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
