import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,TransformNode,MeshBuilder,StandardMaterial,Animation,AnimationGroup,Vector3,Quaternion,Skeleton,Bone,Matrix} from '@babylonjs/core';
import {createCinematicSceneHost,createCinematicPoseSampler} from '../src/cinematic-scene-host.js';
import {createCinematicDraft,evaluateCinematic} from '../src/cinematic-document.js';
import {CinematicPlayer} from '../src/cinematic-player.js';
import {cinematicLocalTransform} from '../src/cinematic-interaction.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),get resolve(){return resolve;}};};
const definition={actorDefinitionId:'neutral-goblin',assetId:'hooded-goblin',assetVersion:'test',category:'monster',population:{estimatedBytes:100,maxPooled:20},animation:{idle:'Idle',walk:'Walk',turn:'Turn'}};
const entry={assetId:definition.assetId,version:definition.assetVersion,contentHash:'fixture',geometry:{skinned:true,clipNames:['Idle','Walk','Turn'],clipDurations:{Idle:1,Walk:1,Turn:1}},placement:{supported:false}};
const catalog={revision:'test-catalog',entries:[entry]};
function actor(id='neutral-1'){return {actorId:id,assetId:definition.assetId,assetVersion:definition.assetVersion,actorDefinitionId:definition.actorDefinitionId,position:[2,0,0],rotation:[0,0,0,1],scale:1};}
function document(){const doc=createCinematicDraft({catalogRevision:catalog.revision,duration:2});doc.actors=[actor()];doc.tracks.animations=[{actorId:'neutral-1',start:0,end:2,clipId:'Walk',clipStart:0,clipEnd:1,loop:true,blendIn:0,blendOut:0}];return doc;}
const near=(actual,expected,tolerance=1e-6)=>{assert.equal(actual.length,expected.length);actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<tolerance,`${i}: ${value} != ${expected[i]}`));};
function rig(scene){
 const root=new TransformNode('cinematic-world',scene),carrier=new TransformNode('carrier',scene),hip=new TransformNode('hip',scene);carrier.parent=root;hip.parent=carrier;hip.position.y=1;hip.rotationQuaternion=Quaternion.Identity();
 const mesh=MeshBuilder.CreateBox('body',{},scene);mesh.parent=hip;mesh.material=new StandardMaterial('body-paint',scene);
 const skeleton=new Skeleton('independent-rig','independent-rig',scene),bone=new Bone('hip',skeleton,null,Matrix.Identity());bone.linkTransformNode(hip);mesh.skeleton=skeleton;
 const groups=[];
 for(const [name,property,type,from,to]of [['Idle','position',Animation.ANIMATIONTYPE_VECTOR3,new Vector3(0,1,0),new Vector3(0,1,0)],['Walk','position',Animation.ANIMATIONTYPE_VECTOR3,new Vector3(0,1,0),new Vector3(2,3,0)],['Turn','rotationQuaternion',Animation.ANIMATIONTYPE_QUATERNION,Quaternion.Identity(),Quaternion.RotationYawPitchRoll(Math.PI/2,0,0)]]){
  const animation=new Animation(name,property,60,type,Animation.ANIMATIONLOOPMODE_CONSTANT);animation.setKeys([{frame:0,value:from},{frame:60,value:to}]);const group=new AnimationGroup(name,scene);group.addTargetedAnimation(animation,hip);groups.push(group);
 }
 root.setEnabled(false);
 return {actor:root,carrier,nodes:{'mixamorig:Hips':hip},asset:{meshes:[mesh],transformNodes:[hip],skeletons:[skeleton],animationGroups:groups},config:{animations:{idle:'Idle',walk:'Walk',turn:'Turn'},catalog:groups.map(group=>({name:group.name,groundTrack:[0,0],fps:1}))},animator:{},setShadowCasting(){},hip};
}
function fixture(t,{warm,acquire:acquireOverride,onSubtitles=()=>{},projectCatalog=catalog,definitions={[definition.actorDefinitionId]:definition},hostLimits={},instanceIds=[]}={}){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const camera=new ArcRotateCamera('existing-camera',.2,1.1,5,Vector3.Zero(),scene);camera.lowerRadiusLimit=2;camera.upperRadiusLimit=10;camera.lowerBetaLimit=.3;camera.upperBetaLimit=1.3;
 const ground=new TransformNode('ground',scene),world={scene,camera,mapId:'village',ground,terrain:{heightAt:()=>0},toolGeneration:0},counts={created:0,warm:0,dispose:0,leased:0,released:0,audio:0,stopped:0,resources:0,shadowSets:0},adapters=[];let leaseOptions;
 const factory=(def,owner)=>{
  counts.created++;counts.resources++;const encounter=rig(scene);encounter.setShadowCasting=()=>counts.shadowSets++;
  const adapter={encounter,async warm(options){counts.warm++;if(warm)await warm(options,encounter);assert.equal(owner.isCurrent(),true);return encounter.asset;},hide(){encounter.actor.setEnabled(false);},estimate(){return {estimatedBytes:100};},dispose(){if(adapter.disposed)return;adapter.disposed=true;counts.dispose++;counts.resources--;for(const group of encounter.asset.animationGroups)group.dispose();encounter.actor.dispose(false,true);for(const skeleton of encounter.asset.skeletons)skeleton.dispose();}};adapters.push(adapter);return adapter;
 };
 const acquire=async options=>{
  leaseOptions=options;const original={position:camera.position.clone(),target:camera.getTarget().clone(),fov:camera.fov},map=world.mapId,generation=world.toolGeneration;
  const lease={active:true,paused:false,isCurrent:()=>lease.active&&world.toolLease===lease&&world.mapId===map&&world.toolGeneration===generation,
   update:dt=>options.onFrame?.(dt),setPaused(value){lease.paused=value;options.onPause?.(value);},playAudio(){counts.audio++;return true;},stopAudio(){counts.stopped++;},
   release(reason,{restore=true}={}){if(!lease.active)return;lease.active=false;counts.released++;if(world.toolLease===lease)world.toolLease=null;if(restore&&world.mapId===map&&world.toolGeneration===generation){camera.setTarget(original.target);camera.setPosition(original.position);camera.fov=original.fov;}},
   cancel(reason){lease.release(reason,{restore:false});options.onCancel?.(reason);}
  };world.toolLease=lease;counts.leased++;if(acquireOverride)await acquireOverride(lease);return lease;
 };
 const host=createCinematicSceneHost({world,getPlayer:()=>null,catalog:projectCatalog,actorDefinitions:definitions,actorFactory:factory,acquireToolLease:acquire,onSubtitles,audioIds:['neutral-cue'],audioEnabled:true,preparationOptions:{incremental:false},limits:hostLimits});
 const references={catalog:projectCatalog,actorDefinitions:definitions,audioIds:['neutral-cue'],instanceIds};
 const player=new CinematicPlayer({host,references,onState:state=>host.setPlaybackState(state.state)});host.setCallbacks({onFrame:dt=>player.update(dt),onCancel:reason=>{void player.stop(reason);}});
 t.after(async()=>{await player.dispose();await host.dispose();scene.dispose();engine.dispose();});return {world,scene,engine,host,player,counts,adapters,options:()=>leaseOptions};
}

