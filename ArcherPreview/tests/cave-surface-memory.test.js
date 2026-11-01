import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,PBRMaterial,MeshBuilder} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogSurfaceMemory,CAVE_FOG_GLSL,CAVE_FOG_COVER_FRAGMENT} from '../src/cave-fog-cover.js';
import {applyVillageToon} from '../src/village-toon.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

test('surface memory retains faint low-chroma variation rather than making every submitted surface a black polygon',()=>{
 const luma=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
 for(const source of [[.3,.24,.19],[.55,.50,.32],[1,0,0],[0,0,1],[1,1,1],[0,0,0]]){
  const out=caveFogSurfaceMemory(source);assert.ok(out.every(v=>Number.isFinite(v)&&v>=0&&v<=.24));
  assert.ok(Math.abs(luma(out)-luma(source)*.24)<1e-10,'only 24% of the existing surface luminance remains');
  assert.ok(Math.abs((Math.max(...out)-Math.min(...out))-(Math.max(...source)-Math.min(...source))*.048)<1e-10,'chroma is strongly reduced');
 }
 assert.notDeepEqual(caveFogSurfaceMemory([.3,.24,.19]),caveFogSurfaceMemory([.55,.50,.32]),'distinct real surfaces cannot collapse to the same flat clear colour');
 assert.deepEqual(caveFogSurfaceMemory([-1,2,1]),caveFogSurfaceMemory([0,1,1]));
 assert.match(CAVE_FOG_GLSL,/environment>\.5\?caveFogSurfaceMemory\(base\):caveFogMemoryColor/,'actors retain constant fog memory');
 assert.match(CAVE_FOG_COVER_FRAGMENT,/mix\(rock,vec3\(\.024,\.028,\.038\),haze\)/,'distant cover still converges exactly to clear');
});

test('actual closed canopy keeps opaque geometry/depth while its compiled fog uses surface colour; actors and hidden rooms remain gated',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>engine.dispose());
 const camera=new FreeCamera('view',new Vector3(-6,5,12),scene);camera.setTarget(new Vector3(0,2,0));
 const world={scene,camera,cave:true,terrain:{heightAt:()=>0},lighting:{direction:Vector3.Up(),shadowsActive:false}},fog=new CaveFogRuntime(world,{isOpaque:x=>x>=0&&x<1});world.caveFog=fog;
 fog.texture.getInternalTexture().isReady=true;caveFogFallback(scene).getInternalTexture().isReady=true;
 const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),{gltf,files}=await readRuntimeGltf(new URL(manifest.assets['cave-06-stalactite-canopy'].lods[0].model,base));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');container.addAllToScene();
 const canopy=container.meshes.find(m=>m.getTotalVertices()),geometry=canopy.geometry,indices=Array.from(canopy.getIndices()),positions=Array.from(canopy.getVerticesData('position'));canopy.material=new PBRMaterial('real-canopy',scene);canopy.material.backFaceCulling=true;applyVillageToon([canopy],world.lighting);
 const actor=MeshBuilder.CreateBox('player-preserved',{},scene);actor.position.x=-5;actor.material=new PBRMaterial('character',scene);
 const rear=MeshBuilder.CreateBox('unsubmitted-rear-room',{},scene);rear.position.x=6;rear.material=new PBRMaterial('rear',scene);applyVillageToon([rear],world.lighting);
 fog.update({x:-5,y:0,z:0},0,{force:true});
 let visible=0,memory=0;for(let i=0;i<positions.length;i+=3){if(fog.fog.stateAt(positions[i],positions[i+2])===2)visible++;else memory++;}
 assert.ok(visible>100&&memory>100,'actual canopy crosses both sides of the isolating LOS fixture');
 for(const mesh of [canopy,actor,rear]){fog.attach(mesh.material);mesh.computeWorldMatrix(true);await mesh.material.forceCompilationAsync(mesh);}
 fog.beforeRender();assert.equal(canopy.isVisible,true);assert.equal(rear.isVisible,false,'no room beyond the first occluder is revealed');
 const environmentFlag=material=>{const result={};material.pluginManager.getPlugin('CaveFogOfWar').hardBindForSubMesh({updateFloat:(k,v)=>result[k]=v,updateFloat4(){},setTexture(){}});return result.caveFogEnvironment;};
 assert.equal(environmentFlag(canopy.material),1);assert.equal(environmentFlag(actor.material),0);
 const drawn=[];const original=rear._processRendering;rear._processRendering=function(...args){drawn.push('rear');return original.apply(this,args);};scene.render();assert.equal(drawn.length,0,'hidden geometry is never submitted');
 const code=canopy.subMeshes.find(s=>s.effect)?.effect.fragmentSourceCode;assert.ok(code);
 assert.ok(/finalColor\.rgb=caveFogShadeSurface\(finalColor\.rgb,vPositionW,caveFogEnvironment\)/.test(code),'actual closed canopy shader preserves its sampled surface colour');
 assert.ok(code.indexOf('finalColor.rgb=caveFogShadeSurface(')<code.indexOf('float caveDistanceFog='),'48m exact convergence occurs after surface memory');
 assert.equal(canopy.material.alpha,1);assert.equal(canopy.material.disableDepthWrite,false);assert.equal(canopy.material.backFaceCulling,true,'closed canopy is not made double-sided');assert.equal(canopy.geometry,geometry);assert.deepEqual(Array.from(canopy.getIndices()),indices);assert.deepEqual(Array.from(canopy.getVerticesData('position')),positions);
 fog.dispose();assert.equal(rear.isVisible,true,'render-only gates are restored on map exit');
});
