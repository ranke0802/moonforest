import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,MeshBuilder,StandardMaterial,PBRMaterial} from '@babylonjs/core';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {CAVE_FOG_EXPLORED,CAVE_FOG_VISIBLE} from '../src/cave-fog-of-war.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {partitionCaveGround} from '../src/witch-cave-surfaces.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {placementBounds} from '../src/village-demand.js';
import {ElenaPaint} from '../src/elena-style.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {bindCaveFogMaterial,caveFogFallback} from '../src/cave-fog-binding.js';
import {updateBossHealthPosition} from '../src/boss-health-bar.js';

function fixture(t,{terrain=false,realSight=false}={}){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;
 const camera=new FreeCamera('camera',new Vector3(-5,5,13),scene);camera.target=new Vector3(-5,0,0);camera.setTarget(camera.target);
 const field=terrain?createWitchCaveTerrain():{heightAt:()=>0},ground=terrain?createTerrainGround(scene,field):null;
 if(ground){ground.material=new StandardMaterial('ground',scene);partitionCaveGround(ground,field);}
 const shadowMap={renderList:[]},shadows={getShadowMap:()=>shadowMap,addShadowCaster:m=>{if(!shadowMap.renderList.includes(m))shadowMap.renderList.push(m);},removeShadowCaster:m=>{shadowMap.renderList=shadowMap.renderList.filter(n=>n!==m);}};
 const world={scene,camera,terrain:field,ground,cave:true,shadows,touchDevice:true,lighting:{direction:Vector3.Up(),shadowsActive:false}};
 const fog=new CaveFogRuntime(world,realSight?{}:{isOpaque:(x)=>x>=0&&x<1});world.caveFog=fog;
 // NullEngine cannot complete a real RawTexture upload. Mark only this fixture
 // upload ready before forceCompilationAsync; production has no special case.
 fog.texture.getInternalTexture().isReady=true;
 t.after(()=>{fog.dispose();scene.dispose();engine.dispose();});
 return {engine,scene,camera,world,fog,shadowMap};
}
function record(scene,name,x,source=null){
 const root=new TransformNode(name,scene),mesh=source?source.createInstance(name+'-mesh'):MeshBuilder.CreateBox(name+'-mesh',{size:2},scene);
 root.position.x=x;mesh.parent=root;if(!source)mesh.material=new StandardMaterial(name,scene);mesh.computeWorldMatrix(true);
 const b=mesh.getBoundingInfo().boundingBox;
 return {root,meshes:[mesh],placement:{kind:'rock',x,z:0,asset:name},min:b.minimumWorld.clone(),max:b.maximumWorld.clone(),cellActive:true,shadowCaster:false,occluded:false};
}

