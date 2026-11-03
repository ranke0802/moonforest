import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,PBRMaterial,HemisphericLight,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CAVE_LABORATORY_GEOMETRY,CAVE_LABORATORY_CLIP_GLSL,activeLaboratoryClip,laboratoryLegacySource,laboratoryHidesLegacy,clipLaboratoryCeiling} from '../src/cave-laboratory-geometry.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {applyVillageToon} from '../src/village-toon.js';
import {CaveSurfaceShade} from '../src/witch-cave-surfaces.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {installVillageShadowFade} from '../src/village-shadow-fade.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const approved={...CAVE_LABORATORY_GEOMETRY,enabled:true,version:1,revision:'actual-source-test-only',sourceSha256:'1'.repeat(64),terrainSha256:'2'.repeat(64)};
const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));

test('legacy clip has identical world-XZ boundaries for color, ink, shadow and exact subtraction, irrespective of height',()=>{
 const b=approved.bounds;
 for(const y of [-100,0,5.7,100])for(const [x,z,hidden]of [[b.minX,b.minZ,true],[b.maxX,b.maxZ,true],[-35,-18,true],[b.minX-1e-4,-18,false],[-35,b.maxZ+1e-4,false]])assert.equal(laboratoryHidesLegacy({x,y,z},approved),hidden);
 assert.equal(laboratoryHidesLegacy({x:-35,z:-18},{...approved,enabled:false}),false);assert.equal(laboratoryLegacySource('cave-01-eroded-wall'),true);assert.equal(laboratoryLegacySource('cave-03-great-column'),true);for(const id of ['cave-derived-laboratory-rock','cave-18-alchemy-workbench','wall-01-straight'])assert.equal(laboratoryLegacySource(id),false);
 const geometry={positions:Float32Array.from([-50,0,-18,-20,0,-18,-20,10,-18,-50,10,-18]),indices:Uint32Array.from([0,1,2,0,2,3])},clipped=clipLaboratoryCeiling(geometry,approved);
 let area=0;for(let i=0;i<clipped.indices.length;i+=3){const p=[0,1,2].map(k=>Array.from(clipped.positions.slice(clipped.indices[i+k]*3,clipped.indices[i+k]*3+3))),ab=p[1].map((v,k)=>v-p[0][k]),ac=p[2].map((v,k)=>v-p[0][k]);area+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])*.5;const centre={x:p.reduce((s,v)=>s+v[0],0)/3,z:-18};assert.equal(laboratoryHidesLegacy(centre,approved),false);}
 assert.equal(area,50,'the two exterior vertical strips remain; all world-Y within the rectangle retires');
});

for(const ubo of [false,true])test('actual old rock instances compile matching color/ink/depth clip with correct world placement, UBO '+ubo,async t=>{
 const engine=new NullEngine();engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;engine.getCaps().instancedArrays=true;
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.fogStart=22;scene.fogEnd=48;scene.metadata={caveLaboratoryGeometry:approved};const terrain=createWitchCaveTerrain(),camera=new ArcRotateCamera('actual-rock',0,1.2,15,Vector3.Zero(),scene);new HemisphericLight('fill',Vector3.Up(),scene);const key=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene),shadows=new ShadowGenerator(512,key);shadows.usePercentageCloserFiltering=true;installVillageShadowFade(shadows);caveFogFallback(scene).getInternalTexture().isReady=true;
 const world={scene,camera,cave:true,touchDevice:true,terrain,lighting:{direction:Vector3.Up(),shadowsActive:true}},records=[],sources=[],plugins=[],containers=[];t.after(()=>engine.dispose());let inside=0,outside=0;
 for(const id of ['cavern-55','cavern-85']){
  const placement=CAVE_PLACEMENTS.find(p=>p.id===id),config=manifest.assets[placement.asset],{gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));assert.ok(gltf.materials.every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'),'fixture preserves the actual source opacity mode');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');containers.push(container);
  const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);for(const source of meshes){source.material=new PBRMaterial(id,scene);source.material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;source.material.metadata={caveRockTone:true,caveLegacyLaboratoryClip:laboratoryLegacySource(placement.asset)};source.receiveShadows=true;prepareVillageInstancing([source]);applyVillageToon([source],world.lighting);plugins.push(new CaveSurfaceShade(source.material));sources.push(source);}
  const {root,facing}=createVillageTransform(world,placement,config),instance=container.instantiateModelsToScene(n=>id+n,false,{doNotInstantiate:false});for(const node of instance.rootNodes)node.parent=facing;const actual=root.getChildMeshes().filter(m=>m.getTotalVertices()>0);records.push({root,meshes:actual,placement});
  for(const mesh of actual){const matrix=mesh.computeWorldMatrix(true),position=mesh.getVerticesData('position');shadows.addShadowCaster(mesh,false);for(let i=0;i<position.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(position,i),matrix);if(laboratoryHidesLegacy(p,approved))inside++;else outside++;}}
 }
 assert.ok(inside>0&&outside>0,'actual transformed legacy source has both retired and retained vertices');
 const first=records[0].meshes[0];first.computeWorldMatrix(true);const centre=first.getBoundingInfo().boundingBox.centerWorld;camera.setTarget(centre);camera.radius=16;
 const ink=new VillageOutlines(world,records,{});t.after(()=>ink.dispose());for(const source of sources)await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();
 const shadowEffects=[];let shadowEffect;shadows.onBeforeShadowMapRenderObservable.add(effect=>{shadowEffect=effect;shadowEffects.push(effect);});scene.render();assert.equal(shadowEffects.length,2,'positive depth draws for both actual opaque sources');
 const color=sources[0].subMeshes[0].effect;assert.ok(color?.isReady());assert.match(color.fragmentSourceCode,/caveLaboratoryClip\(vPositionW,caveLegacyLabClip,caveLaboratoryRect\)/);assert.match(ink.materialFor(sources[0]).getEffect().fragmentSourceCode,/caveLaboratoryClip\(inkWorldPosition,inkLegacyLabClip,inkLaboratoryRect\)/);assert.ok(shadowEffect?.isReady());assert.match(shadowEffect.fragmentSourceCode,/caveLaboratoryClip\(vVillageLaboratoryPosition,villageLegacyLabClip,villageLaboratoryRect\)/);assert.match(shadowEffect.vertexSourceCode,/vVillageLaboratoryPosition=worldPos.xyz/);assert.match(shadowEffect.vertexSourceCode,/finalWorld=mat4\(world0,world1,world2,world3\)/);
 for(const source of sources){assert.equal(activeLaboratoryClip(scene,source.material),approved);assert.equal(source.material.metadata.villageToon,true);}
 const values={},buffer={updateFloat:(k,v)=>values[k]=v,updateFloat4:(k,...v)=>values[k]=v};plugins[0].bindForSubMesh(buffer);assert.equal(values.caveLegacyLabClip,1);assert.deepEqual(values.caveLaboratoryRect,[-48,-30,-23,-7]);scene.metadata.caveLaboratoryGeometry=null;plugins[0].bindForSubMesh(buffer);assert.equal(values.caveLegacyLabClip,0);assert.equal(activeLaboratoryClip(scene,sources[0].material),null);
 t.diagnostic(JSON.stringify({ubo,insideVertices:inside,outsideVertices:outside,geometryUnmodified:true,shadowDepthDraws:shadowEffects.length,commonShaderFunction:CAVE_LABORATORY_CLIP_GLSL.includes('p.x>=rect.x&&p.z>=rect.y'),gpuRasterizationMeasured:false}));
});