test('absolute native clip blending is deterministic across repeated seeks before a render and empty tracks reset idle0',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),encounter=rig(scene),sampler=createCinematicPoseSampler(encounter);t.after(()=>{scene.dispose();engine.dispose();});
 sampler.sample([{clipId:'Walk',time:.9,weight:1}],.9);sampler.sample([{clipId:'Turn',time:.4,weight:1}],.4);
 sampler.sample([{clipId:'Idle',time:0,weight:.75},{clipId:'Walk',time:1,weight:.25}],1);
 near(encounter.hip.position.asArray(),[.5,1.5,0]);near(encounter.hip.rotationQuaternion.asArray(),[0,0,0,1]);
 assert.equal(scene.animatables.length,0,'sampling owns no second native playback clock or late binding queue');
 sampler.sample([],1.2);near(encounter.hip.position.asArray(),[0,1,0]);near(encounter.hip.rotationQuaternion.asArray(),[0,0,0,1]);
});

test('different seeks in one render ID refresh real linked skeleton palettes and restore the exact prior pose',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),encounter=rig(scene),sampler=createCinematicPoseSampler(encounter);t.after(()=>{scene.dispose();engine.dispose();});
 const palette=()=>Array.from(encounter.asset.skeletons[0].getTransformMatrices(encounter.asset.meshes[0])),renderId=scene.getRenderId();
 sampler.sample([{clipId:'Walk',time:.25,weight:1}],.25);const first=palette();
 sampler.sample([{clipId:'Walk',time:.75,weight:1}],.75);assert.notDeepEqual(palette(),first);
 sampler.sample([{clipId:'Walk',time:.25,weight:1}],.25);assert.deepEqual(palette(),first);assert.equal(scene.getRenderId(),renderId);
});

