import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {AbstractMesh,ArcRotateCamera,Frustum,Mesh,NullEngine,Scene,Vector3} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS} from '../src/village-plains-outskirts.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {VillageTextureStreaming,VILLAGE_TEXTURE_PACING} from '../src/village-texture-streaming.js';
import {VillageActiveCandidates} from '../src/village-active-candidates.js';
import {projectedCoverage,VILLAGE_LOD_COVERAGE} from '../src/village-lod.js';
import {sceneryHighTextureProfile,protectedSceneryTexture} from '../src/mobile-texture-policy.js';

const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base)));
const results=[];

// The pre-change screening oracle. Keep the original frustum-first ordering,
// exact coverage expression, record traversal and stable maximum insertion order.
function legacyCandidates(stream,camera,planes){
  const candidates=new Map();
  for(const record of stream.records){
    if(!record.root.isEnabled())continue;
    const asset=stream.assets.get(record.placement.asset),config=asset?.config;
    if(!config?.highTextures||(asset.baseLevel!==undefined&&asset.baseLevel!==0))continue;
    for(const mesh of record.meshes){
      if(!mesh.isInFrustum(planes))continue;
      const coverage=projectedCoverage(camera,mesh.getBoundingInfo().boundingSphere);
      if(coverage>VILLAGE_LOD_COVERAGE.mid){const id=record.placement.asset;if(!stream.failed.has(id))candidates.set(id,Math.max(coverage,candidates.get(id)??0));}
    }
  }
  return candidates;
}

function productionCandidates(stream){
  stream.nextCheck=0;stream.auditTime=(stream.auditTime??0)+250;stream.update(stream.auditTime);return stream.wanted;
}

