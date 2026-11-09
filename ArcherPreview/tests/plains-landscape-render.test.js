import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3,PBRMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {originalAssetGraph} from './helpers/mobile-profile-contract.js';
import {PLAINS_PLACEMENTS,PLAINS_LOOKOUT,PLAINS_ROUTES,plainsObstacles} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {instantiateStaticMap} from '../src/static-map-instances.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';
import {applyPlainsViewDistance} from '../src/plains-view-distance.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {plainsToForest} from '../src/plains-forest-boundary.js';

const read=name=>JSON.parse(readFileSync(new URL('../public/assets/'+name,import.meta.url))),baseline=JSON.parse(readFileSync(new URL('../reports/plains-landscape-2026-11-03/baseline.json',import.meta.url)));

test('694 retained tufts use the approved 1455-triangle geometry and one native draw batch at 240%',async t=>{
 const manifest=read('great-plains.json'),forest=read('monster-forest.json');
 for(const[id,config]of Object.entries(baseline.assetGraphs))if(id!=='village-approach')assert.deepEqual(originalAssetGraph(manifest.assets[id],id,'great-plains.json'),config,'historical graph matches after exact approved-geometry validation: '+id);
 const addedSourceIds=Object.keys(manifest.assets).filter(id=>!baseline.assetGraphs[id]).sort();assert.deepEqual(addedSourceIds,['forest-04-poison-fungi','forest-05-thorn-bramble']);for(const id of addedSourceIds)assert.deepEqual(manifest.assets[id],forest.assets[id],'native forest foliage reuses its existing complete source graph');assert.equal(manifest.placementCount,PLAINS_PLACEMENTS.length);
 for(const name of ['warrior-v3.json','warrior-v3-ios.json'])assert.equal(read(name).textureProfile.maxSize,8192);
 for(const asset of Object.values(manifest.assets))assert.ok(!asset.highTextures||asset.highTextures.textures.albedo.width<=4096);
 const ground=read('great-plains-ground.json');assert.equal(ground.color.width,2048);assert.equal(ground.color.height,2048);assert.deepEqual(ground.detail,read('village-ground.json').detail);
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);engine.getCaps().instancedArrays=true;scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('grass-budget',1,1.1,17,Vector3.Zero(),scene);camera.maxZ=650;
 const world={scene,camera,terrain:createGreatPlainsTerrain(),plains:true,mapId:'great-plains',plainsViewDistance:2.4,touchDevice:false,lighting:{direction:Vector3.Up(),shadowsActive:false}};applyPlainsViewDistance(world,2.4);
 const config=manifest.assets['grass-tuft'],model=new URL('../public/assets/'+config.lods[0].model,import.meta.url),{gltf,files}=await readRuntimeGltf(model);
 const historicalGrass=originalAssetGraph(config,'grass-tuft','great-plains.json'),historicalGeometry=await readRuntimeGltf(new URL('../public/assets/'+historicalGrass.lods[0].model,import.meta.url)),historicalTriangles=historicalGeometry.gltf.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+historicalGeometry.gltf.accessors[p.indices].count/3,0),0);assert.equal(historicalTriangles,2323);assert.equal(config.lods[0].triangles,1455);
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 const sources=container.meshes.filter(mesh=>mesh.getTotalVertices()>0);assert.equal(sources.length,1);
 for(const source of sources){source.material=new PBRMaterial('actual-grass-geometry',scene);container.materials.push(source.material);}
 prepareVillageInstancing(sources);applyVillageToon(sources,world.lighting);const geometryCount=scene.geometries.length,roots=[];
 t.after(()=>{for(const root of roots)root.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
 const grass=PLAINS_PLACEMENTS.filter(p=>p.asset==='grass-tuft');assert.equal(grass.length,694);
 const layoutUrl=new URL('../src/great-plains-layout.js',import.meta.url),layoutSource=readFileSync(layoutUrl,'utf8');assert.match(layoutSource,/export const PLAINS_PLACEMENTS=joinForestEdge\(makePlacements\(\)\);/);
 const unjoined=layoutSource.replace('export const PLAINS_PLACEMENTS=joinForestEdge(makePlacements());','export const PLAINS_PLACEMENTS=makePlacements();').replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_all,a,spec,b)=>a+new URL(spec,layoutUrl).href+b),generated=(await import('data:text/javascript;base64,'+Buffer.from(unjoined).toString('base64'))).PLAINS_PLACEMENTS.filter(p=>p.asset==='grass-tuft');
 assert.equal(generated.length,760,'the original generation budget is preserved before overlap removal');const keptIds=new Set(grass.map(p=>p.id)),removed=generated.filter(p=>!keptIds.has(p.id));assert.equal(removed.length,66);assert.deepEqual(grass,generated.filter(p=>keptIds.has(p.id)),'remaining native instances keep exact authored identifiers and transforms');
 for(const p of removed){const q=plainsToForest(p);assert.ok(Math.abs(q.x)<38&&q.z>14&&q.z<89,p.id+' was removed outside the shared forest section');}
 for(const p of grass){const {root,facing}=createVillageTransform(world,p,config),instance=instantiateStaticMap(container,name=>p.id+'-'+name);for(const node of instance.rootNodes)node.parent=facing;root.computeWorldMatrix(true);for(const mesh of root.getChildMeshes()){mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();}root.freezeWorldMatrix();roots.push(root);}
 assert.equal(scene.geometries.length,geometryCount,'placements share the original geometry');assert.equal(sources[0].instances.length,grass.length);
 assert.ok(sources[0].instances.every(mesh=>mesh.geometry===sources[0].geometry),'each native instance retains the shipped source geometry');
 await prepareMapMaterials(sources);const triangles=sources[0].getTotalIndices()/3,draws=[],source=sources[0],process=source._processRendering;assert.equal(triangles,1455,'actual current Babylon source geometry meets the approved near result');
 source._processRendering=function(mesh,subMesh,effect,fill,batch,...rest){draws.push((batch.visibleInstances[subMesh._id]??[]).length);return process.call(this,mesh,subMesh,effect,fill,batch,...rest);};
 const views=[];
 for(const [name,x,z,radius]of [['village',-87,-32,17],['crossroads',-5,25,17],['summit',-26,-19,17],['meadow',-55,37,17],['forest',61,-66,17],['wide',-5,25,82]])for(const alpha of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  camera.setTarget(new Vector3(x,world.terrain.heightAt(x,z)+1.45,z));camera.radius=radius;camera.alpha=alpha;draws.length=0;scene.render();
  assert.ok(draws.length<=1,'one source must not turn into individual tuft draws');assert.ok(draws.every(count=>count<=grass.length));views.push({name,alpha,radius,nativeDraws:draws.length,submittedInstances:draws.reduce((a,b)=>a+b,0),triangles:draws.reduce((a,b)=>a+b,0)*triangles});
 }
 assert.ok(views.some(v=>v.submittedInstances>0),'exercise actual Babylon submission');
 const anchors=PLAINS_PLACEMENTS.filter(p=>['tree','rock'].includes(p.kind)&&Math.hypot(p.x,p.z)<103),nearGrass=grass.filter(g=>anchors.some(p=>Math.hypot(g.x-p.x,g.z-p.z)<3)).length;
 const report={scope:'Actual current approved grass geometry, real Babylon native-instance submissions and conservative frustum-only per-view counts. Historical source graphs match only after exact registered geometry/profile validation; current geometry is intentionally changed. Texture/image decoding and physical GPU timing excluded.',browserAutomation:false,gpuTimingMeasured:false,baselineGrass:baseline.grassCount,generatedBeforeForestJoin:generated.length,removedForestOverlap:removed.length,currentGrass:grass.length,baselineGrassWithin3m:baseline.grassNearScenery['3'],currentGrassWithin3m:nearGrass,additionalRockInstances:PLAINS_PLACEMENTS.filter(p=>p.landscape==='ground-rock').length,placementCount:PLAINS_PLACEMENTS.length,uniqueSourceGeometries:new Set(sources.map(mesh=>mesh.geometry)).size,extraSceneGeometryAllocations:scene.geometries.length-geometryCount,sourceTriangles:triangles,historicalSourceTriangles:historicalTriangles,globalGrassTriangleUpperBound:grass.length*triangles,baselineGlobalGrassTriangleUpperBound:baseline.grassCount*historicalTriangles,maximumGrassBaseDraws:Math.max(...views.map(v=>v.nativeDraws)),maximumSubmittedGrass:Math.max(...views.map(v=>v.submittedInstances)),views,sourceAssetGraphsUnchanged:false,historicalSourceGraphsMatchAfterValidatedApprovals:true,approvedGeometryReplacements:Object.keys(manifest.assets).filter(id=>manifest.assets[id].geometryBudget),newlyReferencedExistingForestAssets:addedSourceIds,sourceTextureBudgetsUnchanged:true,groundTexture:ground.color,lookout:PLAINS_LOOKOUT};
 const out=new URL('../reports/plains-landscape-2026-11-03/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('render-validation.json',out),JSON.stringify(report,null,2));
 t.diagnostic(JSON.stringify({grass:grass.length,nearGrass,sourceTriangles:triangles,maxDraws:report.maximumGrassBaseDraws,maxSubmitted:report.maximumSubmittedGrass,noGpuTiming:true}));
});