test('editor seek and game frame driver share exact anchored camera and actor transforms without a second engine or RAF',async t=>{
 const f=fixture(t),doc=document();doc.anchor={position:[5,1,-3],rotation:Quaternion.RotationYawPitchRoll(.4,0,0).asArray()};doc.actors[0].rotation=Quaternion.RotationYawPitchRoll(.2,.1,0).asArray();
 await f.player.load(doc);const expected=evaluateCinematic(doc,.5);assert.equal(f.player.seek(.5),true);
 near(f.world.camera.position.asArray(),expected.camera.position);near(f.world.camera.getTarget().asArray(),expected.camera.target);assert.equal(f.world.camera.fov,expected.camera.fov);
 near(f.adapters[0].encounter.actor.position.asArray(),expected.actors[0].position);near(f.adapters[0].encounter.actor.rotationQuaternion.asArray(),expected.actors[0].rotation);
 const pose=f.adapters[0].encounter.hip.position.asArray();f.player.seek(.4);f.player.play();f.world.toolLease.update(.1);
 near(f.adapters[0].encounter.hip.position.asArray(),pose);near(f.world.camera.position.asArray(),expected.camera.position);
 const capture=f.host.captureCamera();near(capture.position,expected.camera.position);near(capture.target,expected.camera.target);
 assert.equal(f.host.inspect().engineOwned,false);assert.equal(f.host.inspect().rafOwned,false);assert.equal(f.counts.shadowSets,1);
});

test('dragged actor world transforms round-trip a rotated anchor and persist through timeline resampling',async t=>{
 const f=fixture(t),doc=document();doc.anchor={position:[5,1,-3],rotation:Quaternion.RotationYawPitchRoll(.7,.2,-.1).asArray()};await f.player.load(doc);
 const handle=f.host.getActorHandles()[0];assert.equal(handle.actorId,'neutral-1');assert.equal(handle.readOnly,false);assert.ok(handle.meshes.length);assert.equal(f.host.getLiveLease(),f.world.toolLease);
 const transform={position:[7,2,-5],rotation:Quaternion.RotationYawPitchRoll(.2,-.1,.3).asArray(),scale:1.4};f.host.previewActorTransform(handle.actorId,transform);
 near(f.host.getActorHandles()[0].position,transform.position);near(f.host.getActorHandles()[0].rotation,transform.rotation);assert.equal(f.host.getActorHandles()[0].scale,transform.scale);
 const next=structuredClone(doc);Object.assign(next.actors[0],cinematicLocalTransform(doc,transform));f.player.document=next;f.player.seek(.8);
 near(f.host.getActorHandles()[0].position,transform.position);near(f.host.getActorHandles()[0].rotation,transform.rotation);assert.equal(f.host.getActorHandles()[0].scale,transform.scale);
 const before=f.host.getActorHandles()[0].position;assert.throws(()=>f.host.previewActorTransform(handle.actorId,{...transform,position:[NaN,0,0]}),/유효한/);near(f.host.getActorHandles()[0].position,before);
});