function fixture(t,map){
  const engine=new NullEngine({renderWidth:1414,renderHeight:652});engine.getCaps().maxTextureSize=8192;engine.getCaps().etc2={};
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  const [placements,terrainFactory]=map==='great-plains'?[PLAINS_PLACEMENTS,createGreatPlainsTerrain]:map==='monster-forest'?[FOREST_PLACEMENTS,createMonsterForestTerrain]:map==='witch-cave'?[CAVE_PLACEMENTS,createWitchCaveTerrain]:[[...VILLAGE_PLACEMENTS,...VILLAGE_PLAINS_OUTSKIRTS_PLACEMENTS],createVillageTerrain];
  const world={scene,placements,terrain:terrainFactory(),touchDevice:true,camera:new ArcRotateCamera('view',0,1,9.44,Vector3.Zero(),scene)};
  const original=read(map+'.json'),outskirts=map==='village'?read('village-plains-outskirts.json'):null;
  const manifest=outskirts?{...original,assets:{...original.assets,...outskirts.assets}}:original;
  const assets=new Map(),sources=new Map();let declaredPrimitives=0;
  for(const [id,config]of Object.entries(manifest.assets)){
    const selected=config.geometryLod?config.mobileNear:config.lods.find(level=>level.level>0);
    const gltf=read(selected.model),parts=[];
    // Current shipped static near sources have identity rotation/scale. Follow
    // their actual node translations; fail explicitly if that packing changes.
    const parents=new Map();for(const [index,node]of (gltf.nodes??[]).entries())for(const child of node.children??[])parents.set(child,index);
    const position=index=>{const node=gltf.nodes[index];assert.equal(node.matrix,undefined);assert.equal(node.rotation,undefined);assert.equal(node.scale,undefined);const value=Vector3.FromArray(node.translation??[0,0,0]);return parents.has(index)?value.add(position(parents.get(index))):value;};
    for(const [index,node]of (gltf.nodes??[]).entries())if(node.mesh!==undefined)for(const [part,primitive]of gltf.meshes[node.mesh].primitives.entries()){
      const accessor=gltf.accessors[primitive.attributes.POSITION];assert.equal(accessor.type,'VEC3');assert.ok(accessor.min&&accessor.max);
      const source=new Mesh(id+'-bounds-'+index+'-'+part,world.scene);source.buildBoundingInfo(Vector3.FromArray(accessor.min),Vector3.FromArray(accessor.max));source.position.copyFrom(position(index));
      parts.push(source);declaredPrimitives++;
    }
    sources.set(id,parts);assets.set(id,{config,baseLevel:selected.level,source:{materials:[]}});
  }
  const records=world.placements.map(placement=>{
    const {root,facing}=createVillageTransform(world,placement,assets.get(placement.asset).config);
    const meshes=sources.get(placement.asset).map((source,index)=>{const mesh=source.createInstance(placement.id+'-'+index);mesh.parent=facing;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();return mesh;});
    root.computeWorldMatrix(true);root.freezeWorldMatrix();facing.freezeWorldMatrix();return {root,facing,placement,meshes};
  });
  world.villageStreaming={active:true,pending:Promise.resolve()};
  const stats={},stream=new VillageTextureStreaming(world,assets,records,base,stats);
  t.after(()=>{stream.dispose();engine.dispose();});
  const camera=world.camera;camera.radius=9.44;camera.beta=.97;camera.fov=.65;
  const setView=(x,z,alpha=5.44,beta=.97,radius=9.44)=>{camera.mode=0;camera.alpha=alpha;camera.beta=beta;camera.radius=radius;camera.setTarget(new Vector3(x,world.terrain.heightAt(x,z)+1.35,z));camera.getViewMatrix(true);camera.getProjectionMatrix(true);return Frustum.GetPlanes(camera.getTransformationMatrix());};
  const queryRecords=records.filter(r=>['prop','garden','shrub'].includes(r.placement.kind)&&Math.hypot(r.placement.x,r.placement.z)<=44);
  return {engine,world,assets,records,stream,camera,stats,setView,counts:{records:records.length,assets:assets.size,nearSourcePrimitives:declaredPrimitives,instanceMeshes:records.reduce((n,r)=>n+r.meshes.length,0),highTextureRecords:records.filter(r=>assets.get(r.placement.asset).config.highTextures).length,nearEligibleRecords:records.filter(r=>assets.get(r.placement.asset).config.highTextures&&assets.get(r.placement.asset).baseLevel===0).length,occlusionEligibleRecords:queryRecords.length,occlusionGroups:new Set(queryRecords.map(r=>Math.floor(r.placement.x/12)+':'+Math.floor(r.placement.z/12))).size,protectedAssets:[...assets].filter(([id,a])=>protectedSceneryTexture(id,a.config)).map(([id])=>id)}};
}

const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
function timed(fn,iterations=80){const start=performance.now();for(let i=0;i<iterations;i++)fn();return (performance.now()-start)/iterations;}

