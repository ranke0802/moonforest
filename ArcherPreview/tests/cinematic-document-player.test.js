import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ASSET_CATALOG,getCatalogAsset} from '../src/asset-catalog.js';
import {ACTOR_DEFINITIONS} from '../src/actor-definitions.js';
import {validateCinematicDocument,evaluateCinematic,cinematicEventsBetween,createCinematicDraft,CinematicHistory,buildCinematicAiPrompt} from '../src/cinematic-document.js';
import {CinematicPlayer} from '../src/cinematic-player.js';
import {cinematicCommand,cinematicReply,parseCinematicCommand,parseCinematicReply} from '../src/cinematic-protocol.js';
const references={catalog:ASSET_CATALOG,actorDefinitions:ACTOR_DEFINITIONS,audioIds:Object.keys(JSON.parse(readFileSync(new URL('../public/assets/audio.json',import.meta.url))).sounds)};
const draft=()=>createCinematicDraft({catalogRevision:ASSET_CATALOG.revision});
function actorDraft(){
  const doc=draft(),definition=ACTOR_DEFINITIONS['hooded-goblin.standard'],asset=getCatalogAsset(definition.assetId,definition.assetVersion);
  doc.actors=[{actorId:'goblin-1',actorDefinitionId:definition.actorDefinitionId,assetId:definition.assetId,assetVersion:definition.assetVersion,contentHash:asset.contentHash,position:[0,0,4],rotation:[0,0,0,1],scale:1}];
  doc.tracks.animations=[{actorId:'goblin-1',start:0,end:6,clipId:'Walking',clipStart:0,clipEnd:asset.geometry.clipDurations.Walking,loop:true,blendIn:0,blendOut:0}];return doc;
}
function host(){const calls=[],leases=new Set();return {calls,leases,acquire:async(doc,{token})=>{leases.add(token);calls.push(['acquire',token.id]);return {id:token.id};},prepare:async()=>({owned:true}),sample:(frame,options)=>calls.push(['sample',structuredClone(frame),options.seeking]),emit:cue=>calls.push(['emit',cue]),stopAudio:()=>calls.push(['audio-stop']),release:async options=>{calls.push(['release',options.reason,options.restore]);if(options.restore)leases.delete(options.token);}};}

test('neutral JSON draft roundtrips the exact shared schema without bear/sample assets or implicit triggers',()=>{
  const doc=draft(),validated=validateCinematicDocument(JSON.stringify(doc),references);assert.equal(validated.valid,true);assert.deepEqual(validated.document,doc);
  assert.equal(doc.actors.length,0);assert.equal(/bear|base64|trigger|eval/.test(JSON.stringify(doc)),false);
  assert.equal(evaluateCinematic(doc,0).camera.fov,.65);assert.deepEqual(evaluateCinematic(doc,3),evaluateCinematic(JSON.parse(JSON.stringify(doc)),3));
});

test('real clip duration/reference checks and strict invalid field/time/transform/version/size rejection produce field paths',()=>{
  const valid=actorDraft();assert.equal(validateCinematicDocument(valid,references).valid,true);
  const mutations=[d=>d.version=2,d=>d.catalogRevision='old',d=>d.mapId='unknown',d=>d.duration=Infinity,d=>d.anchor.position[0]=NaN,d=>d.anchor.rotation=[0,0,0,0],d=>d.shots[0].from.fov=90,d=>d.shots[0].to.target=[...d.shots[0].to.position],d=>d.shots[0].start=1,d=>d.shots[0].end=9,d=>d.actors[0].assetVersion='unknown',d=>d.actors[0].actorDefinitionId='unknown',d=>d.actors[0].contentHash='wrong',d=>d.actors[0].scale=-1,d=>d.actors[0].url='https://example.test/model.glb',d=>d.actors[0].instanceId='missing-instance',d=>d.tracks.animations[0].clipEnd=999,d=>d.tracks.animations[0].clipId='missing',d=>d.tracks.events=[{time:1,type:'reward',label:'gold'}],d=>d.tracks.audio=[{time:1,audioId:'https://example.test/audio.mp3',volume:1}],d=>d.geometry='raw-data',d=>d.actors.push({...d.actors[0]}),d=>d.shots=[null,d.shots[0]],d=>d.actors=[null],d=>d.tracks.animations=[null],d=>d.shots[0].from.position='abc'];
  for(const mutate of mutations){const doc=structuredClone(valid);mutate(doc);const result=validateCinematicDocument(doc,references);assert.equal(result.valid,false,String(mutate));assert.ok(result.errors.every(error=>error.path.startsWith('$')));}
  assert.equal(validateCinematicDocument('x'.repeat(512*1024+1),references).valid,false);
});