test('sixteen warm replays plateau model/pose resources and release the lease exactly once each time',async t=>{
 const f=fixture(t),doc=document();let plateau;
 const resources=()=>({meshes:f.scene.meshes.length,materials:f.scene.materials.length,nodes:f.scene.transformNodes.length,groups:f.scene.animationGroups.length,observers:f.scene.onBeforeRenderObservable.observers.filter(item=>!item._willBeUnregistered).length});
 for(let i=0;i<16;i++){assert.equal(await f.player.load(doc),true);f.player.seek(.5);await f.player.stop('skip');await flush();plateau??=resources();assert.deepEqual(resources(),plateau);assert.equal(f.counts.resources,1);}
 assert.equal(f.counts.created,1);assert.equal(f.counts.warm,1);assert.equal(f.counts.leased,16);assert.equal(f.counts.released,16);assert.equal(f.host.inspect().estimatedBytes,100);assert.equal(f.world.camera.lowerRadiusLimit,2);assert.equal(f.world.camera.upperRadiusLimit,10);
 await f.host.dispose();assert.equal(f.counts.resources,0);assert.equal(f.counts.dispose,1);
});

test('seek emits no audio/events; playback tracks allowed cues and stops owned audio on pause and release',async t=>{
 const f=fixture(t),doc=document();doc.tracks.audio=[{time:.2,audioId:'neutral-cue',volume:.3}];doc.tracks.events=[{time:.2,type:'marker',label:'neutral marker'}];
 await f.player.load(doc);f.player.seek(.5);f.player.seek(0);assert.equal(f.counts.audio,0);assert.equal(f.host.inspect().stats.markers,0);
 f.player.play();f.world.toolLease.update(.25);assert.equal(f.counts.audio,1);assert.equal(f.host.inspect().stats.markers,1);
 f.player.pause();const time=f.player.time;f.world.toolLease.update(.1);assert.equal(f.player.time,time);await f.player.stop();assert.equal(f.counts.released,1);assert.ok(f.counts.stopped>0);
});

test('cancel during warm preparation returns promptly, retires exact late resources and never activates an actor',async t=>{
 const gate=deferred(),entered=deferred();const f=fixture(t,{warm:async()=>{entered.resolve();await gate.promise;}}),pending=f.player.load(document());await entered.promise;
 await f.player.stop('skip');assert.equal(f.counts.released,1);assert.equal(f.adapters[0].encounter.actor.isEnabled(),false);assert.equal(f.host.inspect().active,false);
 gate.resolve();assert.equal(await pending,false);await flush();assert.equal(f.counts.resources,0);assert.equal(f.host.inspect().actors,0);assert.equal(f.counts.dispose,1);
});

test('late lease acquisition is released after cancellation without starting actor preparation',async t=>{
 const gate=deferred(),entered=deferred();const f=fixture(t,{acquire:async()=>{entered.resolve();await gate.promise;}}),pending=f.player.load(document());await entered.promise;
 await f.player.stop('skip');gate.resolve();assert.equal(await pending,false);assert.equal(f.counts.released,1);assert.equal(f.counts.created,0);
});

test('map invalidation cancels owned actors without restoring the old map camera or camera limits',async t=>{
 const f=fixture(t);await f.player.load(document());const lease=f.world.toolLease;
 f.world.mapId='great-plains';f.world.toolGeneration++;f.world.camera.fov=.9;f.world.camera.lowerRadiusLimit=6;
 lease.cancel('map-change');await flush();assert.equal(f.world.camera.fov,.9);assert.equal(f.world.camera.lowerRadiusLimit,6);assert.equal(f.counts.released,1);assert.equal(f.counts.resources,0);
});

test('an invalid live sample routes through the player error cleanup without leaking a scene lease',async t=>{
 const f=fixture(t);await f.player.load(document());const sample=f.host.sample;f.host.sample=()=>{throw new Error('injected sampling failure');};
 assert.equal(f.player.seek(.5),false);await flush();f.host.sample=sample;
 assert.equal(f.player.state,'error');assert.equal(f.counts.released,1);assert.equal(f.counts.resources,0);assert.equal(f.world.toolLease,null);
});