test('actual render excludes hidden base, LOD, ink and shadow candidates; late arrivals cannot reveal roots',async t=>{
 const {scene,world,fog,shadowMap,camera}=fixture(t);
 const sources=[MeshBuilder.CreateBox('near',{size:2},scene),MeshBuilder.CreateBox('far',{size:1.9},scene)];
 for(const source of sources){source.material=new PBRMaterial(source.name,scene);applyVillageToon([source],world.lighting);prepareTreeOcclusion([source]);source.isVisible=false;}
 sources[0].addLODLevel(16,sources[1]);
 const visible=record(scene,'visible',-5,sources[0]),hidden=record(scene,'hidden',5,sources[0]);
 for(const r of [visible,hidden])r.meshes[0].instancedBuffers.treeCoverage=1;
 world.villagePrepared={records:[visible,hidden]};fog.update({x:-5,z:0},0,{force:true});
 const visibility=new VillageVisibility(world,[visible,hidden]),stats={},ink=new VillageOutlines(world,[visible,hidden],stats);
 t.after(()=>{ink.dispose();visibility.dispose();});
 for(const source of sources)await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();
 const submissions=[];
 for(const source of sources){const process=source._processRendering;source._processRendering=function(mesh,sub,effect,fill,batch,...rest){submissions.push({source,ink:ink.drawing,instances:[...(batch.visibleInstances[sub._id]??[])]});return process.call(this,mesh,sub,effect,fill,batch,...rest);};}
 const shadowOriginal=[visible.meshes[0],hidden.meshes[0]];shadowMap.renderList=shadowOriginal;
 let shadowDuring;
 scene.onBeforeActiveMeshesEvaluationObservable.add(()=>{shadowDuring=[...shadowMap.renderList];});
 for(const distance of [8,22]){
  camera.position.set(-5,4,distance);camera.setTarget(new Vector3(-5,0,0));ink.next=0;submissions.length=0;
  hidden.shadowCaster=true;hidden.occluded=true;visibility.occlusion.reveal({items:[hidden]});assert.equal(hidden.root.isEnabled(),false);
  scene.render();
  assert.ok(submissions.some(c=>c.instances.includes(visible.meshes[0])),'positive visible draw control');
  assert.ok(submissions.every(c=>!c.instances.includes(hidden.meshes[0])),'hidden instance never submitted in base or ink');
  assert.ok(!shadowDuring.includes(hidden.meshes[0]));assert.equal(shadowMap.renderList,shadowOriginal,'temporary shadow filter restores original owner list');
 }
 assert.ok(stats.outlineDraws>0,'real ink pass exercised');
 const late=record(scene,'late-hidden',6,sources[0]);world.villagePrepared.records.push(late);fog.updateRecords([late]);
 assert.equal(late.root.isEnabled(),false,'streamed root gated before first frame');scene.render();assert.equal(late.root.isEnabled(),false);
 assert.equal(sources[0].getLODLevels()[0].mesh,sources[1],'native LOD retained');
});

test('unseen enemy body, contact, spells, ink and UI point gate agree while gameplay visibility is restored',async t=>{
 const {scene,world,fog}=fixture(t),enemy=record(scene,'enemy',5),mesh=enemy.meshes[0];
 const shells=attachCharacterOutlines({meshes:[mesh]},'elena');
 const spell=MeshBuilder.CreateGround('spell',{width:3,height:3},scene);spell.position.x=5;spell.material=new StandardMaterial('spell',scene);spell.material.alpha=.3;
 const encounter={active:true,actor:enemy.root,asset:{meshes:[mesh,...shells]},spell:{mesh:spell},contact:{mesh:MeshBuilder.CreateBox('contact',{},scene)}};
 fog.update({x:-5,z:0},0,{force:true,encounters:[encounter]});fog.beforeRender();
 assert.equal(encounter.fogVisible,false);assert.equal(fog.allowsPoint(enemy.root.position),false);
 for(const m of [mesh,...shells,spell,encounter.contact.mesh])assert.equal(m.isVisible,false);
 fog.restore();assert.equal(mesh.isVisible,true,'render gating does not override combat/death ownership');
 fog.update({x:5,z:0},1,{force:true});fog.beforeRender();assert.equal(encounter.fogVisible,true);assert.equal(fog.allowsPoint(enemy.root.position),true);fog.restore();
 await shells[0].material.forceCompilationAsync(shells[0]);assert.equal(shells[0].material.isReady(shells[0],false,shells[0].subMeshes[0]),true);const code=shells[0].subMeshes[0].effect.fragmentSourceCode;
 assert.match(code,/caveFogHidesInk\(caveInkPosition\)/);assert.ok(world.scene.metadata.caveFogRuntime===fog);
 const hp={hidden:false,style:{}},projection={project:()=>({visible:true,x:30,y:20})};
 fog.update({x:-5,z:0},2,{force:true});fog.beforeRender();updateBossHealthPosition(scene,encounter,hp,projection);assert.equal(hp.hidden,true);
 fog.dispose();assert.equal(encounter.fogVisible,true);updateBossHealthPosition(scene,encounter,hp,projection);assert.equal(hp.hidden,false,'leaving the fog map restores the active enemy HP bar');
 assert.equal(mesh.isVisible,true,'disposing during a gated frame restores body visibility too');
});

