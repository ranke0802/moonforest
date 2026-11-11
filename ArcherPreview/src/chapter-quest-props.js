import {Mesh,TransformNode,Vector3,VertexData,StandardMaterial,Color3} from '@babylonjs/core';
import {applyVillageToon} from './village-toon.js';
import {prepareVillageInstancing} from './village-instancing.js';
import {VillageOutlines,prepareVillageInkSource} from './village-outlines.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
import {loadMapContainer} from './map-container.js';
import {instantiateStaticMap} from './static-map-instances.js';
import {prepareMapMaterials} from './map-shader-cache.js';
import {prepareChestOpening,createChestOpening} from './chest-opening.js';
import {lootRarity} from './loot-rarity.js';
import {normalizeChestItems} from './chest-reward-data.js';

// An opaque 24-segment annulus replaces the separate 1,250-triangle torus.
// The points share one 48-triangle geometry and use native instances.
function markerSource(scene,material){
 const mesh=new Mesh('quest-marker-source',scene),data=new VertexData(),positions=[],normals=[],indices=[];
 for(let i=0;i<24;i++)for(const radius of [.3125,.3375]){const a=i*Math.PI/12;positions.push(Math.cos(a)*radius,0,Math.sin(a)*radius);normals.push(0,1,0);}
 for(let i=0;i<24;i++){const a=i*2,b=((i+1)%24)*2;indices.push(a,b,a+1,a+1,b,b+1);}
 data.positions=positions;data.normals=normals;data.indices=indices;data.applyToMesh(mesh);
 mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh._instanceDataStorage.useMonoDataStorageRenderPass=false;
 scene.removeMesh(mesh);return mesh;
}