test('bounded warm cache retires idle definitions before a new file and rejects real active/memory overflow explicitly',async t=>{
 const alternate={...definition,actorDefinitionId:'neutral-alternate'},definitions={[definition.actorDefinitionId]:definition,[alternate.actorDefinitionId]:alternate};
 const f=fixture(t,{definitions,hostLimits:{actors:2}}),doc=document();doc.actors.push(actor('neutral-2'));
 await f.player.load(doc);await f.player.stop('skip');assert.equal(f.counts.resources,2);
 const next=document();next.actors[0].actorDefinitionId=alternate.actorDefinitionId;
 assert.equal(await f.player.load(next),true);assert.equal(f.counts.resources,1);assert.equal(f.counts.created,3);assert.equal(f.counts.dispose,2);
 const limited=fixture(t,{hostLimits:{actors:1}});await assert.rejects(limited.player.load(doc),/count cap/);assert.equal(limited.counts.created,0);assert.equal(limited.counts.released,1);
 const memory=fixture(t,{hostLimits:{estimatedBytes:150}});await assert.rejects(memory.player.load(doc),/memory cap/);await flush();assert.equal(memory.counts.resources,0);assert.equal(memory.counts.released,1);
});

test('twenty independent actor poses are supported by the bounded lab and a twenty-first document is rejected',async t=>{
 const f=fixture(t),doc=document();doc.actors=Array.from({length:20},(_,i)=>({...actor('neutral-'+i),position:[i,0,0]}));doc.tracks.animations=doc.actors.map((value,i)=>({actorId:value.actorId,start:0,end:2,clipId:'Walk',clipStart:i%2?.3:0,clipEnd:1,loop:true,blendIn:0,blendOut:0}));
 await f.player.load(doc);f.player.seek(.2);assert.equal(f.counts.resources,20);assert.equal(new Set(f.adapters.map(adapter=>adapter.encounter.hip)).size,20);
 near(f.adapters[0].encounter.hip.position.asArray(),[.4,1.4,0]);near(f.adapters[1].encounter.hip.position.asArray(),[1,2,0]);
 const oversized=structuredClone(doc);oversized.actors.push(actor('over-cap'));await assert.rejects(f.player.load(oversized),{name:'CinematicValidationError'});assert.equal(f.counts.created,20);
});

test('existing map-instance references remain read-only and enforce asset identity without collision edits',async t=>{
 const staticEntry={assetId:'static-prop',version:'static-test',geometry:{skinned:false,clipNames:[],clipDurations:{}},units:{metersPerSourceUnit:1},placement:{supported:false}},projectCatalog={revision:catalog.revision,entries:[entry,staticEntry]};
 const f=fixture(t,{projectCatalog,instanceIds:['base-prop']}),root=new TransformNode('immutable-base',f.scene);root.position.set(1,0,0);f.world.villageRenderRecords=[{root,placement:{id:'base-prop',asset:'static-prop'}}];
 const doc=document();doc.actors=[{actorId:'bound-prop',instanceId:'base-prop',assetId:'static-prop',assetVersion:'static-test',position:[1,0,0],rotation:[0,0,0,1],scale:1}];doc.tracks.animations=[];
 await f.player.load(doc);f.player.seek(1);near(root.position.asArray(),[1,0,0]);assert.equal(f.counts.created,0);
 doc.tracks.transforms=[{actorId:'bound-prop',keys:[{time:0,position:[1,0,0],rotation:[0,0,0,1],scale:1,interpolation:'linear'},{time:2,position:[2,0,0],rotation:[0,0,0,1],scale:1,interpolation:'linear'}]}];
 await assert.rejects(f.player.load(doc),/read-only/);near(root.position.asArray(),[1,0,0]);assert.equal(f.counts.released,2);
});