test('real steep terrain uses shared original triangles and rejects nonvisible detail patches',async t=>{
 const {scene,world,fog,camera}=fixture(t,{terrain:true,realSight:true});
 camera.position.set(-40,28,60);camera.setTarget(new Vector3(-40,0,38));fog.update({x:-44,z:38},0,{force:true});
 assert.equal(fog.cover.geometry,world.ground.geometry);assert.equal(fog.cover.getVertexBuffer('position'),world.ground.getVertexBuffer('position'));
 assert.equal(fog.cover.getTotalIndices(),world.ground.getTotalIndices());assert.equal(fog.patches.length,36);
 assert.ok(fog.stats.detailPatches>0&&fog.stats.detailPatches<36);
 await world.ground.material.forceCompilationAsync(world.ground);await fog.coverMaterial.forceCompilationAsync(fog.cover);scene.render();
 assert.ok(fog.stats.coverDraws>0&&fog.stats.coverDraws<=36);assert.ok(fog.stats.coverTriangles<=73728);
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url)));
 const actualRecords=CAVE_PLACEMENTS.map(p=>{const bounds=placementBounds(world,p,manifest.assets[p.asset]);return {placement:p,bounds,min:bounds.min,max:bounds.max,root:new TransformNode(p.id,scene),meshes:[]};});
 fog.updateRecords(actualRecords);assert.ok(actualRecords.filter(r=>!r.fogVisible).length>actualRecords.length*.5);
 t.diagnostic(JSON.stringify({...fog.inspect(),actualPlacementCount:actualRecords.length}));
});

test('material fog runs after Elena hit flash and village tint; partial legacy overlays cannot leak',async t=>{
 const {scene,fog}=fixture(t);fog.update({x:-5,z:0},0,{force:true});
 const body=MeshBuilder.CreateBox('partial-body',{size:4},scene);body.position.x=-1;body.material=new PBRMaterial('body',scene);new ElenaPaint(body.material);body.renderOverlay=true;
 fog.beforeRender();assert.equal(body.renderOverlay,false);fog.restore();assert.equal(body.renderOverlay,true);
 await body.material.forceCompilationAsync(body);scene.render();const code=body.subMeshes[0].effect.fragmentSourceCode;
 const flash=code.indexOf('if (elenaHitFlash > 0.0)'),shade=code.indexOf('finalColor.rgb=caveFogShade(');
 assert.ok(flash>=0&&shade>flash,'fog colour is applied after white hit flash');
 assert.equal((code.match(/uniform sampler2D caveFogMap;/g)??[]).length,1);
});

test('cave memory survives map roundtrips, material plugins rebind without observer or geometry leaks',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());
 const material=new PBRMaterial('resident-material',world.scene);world.caveFog.attach(material);
 const liveObservers=()=>material.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length;
 const fogObservers=()=>material.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered&&o.callback.toString().includes('materialDisposals')).length;
 const plugin=material.pluginManager.getPlugin('CaveFogOfWar');let caveObserverCount;
 world.caveFog.update({x:-44,z:38},0,{force:true});const explored=world.caveFog.fog.explored;
 const counts={geometries:world.scene.geometries.length,textures:world.scene.textures.length};
 for(let i=0;i<3;i++){
  const old=world.caveFog;replaceWorldMap(world,'warrior-v4');assert.equal(old.disposed,true);assert.equal(plugin.runtime,null);assert.equal(world.caveFog,null);
  assert.ok(world.scene.clearColor.r>0,'village/forest sky restored');assert.equal(fogObservers(),0);
  replaceWorldMap(world,'warrior-v5');world.caveFog.update({x:29,z:-25.5},i+1,{force:true});
  assert.equal(world.caveFog.fog.explored,explored);assert.equal(world.caveFog.fog.stateAt(-44,38),CAVE_FOG_EXPLORED);
  assert.equal(world.caveFog.fog.stateAt(29,-25.5),CAVE_FOG_VISIBLE);assert.equal(material.pluginManager.getPlugin('CaveFogOfWar'),plugin);assert.equal(plugin.runtime,world.caveFog);
  caveObserverCount??=liveObservers();assert.equal(liveObservers(),caveObserverCount);assert.equal(fogObservers(),1);assert.equal(world.scene.geometries.length,counts.geometries);assert.equal(world.scene.textures.length,counts.textures);
 }
});