test('four shipped map bounds preserve every screened asset maximum, insertion order and selected texture profile',t=>{
  for(const map of ['village','great-plains','monster-forest','witch-cave']){
    const f=fixture(t,map),profiles=[...f.assets].map(([id,a])=>[id,JSON.stringify(sceneryHighTextureProfile(id,a.config,true))]);
    const positions=map==='great-plains'?[[-87,-32],[-74.1,-28.3],[-5,25],[50,-51]]:map==='village'?[[0,24.8],[.35,70],[0,0],[25,-20]]:map==='monster-forest'?[[0,46],[28,-38],[-25,0],[0,0]]:[[-42,43],[0,0],[30,-30],[-39,39]];
    let checks=0,oldFrustum=0,newFrustum=0;
    for(const [step,[x,z]]of positions.entries())for(const alpha of [.1,1.19,5.44,7.83]){
      for(const [index,record]of f.records.entries())record.root.setEnabled(step!==2||index%3!==0);
      const planes=f.setView(x,z,alpha,step%2?.97:1.35,step===3?28:9.44);
      const native=AbstractMesh.prototype.isInFrustum;let calls=0;
      AbstractMesh.prototype.isInFrustum=function(...args){calls++;return native.apply(this,args);};
      try{
        const expected=legacyCandidates(f.stream,f.camera,planes);oldFrustum+=calls;calls=0;
        const actual=productionCandidates(f.stream);newFrustum+=calls;assert.deepEqual([...actual],[...expected],map+' view '+checks);
      }finally{AbstractMesh.prototype.isInFrustum=native;}
      checks++;
    }
    // Orthographic, failed assets and late near-LOD changes retain the oracle.
    f.camera.mode=1;Object.assign(f.camera,{orthoLeft:-14,orthoRight:14,orthoTop:8,orthoBottom:-8});f.camera.getProjectionMatrix(true);
    let planes=Frustum.GetPlanes(f.camera.getTransformationMatrix());assert.deepEqual([...productionCandidates(f.stream)],[...legacyCandidates(f.stream,f.camera,planes)]);checks++;
    const first=[...f.assets.keys()][0];f.stream.failed.add(first);f.assets.get(first).baseLevel=2;
    assert.deepEqual([...productionCandidates(f.stream)],[...legacyCandidates(f.stream,f.camera,planes)]);checks++;
    assert.deepEqual([...f.assets].map(([id,a])=>[id,JSON.stringify(sceneryHighTextureProfile(id,a.config,true))]),profiles);
    for(const record of f.records)record.root.setEnabled(true);f.assets.get(first).baseLevel=0;f.stream.failed.clear();
    planes=f.setView(...positions[map==='great-plains'?1:0]);
    const oldTimes=[],newTimes=[];for(let run=0;run<7;run++){
      const legacy=()=>legacyCandidates(f.stream,f.camera,planes),optimized=()=>productionCandidates(f.stream);
      if(run%2){newTimes.push(timed(optimized));oldTimes.push(timed(legacy));}else{oldTimes.push(timed(legacy));newTimes.push(timed(optimized));}
    }
    assert.equal(newFrustum,oldFrustum,map+' preserves the original frustum/culling work');
    const registry=new VillageActiveCandidates(f.world.scene),registered=new Set();
    t.after(()=>registry.dispose());
    for(const record of f.records){
      for(const mesh of record.meshes){registry.add(mesh);registered.add(mesh);}
      const empty=new Mesh(record.placement.id+'-native-clone-root',f.world.scene);empty.parent=record.facing;registry.addEmptyRoot(empty);registered.add(empty);
    }
    const registryCases=[];
    for(const enabledFraction of [.08,.16,.6]){
      f.records.forEach((record,index)=>record.root.setEnabled(index<f.records.length*enabledFraction));
      const selection=f.world.scene.getActiveMeshCandidates();
      const expected=f.world.scene.meshes.filter(mesh=>!registered.has(mesh)||mesh.isEnabled());assert.deepEqual(selection.data.slice(0,selection.length),expected);
      const times=[];for(let run=0;run<5;run++)times.push(timed(()=>f.world.scene.getActiveMeshCandidates(),150));
      assert.equal(registry.stats.sceneScans,0);registryCases.push({enabledFraction,owned:registry.stats.owned,disabledGuards:registry.stats.registryChecks,submitted:registry.stats.submitted,medianMs:median(times),stableFrameSceneScans:registry.stats.sceneScans});
    }
    const row={map,...f.counts,oracleViews:checks,identicalCandidateOrderAndCoverage:true,profilesUnchanged:true,oracleFrustumTests:oldFrustum,productionFrustumTests:newFrustum,cpuMedianMs:{screenOnly:median(oldTimes),productionUpdate:median(newTimes)},pairedRunsMs:{screenOnly:oldTimes,productionUpdate:newTimes},activeCandidateRegistry:registryCases};
    results.push(row);t.diagnostic(JSON.stringify(row));
  }
});