test('camera/actor/clip sampling is absolute, anchor-aware and equal under seek order, quaternion sign and interpolation',()=>{
  const doc=actorDraft();doc.anchor={position:[10,0,20],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2]};
  doc.tracks.transforms=[{actorId:'goblin-1',keys:[{time:0,position:[0,0,2],rotation:[0,0,0,1],scale:1,interpolation:'linear'},{time:6,position:[0,0,6],rotation:[0,0,0,-1],scale:2,interpolation:'linear'}]}];
  assert.equal(validateCinematicDocument(doc,references).valid,true);
  const middle=evaluateCinematic(doc,3);assert.ok(Math.abs(middle.actors[0].position[0]-14)<1e-10);assert.ok(Math.abs(middle.actors[0].position[2]-20)<1e-10);assert.equal(middle.actors[0].scale,1.5);assert.ok(Math.abs(Math.hypot(...middle.actors[0].rotation)-1)<1e-10);
  for(const t of [0,6,1,5,3,2,3]){evaluateCinematic(doc,t);assert.deepEqual(evaluateCinematic(doc,3),middle);}
  const range=getCatalogAsset('hooded-goblin').geometry.clipDurations.Walking;assert.ok(Math.abs(middle.actors[0].animations[0].time-(3%range))<1e-9);
  doc.shots[0].interpolation='step';assert.deepEqual(evaluateCinematic(doc,2).camera.position,evaluateCinematic(doc,0).camera.position);
});

test('history keeps validated immutable snapshots and AI flow is a copyable prompt with only known IDs',()=>{
  const doc=actorDraft(),history=new CinematicHistory(doc,{references}),changed=structuredClone(doc);changed.shots[0].from.position[0]=7;
  history.commit(changed);assert.equal(history.canUndo,true);assert.deepEqual(history.undo(),doc);assert.deepEqual(history.redo(),changed);
  const value=history.value;value.duration=99;assert.equal(history.value.duration,6);assert.throws(()=>history.commit({...doc,mapId:'wrong'}));
  const prompt=buildCinematicAiPrompt({request:'A gentle neutral orbit.',document:doc,references});assert.match(prompt,/A gentle neutral orbit/);assert.match(prompt,/hooded-goblin.standard/);assert.match(prompt,/no API call or generation has already occurred/);assert.equal(prompt.includes('base64,'),false);
});

test('seek is silent, pause/hidden time never advances, resume emits each cue only once per playback cycle',async()=>{
  const doc=draft();doc.tracks.audio=[{time:1,audioId:'ui_click',volume:.4}];doc.tracks.events=[{time:2,type:'marker',label:'neutral-marker'}];
  const h=host(),player=new CinematicPlayer({host:h,references});await player.load(doc);player.seek(3);assert.equal(h.calls.some(c=>c[0]==='emit'),false);
  player.seek(0);player.play();player.update(99,{hidden:true});assert.equal(player.time,0);player.pause();player.update(99);assert.equal(player.time,0);player.resume();
  for(let i=0;i<8;i++)player.update(.25);assert.equal(player.time,2);assert.equal(h.calls.filter(c=>c[0]==='emit').length,2);
  player.seek(0);for(let i=0;i<8;i++)player.update(.25);assert.equal(h.calls.filter(c=>c[0]==='emit').length,2,'scrub-back does not reissue already-fired cues');
  assert.deepEqual(cinematicEventsBetween(doc,2,1),[]);await player.stop();assert.equal(h.leases.size,0);
});

test('complete, skip, cancel, death, map change, context loss and error release ownership idempotently',async()=>{
  for(const reason of ['skip','cancel','death','map-change','context-loss','error']){
    const h=host(),player=new CinematicPlayer({host:h,references});await player.load(draft());player.play();await player.stop(reason);await player.stop(reason);await player.dispose();
    assert.equal(h.leases.size,0);assert.equal(h.calls.filter(c=>c[0]==='release'&&c[2]===true).length,1,reason);
  }
  const h=host(),player=new CinematicPlayer({host:h,references});await player.load(draft());player.play();for(let i=0;i<24;i++)player.update(.25);await player.stop();assert.equal(player.state,'completed');assert.equal(h.leases.size,0);
});