test('steady frames reuse inventory and only recheck dynamic objects; new material is attached on first frame',t=>{
 const {scene,fog,world}=fixture(t);
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url)));
 world.villagePrepared={records:CAVE_PLACEMENTS.map(p=>{const bounds=placementBounds(world,p,manifest.assets[p.asset]);return {placement:p,bounds,min:bounds.min,max:bounds.max,root:new TransformNode(p.id,scene),meshes:[]};})};
 fog.update({x:-44,z:38},0,{force:true});fog.beforeRender();fog.restore();
 let attaches=0,records=0;const attach=fog.attach.bind(fog),updateRecords=fog.updateRecords.bind(fog);
 fog.attach=m=>{attaches++;return attach(m);};fog.updateRecords=(...args)=>{records++;return updateRecords(...args);};
 const samples=[];for(let i=0;i<1300;i++){const start=performance.now();fog.beforeRender();fog.restore();if(i>=300)samples.push(performance.now()-start);}
 assert.equal(attaches,0);assert.equal(records,0,'stationary frames do not rescan immutable records');
 const late=new StandardMaterial('new-first-frame',scene);fog.beforeRender();assert.ok(late.pluginManager.getPlugin('CaveFogOfWar'));fog.restore();
 samples.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({scope:'NullEngine CPU gate only; no device FPS claim',records:world.villagePrepared.records.length,frames:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)]}));
 for(let i=0;i<32;i++)record(scene,'dynamic-'+i,i%2?-5:5).root.position.z=Math.floor(i/2)*.2;
 fog.beforeRender();fog.restore();const dynamicSamples=[],refreshSamples=[];
 for(let i=0;i<1300;i++){const start=performance.now();fog.beforeRender();fog.restore();if(i>=300)dynamicSamples.push(performance.now()-start);}
 for(let i=0;i<120;i++){const start=performance.now();fog.update({x:-5+(i%2)*.3,z:0},i*.2,{force:true});refreshSamples.push(performance.now()-start);}
 const summarize=values=>{values.sort((a,b)=>a-b);return {meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:values[Math.floor(values.length*.95)]};};
 t.diagnostic(JSON.stringify({scope:'CPU gate only: 300 static records, 32 dynamic meshes; forced mask refresh includes record/patch upload work',steady:summarize(dynamicSamples),refresh:summarize(refreshSamples)}));
});

test('pooled frozen material and outline bind a complete shared fallback after fog disposal',t=>{
 const {scene,fog}=fixture(t),body=MeshBuilder.CreateBox('pooled',{},scene);body.material=new PBRMaterial('pooled',scene);fog.attach(body.material);body.material.freeze();
 const outline=attachCharacterOutlines({meshes:[body]},'elena')[0],plugin=body.material.pluginManager.getPlugin('CaveFogOfWar'),fallback=caveFogFallback(scene);fallback.getInternalTexture().isReady=true;
 fog.update({x:-5,z:0},0,{force:true});const values={},uniform={updateFloat:(k,v)=>{values[k]=v;},updateFloat4(){},setTexture:(k,v)=>{values[k]=v;}};
 plugin.hardBindForSubMesh(uniform);assert.equal(values.caveFogMap,fog.texture);assert.equal(values.caveFogActive,1);
 fog.dispose();plugin.hardBindForSubMesh(uniform);assert.equal(values.caveFogMap,fallback);assert.equal(values.caveFogActive,0);
 bindCaveFogMaterial(scene,outline.material);assert.equal(outline.material._textures.caveFogMap,fallback);assert.equal(caveFogFallback(scene),fallback);
 assert.equal(fallback.getSize().width,1);assert.equal(fallback.getSize().height,1);assert.equal(scene.textures.filter(t=>t.name==='cave-fog-inactive-sampler').length,1);
});