test('custom culling keeps the original frustum-before-bounds call order',t=>{
  const f=fixture(t,'great-plains'),record=f.records.find(r=>r.meshes.length&&f.assets.get(r.placement.asset).config.highTextures),mesh=record.meshes[0],calls=[];
  f.stream.records=[record];const planes=f.setView(-74.1,-28.3);record.root.setEnabled(true);f.assets.get(record.placement.asset).baseLevel=0;
  const get=mesh.getBoundingInfo;mesh.isInFrustum=()=>{calls.push('frustum');return true;};mesh.getBoundingInfo=function(){calls.push('bounds');return get.call(this);};
  productionCandidates(f.stream);assert.deepEqual(calls.slice(0,2),['frustum','bounds']);
  calls.length=0;mesh.isInFrustum=()=>{calls.push('frustum');return false;};productionCandidates(f.stream);assert.deepEqual(calls,['frustum']);
});

test('resident candidates retain their selected profiles and exact pacing policy',t=>{
  const f=fixture(t,'village'),ids=[...f.assets.keys()].filter(id=>f.stream.profile(id));
  const candidates=new Map(ids.slice(0,4).map((id,index)=>[id,4-index]));
  for(const id of candidates.keys())f.stream.resident.set(id,{bytes:1,resolution:4096,readyAt:0,textures:{},originals:[]});
  const profile=f.stream.profile;f.stream.profile=()=>{throw new Error('all-resident admission must not inspect profiles');};
  assert.equal(f.stream.admission(candidates,10000),null);f.stream.profile=profile;
  f.stream.syncStats();assert.equal(f.stats.highTextureAssets,4);assert.equal(f.stats.highTextureBytes,4);assert.equal(f.stats.highTextureMax,4096);
  assert.deepEqual(VILLAGE_TEXTURE_PACING,{checkMs:250,motionHoldMs:600,visibleGapMs:750,fillDwellMs:250,replacementDwellMs:3000,minResidenceMs:6000,mobileMovingMs:2000,mobileIdleMs:750,desktopMovingMs:750,desktopIdleMs:350,visibleReplacementRatio:1.5});
});

test.after(()=>{
  const directory=new URL('../reports/bear-combat-2026-11-05/',import.meta.url);mkdirSync(directory,{recursive:true});
  writeFileSync(new URL('scenery-validation.json',directory),JSON.stringify({baseline:'99fcd56',passed:results.length===4,maps:results,changedPolicy:false,activeCandidatesChanged:false,
    screeningSourceChanged:false,evidence:'Read-only audit of the original culling, exact projected coverage, full texture update and active-candidate registry. No screening optimization was retained without demonstrated gain.',
    relatedOcclusionValidation:'occlusion-validation.json',
    afterRenderBoundary:{sdkEnd:'node_modules/@babylonjs/core/Instrumentation/sceneInstrumentation.js:442',observers:[{source:'src/village-occlusion.js:48',work:'Poll available GPU occlusion results, then draw up to two query proxies; gated by GPU query support.'},{source:'src/village-demand.js:152',work:'Every 200 ms, recompute/cache map demand and choose the next missing geometry tier.'},{source:'src/village-texture-streaming.js:41',work:'Every 250 ms, screen instances and update texture admission/residency.'}],interpretation:'These map observers are normally registered after the SDK end counter. Contact callbacks onAfterAnimations are inside that SDK interval. State resources does not identify synchronous transfer cost: prefetch runs through deferred Promise jobs. Measure observer costs before attributing a recorded sceneCallMs minus sceneMs gap.'},
    rejectedExperiment:'Size-first native-instance rejection removed 83–98% of plane tests but did not consistently improve local CPU time, so it is not included. The measured texture screening cost is not evidence for attributing the logged 14–17 ms after-render gaps to this scan.',
    limitations:['Packed glTF POSITION accessor bounds, authored node translations and actual placement/terrain transforms drive real Babylon InstancedMesh bounds; source triangles/materials are not rendered.','Paired Node/NullEngine CPU timings are local screening measurements, not mobile FPS, browser/GPU timings, or proof that screening caused a specific recorded delay.','Runtime root visibility and geometry residency vary; the count includes every authored placement and near-source primitive, while oracle views also disable placements and change LOD eligibility.','No texture cap, protected-house profile, coverage threshold, dwell/cooldown, geometry LOD, collision, boss, rotation gate or update frequency changes.']},null,2)+'\n');
});