test('every plains chest and prop remains near its authored location with reachable sides on the sampled terrain',()=>{
 const terrain=createGreatPlainsTerrain(),nav=new VillageNavigation(plainsObstacles()),checks=[];
 for(const point of CHAPTER_POINTS.filter(p=>p.map==='great-plains')){
  const radius=point.tier?.65:.2,placed=nav.findFree(point,radius,105);assert.ok(nav.free(placed,radius,105),point.id+' has no free placement');assert.ok(Math.hypot(point.x-placed.x,point.z-placed.z)<4.1,point.id+' moved too far');
  const approaches=Array.from({length:16},(_,i)=>({x:placed.x+Math.cos(i*Math.PI/8)*1.8,z:placed.z+Math.sin(i*Math.PI/8)*1.8})).filter(p=>nav.free(p,.35,105)&&nav.segmentClear(p,placed,.05));assert.ok(approaches.length>=2,point.id+' lost approach sides');checks.push({id:point.id,placed,groundHeight:terrain.heightAt(placed.x,placed.z),approaches:approaches.length});
 }
 for(const road of PLAINS_ROUTES){let previous;for(const [x,z]of road.samples){const h=terrain.heightAt(x,z);if(previous)assert.ok(Math.abs(h-previous.h)/Math.hypot(x-previous.x,z-previous.z)<.7,road.id+' sampled mesh is too steep');previous={x,z,h};}}
 const hashes=Object.fromEntries(['great-plains-layout.js','great-plains-terrain.js','plains-view-distance.js'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')]));
 writeFileSync(new URL('../reports/plains-landscape-2026-11-03/ground-interactions.json',import.meta.url),JSON.stringify({hashes,checks,terrainVertices:terrain.heights.length,subdivisions:terrain.subdivisions,noBrowserAutomation:true},null,2));
});