export function createQuestProps(world,{baseUrl,readManifest=readMapManifest,loadContainer=loadMapContainer,timeoutMs,timers}={}){
 const scene=world.scene;
 let version=0,disposed=false,scope=null,manifest=null,mapPoints=[],owned=[],containers=[],records=[],outlines=null,marker=null,markerMaterial=null,worker=null;
 let models=new Map(),demand=new Set();
 let animationTime=null;const opening=new Set();
 const stats={modelLoads:0,modelFailures:0,instances:0,markerTriangles:48,markerInstances:0,outlineDraws:0,lastError:null};
 const current=revision=>!disposed&&revision===version&&!scene.isDisposed;
 const release=()=>{
  version++;scope?.abort();scope=null;manifest=null;demand.clear();models=new Map();worker=null;opening.clear();animationTime=null;
  outlines?.dispose();outlines=null;for(const root of owned)root.dispose();for(const c of containers)c.dispose();
  for(const p of mapPoints){delete p.marker;delete p.visual;}
  marker?.dispose();markerMaterial?.dispose();marker=null;markerMaterial=null;
  owned=[];containers=[];records=[];mapPoints=[];
  Object.assign(stats,{instances:0,markerInstances:0,outlineInstances:0,outlineTriangles:0,lastError:null});
 };
 const sync=()=>{for(const p of mapPoints){p.marker?.setEnabled(demand.has(p)&&!p.opened&&!p.wasLooted);p.visual?.setEnabled(demand.has(p));}for(const record of records)if(record.point.opened&&record.opening&&!record.opening.state.opened)record.opening.open({immediate:true});};
 async function install(id,revision,signal){
  const config=manifest?.assets[id],profile=config?.lods?.[1]??config?.lods?.[0];if(!profile){models.set(id,'unavailable');return;}
  const base=baseUrl??new URL(`${import.meta.env?.BASE_URL??'./'}assets/quest-props.json`,location.href),url=new URL(profile.model,base);
  const lifetime=new MapLoadLifetime({signal,timeoutMs,timers,stage:'quest-prop-model'}),cancelled=()=>!current(revision)||lifetime.signal.aborted;
  let container,localRoots=[],localRecords=[];
  try{
   await lifetime.run(()=>world.prefetchResources?.(profile.resources??[]));lifetime.check();stats.modelLoads++;
   container=await lifetime.run(()=>loadContainer(url,scene,{signal:lifetime.signal,lifetime}),{onLate:value=>value?.dispose()});lifetime.check();
   if(id==='chest-common')Object.assign(stats,{chestGeometry:prepareChestOpening(container)});
   const sources=container.meshes.filter(m=>m.getTotalVertices?.()>0);
   prepareVillageInstancing(sources);applyVillageToon(sources,world.lighting);world.lighting?.registerMeshes?.(sources);
   for(const mesh of sources){mesh.isPickable=false;world.caveAtmosphere?.attachMaterial(mesh.material);world.caveFog?.attach(mesh.material);}
   await lifetime.run(()=>prepareMapMaterials(sources,{cancelled}));lifetime.check();
   for(const point of mapPoints.filter(p=>p.model===id)){
    const root=new TransformNode('quest-prop-'+point.id,scene),height=point.height??config.height;
    root.position.set(point.x,world.terrain.heightAt(point.x,point.z),point.z);root.rotation.y=point.yaw??0;
    root.scaling.setAll((height/config.bounds[1])*(point.scale??1));root.setEnabled(false);localRoots.push(root);
    const instance=instantiateStaticMap(container,name=>'quest-'+point.id+'-'+name);for(const node of instance.rootNodes)node.parent=root;
    root.computeWorldMatrix(true);const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices?.()>0),chest=id==='chest-common'?createChestOpening(root,{opened:point.opened===true}):null;
    for(const mesh of meshes){mesh.isPickable=false;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();}
    for(const node of root.getChildTransformNodes())node.freezeWorldMatrix();root.freezeWorldMatrix();
    localRecords.push({point,root,meshes,opening:chest,placement:{...point,kind:'ground-detail',scale:point.scale??1},config,center:new Vector3(point.x,root.position.y+height*.5,point.z),radius:Math.max(...config.bounds)*root.scaling.x});
   }
   const tinted=mapPoints.some(point=>point.model===id&&(point.lootTier??point.tier));
   for(const source of sources)prepareVillageInkSource(source,{tinted});
   if(!outlines)outlines=new VillageOutlines(world,[],stats);
   await lifetime.run(()=>outlines.prepare(sources,{cancelled,tinted}));lifetime.check();if(!current(revision))return;
   outlines.addRecords(localRecords);
   containers.push(container);container=null;owned.push(...localRoots);records.push(...localRecords);localRoots=[];
   for(const record of localRecords){
    record.point.visual=record.root;
    if(record.point.model==='chest-common')record.editableEncounter={actor:record.root,active:true,kind:'quest-chest',displayName:record.point.label??'보물 상자',get chestTier(){return record.point.tier;},set chestTier(value){if(!Number.isInteger(value)||value<1||value>5)return;record.point.tier=record.placement.tier=value;record.placement.lootTier=value;const tint=Color3.FromHexString(lootRarity(value).color);for(const mesh of record.meshes)mesh.instancedBuffers.villageInkTint.copyFrom(tint);},get chestItems(){return normalizeChestItems(record.point.chestItems);},set chestItems(value){record.point.chestItems=normalizeChestItems(value);},get chestRewardConfig(){return {id:record.point.id,tier:record.point.tier,dropAssetId:record.point.dropAssetId,chestItems:record.point.chestItems};},get dropAssetId(){return record.point.dropAssetId??'';},set dropAssetId(value){record.point.dropAssetId=value;},get dropEffectEnabled(){return record.point.dropEffectEnabled===true;},set dropEffectEnabled(value){record.point.dropEffectEnabled=!!value;},get chestVisualState(){return record.point.visualOpened===true?'open':record.point.visualOpened===false?'closed':'auto';},set chestVisualState(value){record.point.visualOpened=value==='open'?true:value==='closed'?false:null;record.point.opened=record.point.visualOpened??record.point.wasLooted??false;opening.delete(record.opening);record.opening?.setOpened(record.point.opened);sync();},onEditApplied(){world.saveQuestChestSettings?.(record.point.id,{assetId:record.point.dropAssetId??'',effectEnabled:record.point.dropEffectEnabled===true,visualOpened:record.point.visualOpened,tier:record.point.tier,items:record.point.chestItems});sync();},onEdited(){
     if(record.root.isDisposed())return;const position=record.root.getAbsolutePosition();record.point.x=position.x;record.point.z=position.z;
     record.placement.x=position.x;record.placement.z=position.z;record.center.set(position.x,position.y+(record.point.height??record.config.height)*.5,position.z);
     const ring=record.point.marker;if(ring&&!ring.isDisposed()){ring.unfreezeWorldMatrix();ring.position.set(position.x,world.terrain.heightAt(position.x,position.z)+.05,position.z);ring.computeWorldMatrix(true);ring.freezeWorldMatrix();}
    }};
   }
   stats.instances=records.length;models.set(id,'ready');sync();
  }catch(error){
   if(current(revision)&&!signal.aborted){models.set(id,'failed');stats.modelFailures++;stats.lastError={model:id,name:error.name,message:error.message,code:error.code??null};}
  }finally{for(const root of localRoots)root.dispose();container?.dispose();lifetime.close();}
 }
 function pump(){
  if(worker||!manifest||!scope||disposed)return;
  const revision=version,signal=scope.signal;let next;for(const point of demand)if(point.model&&!models.has(point.model)){next=point;break;}if(!next)return;
  models.set(next.model,'loading');const operation=install(next.model,revision,signal);worker=operation;
  void operation.finally(()=>{if(current(revision)&&worker===operation){worker=null;pump();}});
 }
 const api={
  stats,release,
  async load(points){
   release();if(disposed||scene.isDisposed)return false;
   const revision=version;scope=new AbortController();mapPoints=points;
   const lifetime=new MapLoadLifetime({signal:scope.signal,timeoutMs,timers,stage:'quest-props'});
   try{
    const base=baseUrl??new URL(`${import.meta.env?.BASE_URL??'./'}assets/quest-props.json`,location.href);
    const value=await lifetime.run(()=>readManifest(base));lifetime.check();if(!current(revision))return false;manifest=value;
    markerMaterial=new StandardMaterial('quest-point-marker',scene);markerMaterial.diffuseColor=new Color3(.76,.65,.28);markerMaterial.emissiveColor=world.cave?Color3.Black():new Color3(.05,.04,.01);markerMaterial.specularColor=Color3.Black();
    world.caveFog?.attach(markerMaterial);marker=markerSource(scene,markerMaterial);
    await lifetime.run(()=>prepareMapMaterials([marker],{cancelled:()=>!current(revision)||lifetime.signal.aborted}));lifetime.check();
    for(const point of points){const ring=marker.createInstance('quest-marker-'+point.id);ring.position.set(point.x,world.terrain.heightAt(point.x,point.z)+.05,point.z);ring.isPickable=false;ring.setEnabled(false);ring.freezeWorldMatrix();owned.push(ring);point.marker=ring;}
    stats.markerInstances=points.length;sync();pump();return true;
   }catch(error){if(!current(revision))return false;release();throw error;}finally{lifetime.close();}
  },
  update(points,position,visible){
   demand.clear();for(const p of points)if(position&&Math.hypot(position.x-p.x,position.z-p.z)<30&&visible(p)&&(!world.caveFog||world.caveFog.allowsPoint({x:p.x,y:world.terrain.heightAt(p.x,p.z),z:p.z})))demand.add(p);
   sync();pump();
  },
  openChest(point,{immediate=false}={}){
   if(disposed||point.model!=='chest-common')return false;point.wasLooted=true;point.opened=true;point.visualOpened=null;
   const controller=records.find(record=>record.point===point)?.opening;
   if(controller?.open({immediate})&&controller.state.active)opening.add(controller);
   sync();return !!controller;
  },
  animate(time){
   if(!Number.isFinite(time)||disposed)return;const dt=animationTime===null?0:Math.max(0,time-animationTime);animationTime=time;
   if(!opening.size)return;
   for(const controller of opening)if(!controller.advance(dt))opening.delete(controller);
  },
  async whenIdle(){while(worker){const pending=worker;await pending;if(worker===pending)await Promise.resolve();}},
  isReady(point){return !point.model||point.visual?.isEnabled()===true;},
  editableEncounters(){return records.filter(record=>record.editableEncounter&&record.root.isEnabled()&&!record.root.isDisposed()).map(record=>record.editableEncounter);},
  inspect(){return {...stats,loading:!!worker,models:Object.fromEntries(models),visible:mapPoints.filter(p=>p.visual?.isEnabled()).length,openingChests:opening.size,openedChests:mapPoints.filter(p=>p.model==='chest-common'&&p.opened).length};},
  dispose(){if(disposed)return;disposed=true;release();scene.onDisposeObservable.remove(observer);}
 };
 const observer=scene.onDisposeObservable.addOnce(()=>api.dispose());return api;
}
