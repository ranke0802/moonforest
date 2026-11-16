import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';
import {BossBattle} from '../src/boss-battle.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {regularWolfManifest,isRegularWolf} from '../src/regular-wolf-spec.js';
import {mapNavigation} from '../src/world.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {PLAINS_MONSTER_SPAWNS} from '../src/plains-monster-spawns.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {placementBounds} from '../src/village-demand.js';
import {safeMonsterSceneryHome,monsterScenerySpace,monsterSceneryRadius} from '../src/monster-scenery-space.js';

const ids=['plains-fox-west-1','plains-fox-east-1','plains-village-wolf-south-1','plains-village-wolf-north-1'];
const rows=ids.map(id=>PLAINS_MONSTER_SPAWNS.maps['great-plains'].find(row=>row.id===id));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=value=>Math.round(value*1e5)/1e5;
const prepare=()=>createBossPreparation({incremental:false});

// Same native-model factory boundary as monster-territory.test.js, with the
// actual R5 homes, production plains obstacles and triangulated terrain.
async function fixture(t){
 setWorldCharacter('warrior-plains');const engine=new NullEngine(),scene=new Scene(engine);Object.assign(engine.getCaps(),{maxVertexUniformVectors:256,maxVertexTextureImageUnits:16,textureFloat:true});scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,6,-16),scene);
 const player=new TransformNode('player',scene),world={scene,release:'moonforest-0.2',mapId:'great-plains',terrain:createGreatPlainsTerrain(),navigation:mapNavigation({plains:true,village:true}),shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/great-plains.json',import.meta.url)));world.villageRenderRecords=PLAINS_PLACEMENTS.filter(p=>p.kind==='rock').map(placement=>({placement,...placementBounds(world,placement,manifest.assets[placement.asset])}));
 const foot=new TransformNode('player-foot',scene),head=new TransformNode('player-head',scene);foot.parent=head.parent=player;head.position.y=1.6;
 const battle=new BossBattle(world,()=>{},()=>{},()=>true),loaders=[],libraries=[];
 const factory=createActorEncounterFactory({world,battle,getPlayer:()=>player,libraryFactory(_scene,id){
  const library={loads:0,async load(){if(this.loads)return;this.loads++;const base=new URL('../public/assets/',import.meta.url),manifest=isRegularWolf(id)?regularWolfManifest(id):id;this.config=JSON.parse(readFileSync(new URL(manifest+'.json',base)));const {gltf,files}=await readRuntimeGltf(new URL(this.config.model,base));
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression'&&value!=='KHR_texture_basisu');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loaders.push(loader);loader.skipMaterials=true;this.container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of this.container.animationGroups)group.stop();
   const paint=new StandardMaterial(id+'-r6-awareness',scene);for(const mesh of this.container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  }};libraries.push(library);return {library,owned:false};
 }});
 t.after(async()=>{await factory.dispose();for(const library of libraries)library.container?.dispose();for(const loader of loaders)loader.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');});return {factory,world,player};
}
function placePlayer(f,point){f.player.position.set(point.x,0,point.z);f.world.terrain.place(f.player.position);}
function step(f,e,frames){for(let frame=0;frame<frames;frame++){e.update(1/60,f.player);e.poseAndContacts(f.player,{state:'idle',actionId:null},null,null);}}
function chooseOuter(f,e,row,back=false){
 const zone=row.territory,desired=e.actor.rotation.y+(back?Math.PI:0),radii=[(zone.combatRadius+zone.radius)/2,zone.radius-.65,zone.combatRadius+.8];
 for(const radius of radii)for(const offset of [0,.12,-.12,.24,-.24,.4,-.4,.55,-.55]){
  const angle=desired+offset,p={x:e.actor.position.x+Math.sin(angle)*radius,z:e.actor.position.z+Math.cos(angle)*radius},centerDistance=distance(p,zone);
  if(centerDistance<=zone.combatRadius+.4||centerDistance>=zone.radius-.15||distance(p,e.actor.position)<=zone.combatRadius+.4||!f.world.navigation.free(p,.35))continue;
  return {...p,angle};
 }
 throw Error(row.id+': no actual navigable '+(back?'rear':'front')+' outer watch position');
}
function chooseInner(f,e,row){
 const zone=row.territory;
 for(const radius of [zone.combatRadius-.6,zone.combatRadius*.65,2.4,1.8])for(let i=0;i<64;i++){
  const angle=e.actor.rotation.y+i*Math.PI/32,p={x:e.actor.position.x+Math.sin(angle)*radius,z:e.actor.position.z+Math.cos(angle)*radius};
  if(distance(p,zone)>=zone.radius-.3||!f.world.navigation.free(p,.35)||!f.world.navigation.segmentClear(e.actor.position,p,0,true))continue;
  return {...p,angle};
 }
 throw Error(row.id+': no actual navigable clear inner approach');
}
async function activate(f,adapter,row){
 adapter.hide();placePlayer(f,{x:row.territory.x+row.territory.radius+6,z:row.territory.z});const home=safeMonsterSceneryHome(f.world,row,new Vector3(row.x,row.y,row.z));assert.ok(home);await adapter.activate({position:new Vector3(home.x,home.y,home.z),rotationY:row.yaw,row},{preparation:prepare()});const e=adapter.encounter;e.brain.random=()=>.5;e.alignPose();assert.ok(monsterScenerySpace(f.world).free(e.actor.position,monsterSceneryRadius(row.definitionId)));return e;
}
const scales=e=>e.asset.transformNodes.map(node=>[node,node.scaling.clone()]);
const sameScales=before=>{for(const [node,scale]of before)assert.ok(node.scaling.equalsWithEpsilon(scale,1e-6),node.name+': actual rig scale changed');};

test('all four actual R5 singles visibly notice front and rear outer approaches while keeping their lying body and Alert endpoint',async t=>{
 const f=await fixture(t),proof=[];
 for(const row of rows){assert.ok(row);const adapter=f.factory(row.definitionId);
  for(const rear of [false,true]){
   const e=await activate(f,adapter,row),sourceScales=scales(e),position=e.actor.position.clone(),yaw=e.actor.rotation.y,pelvis=e.nodes.pelvis.getAbsolutePosition().clone(),chest=e.nodes.chest.getAbsolutePosition().clone(),restHead=e.nodes.head.getAbsolutePosition().y;
   const target=chooseOuter(f,e,row,rear);placePlayer(f,target);step(f,e,120);const firstHead=e.nodes.head.getAbsolutePosition().y;
   assert.equal(e.territoryState.phase,'watch',row.id);assert.equal(e.territoryState.engaged,false);assert.equal(e.brain.state,'Alert_Lie_R5',row.id+': actual existing lying alert clip');
   assert.ok(firstHead-restHead>(row.definitionId==='fox.r1'?.06:.1),JSON.stringify({id:row.id,rear,restHead,firstHead,reason:'final posed head must visibly lift'}));
   assert.ok(Vector3.Distance(e.actor.position,position)<1e-6,row.id+': watching must not move the root');assert.ok(Math.abs(e.actor.rotation.y-yaw)<1e-6,row.id+': watching must not turn the body');
   assert.ok(Vector3.Distance(e.nodes.pelvis.getAbsolutePosition(),pelvis)<2e-5,row.id+': actual pelvis remains lying');assert.ok(Vector3.Distance(e.nodes.chest.getAbsolutePosition(),chest)<2e-5,row.id+': actual torso remains lying');
   const duration=e.brain.durations.Alert_Lie_R5;assert.ok(Math.abs(e.brain.time-duration)<1e-5,row.id+': alert holds its authored endpoint');step(f,e,60);
   assert.ok(Math.abs(e.brain.time-duration)<1e-5,row.id+': alert must not loop into another head dip');assert.ok(e.nodes.head.getAbsolutePosition().y-restHead>(row.definitionId==='fox.r1'?.06:.1));sameScales(sourceScales);
   proof.push({id:row.id,approach:rear?'rear':'front',actualHome:position.asArray().map(round),headLift:round(firstHead-restHead),alertEndpoint:round(e.brain.time),target:[round(target.x),round(target.z)]});
  }
  await adapter.dispose();
 }
 t.diagnostic(JSON.stringify({scope:'Native R5 factory models and production plains navigation/terrain; final posed bones, no raster/device claim',proof}));
});

test('all four actual R5 singles enter combat after one clear inner second, retain it in the outer circle and disengage outside the leash',async t=>{
 const f=await fixture(t),proof=[];
 for(const row of rows){const adapter=f.factory(row.definitionId),e=await activate(f,adapter,row),sourceScales=scales(e),home=e.actor.position.clone(),target=chooseInner(f,e,row);placePlayer(f,target);
  assert.ok(distance(f.player.position,e.actor.position)<row.territory.combatRadius);assert.ok(distance(f.player.position,row.territory)<row.territory.radius);assert.equal(f.world.navigation.segmentClear(e.actor.position,f.player.position,0,true),true);
  step(f,e,45);assert.equal(e.territoryState.engaged,false,row.id+': less than one game second stays watch');step(f,e,20);assert.equal(e.territoryState.phase,'combat',row.id);assert.equal(e.territoryState.engaged,true,row.id+': native hostile connection after confirmation');
  const outer=chooseOuter(f,e,row);placePlayer(f,outer);step(f,e,15);assert.equal(e.territoryState.phase,'combat',row.id+': outer circle retains committed combat');assert.equal(e.territoryState.engaged,true);
  placePlayer(f,{x:row.territory.x+row.territory.radius+2,z:row.territory.z});step(f,e,1);assert.equal(e.territoryState.phase,'disengage',row.id+': crossing the outer leash cancels combat');assert.equal(e.territoryState.engaged,false);sameScales(sourceScales);
  proof.push({id:row.id,actualHome:home.asArray().map(round),clearInner:[round(target.x),round(target.z)],entryActorRange:round(distance(target,home)),centerRange:round(distance(target,row.territory))});await adapter.dispose();
 }
 t.diagnostic(JSON.stringify({scope:'Clear approaches chosen around post-protection actual actor positions; no forced hit/contact or direct brain state changes',proof}));
});