test('cancelled late preparation cannot sample; late resource cleanup never restores a stale lease twice',async()=>{
  const h=host();let finish;h.prepare=()=>new Promise(resolve=>finish=resolve);
  const player=new CinematicPlayer({host:h,references}),loading=player.load(draft());while(!finish)await Promise.resolve();await player.stop('map-change');
  finish({owned:'late'});assert.equal(await loading,false);assert.equal(h.calls.some(c=>c[0]==='sample'),false);assert.equal(h.calls.filter(c=>c[0]==='release'&&c[2]===true).length,1);assert.equal(h.calls.filter(c=>c[0]==='release'&&c[2]===false).length,1);assert.equal(h.leases.size,0);
});

test('sampling/emission failures and pending repeated release converge on the same cleanup promise',async()=>{
  const h=host(),player=new CinematicPlayer({host:h,references});await player.load(draft());h.sample=()=>{throw Error('sample failure');};player.play();player.update(.1);await player.stop();assert.equal(player.state,'error');assert.equal(h.leases.size,0);
  const slow=host();let release;slow.release=options=>new Promise(resolve=>release=()=>{slow.leases.delete(options.token);resolve();});
  const second=new CinematicPlayer({host:slow,references});await second.load(draft());const first=second.stop(),again=second.stop();let settled=false;again.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);release();await Promise.all([first,again]);assert.equal(slow.leases.size,0);
});

test('disposal blocks a concurrent new load immediately and failed cleanup leaves an explicit error state',async()=>{
  const h=host();let finish;h.release=options=>new Promise(resolve=>finish=()=>{h.leases.delete(options.token);resolve();});
  const player=new CinematicPlayer({host:h,references});await player.load(draft());const disposing=player.dispose();
  await assert.rejects(player.load(draft()),/disposed/);assert.equal(h.calls.filter(c=>c[0]==='acquire').length,1);finish();await disposing;
  const queuedHost=host();let finishQueued;queuedHost.release=options=>new Promise(resolve=>finishQueued=()=>{queuedHost.leases.delete(options.token);resolve();});
  const queuedPlayer=new CinematicPlayer({host:queuedHost,references});await queuedPlayer.load(draft());const queued=queuedPlayer.load(draft()),rejectQueued=assert.rejects(queued,/disposed/),disposeQueued=queuedPlayer.dispose();finishQueued();await Promise.all([rejectQueued,disposeQueued]);assert.equal(queuedHost.calls.filter(c=>c[0]==='acquire').length,1,'a load queued before disposal cannot acquire after the release wait');
  const broken=host();broken.prepare=async()=>{throw Error('prepare failed');};broken.release=async()=>{throw Error('release failed');};
  const failed=new CinematicPlayer({host:broken,references});await assert.rejects(failed.load(draft()),/release failed/);assert.equal(failed.state,'error');assert.equal(failed.error.message,'release failed');
  await assert.rejects(failed.load(draft()),/release failed/);assert.equal(broken.calls.filter(c=>c[0]==='acquire').length,1,'failed cleanup cannot acquire an overlapping new lease');
});

test('even tiny shot gaps/start offsets are rejected; defensive evaluation never jumps to the final shot',()=>{
  const doc=draft(),second=structuredClone(doc.shots[0]);doc.shots[0].end=3;second.shotId='shot-2';second.start=3;doc.shots.push(second);
  assert.equal(validateCinematicDocument(doc,references).valid,true);doc.shots[0].start=1e-9;assert.equal(validateCinematicDocument(doc,references).valid,false);assert.equal(evaluateCinematic(doc,0).shotId,'shot-1');
  doc.shots[0].start=0;second.start=3+1e-9;assert.equal(validateCinematicDocument(doc,references).valid,false);assert.equal(evaluateCinematic(doc,3+5e-10).shotId,'shot-1');
});

test('studio protocol checks source, origin, version, command fields and numeric values before routing',()=>{
  const source={},origin='https://game.test',message=cinematicCommand('seek','request-1',{time:2}),event={source,origin,data:message};
  assert.equal(parseCinematicCommand(event,{source,origin}),message);
  for(const invalid of [{...event,source:{}},{...event,origin:'https://wrong.test'},{...event,data:{...message,time:NaN}},{...event,data:{...message,eval:'run'}},{...event,data:{...message,version:2}},{...event,data:{...message,command:'reward'}}])assert.equal(parseCinematicCommand(invalid,{source,origin}),null);
  const reply=cinematicReply('request-1',{time:2});assert.equal(parseCinematicReply({source,origin,data:reply},{source,origin}),reply);assert.equal(parseCinematicReply({source,origin:'null',data:reply},{source,origin}),null);
});
