import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,Frustum,PBRMaterial,HemisphericLight,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {installVillageGeometry} from '../src/village-streamed-environment.js';
import {placementBounds} from '../src/village-demand.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {TreeOcclusion,prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {applyVillageToon} from '../src/village-toon.js';
import {SceneLighting} from '../src/scene-lighting.js';
import {MovingSky} from '../src/sky.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';

test('real tree instances keep all visible base draws and coverage through horizontal rotation',async t=>{
 const engine=new NullEngine({renderWidth:1204,renderHeight:652}),scene=new Scene(engine);scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;
 t.after(()=>engine.dispose());const camera=new ArcRotateCamera('camera',1.2,1.14,23,new Vector3(0,1.22,6),scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=300;
 const ambient=new HemisphericLight('light',Vector3.Up(),scene),key=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene),rim=new DirectionalLight('rim',Vector3.Down(),scene),shadows=new ShadowGenerator(256,key),sky=new MovingSky(scene);scene.fogStart=88;scene.fogEnd=105;
 const lighting=new SceneLighting(scene,{ambient,key,rim,shadows,touchDevice:false,village:true}),world={scene,camera,terrain:createVillageTerrain(),touchDevice:false,lighting,shadows};
 const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('village.json',base))),records=[],sources=[];
 for(const [id,config]of Object.entries(manifest.assets).filter(([,c])=>c.category==='tree')){
  const asset={tiers:new Map(),baseLevel:Infinity};
  for(const level of [0,1,2]){
   const {gltf,files}=await readRuntimeGltf(new URL(config.lods[level].model,base));for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
   const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);for(const m of meshes){m.material=new PBRMaterial(id+level,scene);m.material.backFaceCulling=false;}
   prepareVillageInstancing(meshes);
   applyVillageToon(meshes,lighting);prepareTreeOcclusion(meshes);installVillageGeometry(asset,container,level,world);sources.push(...meshes);lighting.registerMeshes(meshes);
  }
  for(const placement of VILLAGE_PLACEMENTS.filter(p=>p.asset===id)){
   const {root,facing}=createVillageTransform(world,placement,config),copies=asset.source.instantiateModelsToScene(n=>root.name+n,false,{doNotInstantiate:false});for(const node of copies.rootNodes)node.parent=facing;
   const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()>0);for(const m of meshes){m.computeWorldMatrix(true);m.freezeWorldMatrix();}facing.freezeWorldMatrix();root.freezeWorldMatrix();const bounds=placementBounds(world,placement,config);
   records.push({root,meshes,placement,min:bounds.min,max:bounds.max});
  }
 }
 const visibility=new VillageVisibility(world,records),fade=new TreeOcclusion(records.filter(r=>Math.hypot(r.placement.x,r.placement.z)<54).map(r=>r.root)),ink=new VillageOutlines(world,records,{});t.after(()=>{ink.dispose();visibility.dispose();});
 for(const source of sources)await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();
 const drawn=new Set();
 for(const source of sources){const original=source._processRendering;source._processRendering=function(mesh,subMesh,effect,fill,batch,...args){
  const isBase=!ink.drawing&&!scene._isInIntermediateRendering(),instances=batch.visibleInstances[subMesh._id]??[];
  const result=original.call(this,mesh,subMesh,effect,fill,batch,...args);
  if(isBase){
   assert.equal(engine.getDepthWrite(),true,'tree base must write depth before the sky');
   const data=batch.parent.instancesData;let offset=batch.renderSelf[subMesh._id]?16:0;
   for(const m of instances){drawn.add(m);assert.ok(m.instancedBuffers.treeCoverage>=.44,'tree cannot become fully transparent');assert.deepEqual(Array.from(data.slice(offset,offset+16)),Array.from(m.getWorldMatrix().m),'rendered instance transform must match placement');offset+=16;}
  }
  return result;
 };}
 let examined=0;
 for(let frame=0;frame<160;frame++){
  camera.alpha=.4+frame*.033;camera.beta=frame%40<20?.92:1.18;camera.getViewMatrix();camera.getProjectionMatrix();visibility.update(camera.globalPosition,new Vector3(0,.12,6),1/30);fade.update(camera.globalPosition,new Vector3(0,.12,6),1/30);
  const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),expected=records.filter(r=>r.root.isEnabled()).flatMap(r=>r.meshes).filter(m=>m.isInFrustum(planes));drawn.clear();scene.render();
  for(const m of expected){
   assert.ok(drawn.has(m),'missing tree base '+m.name+' frame '+frame);examined++;
  }
 }
 let matrixBytes=0;
 for(const source of sources){const passes=Object.values(source._instanceDataStorage.renderPasses);assert.ok(passes.length<=2,'only camera and shadow buffers; no per-frame allocations');for(const pass of passes)matrixBytes+=pass.instancesData?.byteLength??0;}
 assert.ok(matrixBytes<262144,'bounded transform buffers, never a geometry/texture copy');
 assert.ok(examined>5000);t.diagnostic('Verified '+examined+' visible tree draws across 160 camera rotations; matrix buffers '+matrixBytes+' bytes.');
});
