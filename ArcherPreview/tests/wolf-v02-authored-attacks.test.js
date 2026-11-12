import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';
import {WOLF_V02_AUTHORED_CLIPS,WOLF_V02_R9_CLIPS,WOLF_V02_FERAL_CLIPS,WOLF_V02_AUTHORED_SOURCE,installWolfV02AttackClips} from '../src/wolf-v02-authored-clips.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';
import {sourcePath} from '../../Sources/resolve-source.mjs';

const assetBase=new URL('../public/assets/',import.meta.url),rows=[];
async function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,5,-10),scene);
 const config=JSON.parse(fs.readFileSync(new URL('alpha-wolf.json',assetBase))),decoded=await readRuntimeGltf(new URL(config.model,assetBase)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');container.animationGroups.forEach(g=>g.stop());
 const paint=new StandardMaterial('authored-test-paint',scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 const models=new BossModelLibrary(scene,'alpha-wolf');models.config=config;models.container=container;models.load=async()=>{};
 const world={scene,mapId:'great-plains',release:'moonforest-0.2',navigation:null,terrain:{heightAt(){return 0;},place(v){v.y=0;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const battle=new BossBattle(world,()=>{},()=>{},()=>{},{wolfModels:models}),player=new TransformNode('player',scene);player.metadata={playerDimensions:WARRIOR_DIMENSIONS};player.position.z=6;battle.preparationOptions={frame:async()=>{}};
 t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});return {engine,scene,config,container,models,world,battle,player};
}
const resources=scene=>({meshes:scene.meshes.length,geometry:scene.geometries.length,materials:scene.materials.length,groups:scene.animationGroups.length,skeletons:scene.skeletons.length,morph:scene.morphTargetManagers.length,textures:scene.textures.length,nodes:scene.transformNodes.length,native:scene._activeAnimatables.length,before:scene.onBeforeRenderObservable.observers.length,after:scene.onAfterRenderObservable.observers.length,dispose:scene.onDisposeObservable.observers.length});
const authoredKeyHash=asset=>createHash('sha256').update(JSON.stringify(asset.animationGroups.filter(g=>WOLF_V02_AUTHORED_CLIPS.some(c=>c.name===g.name)).map(g=>({name:g.name,channels:g.targetedAnimations.map(row=>({node:row.target.name,path:row.animation.targetProperty,keys:row.animation.getKeys().map(k=>[k.frame,...k.value.asArray()])}))})))).digest('hex');
const span=(values,key)=>Math.max(...values.map(v=>v[key]))-Math.min(...values.map(v=>v[key]));
// Source-pose preservation uses the original carrier correction; the separate
// feral integration tests measure the intentional live attention/foot layer.
function samplePose(e,name,time,serial){e.v02Pose?.restore();e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.start(name,'idle');e.brain.time=time;e.animator.transition(name,{clipTime:time,actionId:serial,blendDuration:0});e.animator.update(0);WolfEncounter.prototype.alignPose.call(e);}
test.after(()=>{fs.mkdirSync('reports/wolf-v02-authored-attacks',{recursive:true});fs.writeFileSync('reports/wolf-v02-authored-attacks/validation.json',JSON.stringify({scope:'CPU-only packed R8 rig and authored 0.2 animation sidecar validation in Babylon NullEngine. Materials replaced; visual quality, GPU and device/touch play remain unmeasured.',sourceMotionSha256:createHash('sha256').update(fs.readFileSync(sourcePath('wolf-v02-attacks-r9','clips.json'))).digest('hex'),runtimeMotionSha256:createHash('sha256').update(fs.readFileSync(new URL('../src/wolf-v02-attack-clips.json',import.meta.url))).digest('hex'),cases:rows},null,2)+'\n');});

// Captured immediately before the separately authored 0.2 attack work. The
// requested new motions belong only to the 0.2 sidecar and actor-local rig.
const legacyHashes={
 'src/wolf-spec.js':'3948b30eefc7591d95eae86996d7d985d10be464eb6ce68467802cb04b7061b4',
 'src/wolf-encounter.js':'405c8d2d4882bbe7ef78a56bb4f9acc141d5d64ffc013c70bb3260ca8492f85d',
 'src/wolf-animation.js':'536b68fa6554c2328e5a1c0ec0b0ba777de76fcc3d78d9c69bb0c3ee43bc5141',
 'public/assets/alpha-wolf.json':'077edc52665ea2270c376dfcbd4e1d86520faf77b299c1b999ba0d6715d7fdb9',
 'public/assets/content/e3e18718e561fb963b7c18d54a515f69e22da58bf271e0ebfe3c5c97decc6a63.gltf':'e3e18718e561fb963b7c18d54a515f69e22da58bf271e0ebfe3c5c97decc6a63',
};

test('new 0.2 authoring preserves the exact shared 0.1 wolf code, model config and packed model bytes',()=>{
 for(const [path,expected]of Object.entries(legacyHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),expected,path);
 const gltf=JSON.parse(fs.readFileSync('public/assets/content/e3e18718e561fb963b7c18d54a515f69e22da58bf271e0ebfe3c5c97decc6a63.gltf'));
 assert.equal(gltf.animations.length,12);
 for(const row of [...gltf.buffers,...gltf.images]){
  if(!row.uri||row.uri.startsWith('data:'))continue;
  const hash=row.uri.match(/(?:^|\/)([a-f0-9]{64})\./)?.[1];assert.ok(hash,'packed dependency uses a content hash');
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(row.uri,new URL('../public/assets/content/e3e18718e561fb963b7c18d54a515f69e22da58bf271e0ebfe3c5c97decc6a63.gltf',import.meta.url)))).digest('hex'),hash);
 }
});

test('new standing attacks have separate clip identities and finite fixed-scale authored channels',()=>{
 const names=WOLF_V02_AUTHORED_CLIPS.map(c=>c.name);assert.ok(names.includes('Wolf_Snap_Bite_V02'));assert.ok(names.every(n=>!Object.values(WOLF_CLIPS).includes(n)));assert.equal(new Set(names).size,names.length);
 const base=JSON.parse(fs.readFileSync(new URL('alpha-wolf.json',assetBase)));assert.equal(WOLF_V02_AUTHORED_SOURCE,base.sourceSha256);
 assert.equal(WOLF_V02_BY_ID['quick-bite'].sourceClip,'Wolf_Driving_Bite_V02');assert.equal(WOLF_V02_BY_ID['chain-bite'].sourceClip,'Wolf_Driving_Bite_V02');
 assert.equal(WOLF_V02_R9_CLIPS.length,2);assert.equal(WOLF_V02_FERAL_CLIPS.length,4);assert.equal(WOLF_V02_AUTHORED_CLIPS.length,6);
 for(const clip of WOLF_V02_R9_CLIPS){
  assert.ok(clip.duration>0&&clip.duration<=2);assert.equal(clip.fps,60);assert.ok(clip.channels.length>0);assert.ok(clip.rootTrack.length>1&&clip.yawTrack.length>1);
  const ids=new Set();
  for(const channel of clip.channels){
   const id=channel.node+'/'+channel.path;assert.equal(ids.has(id),false,'duplicate channel '+id);ids.add(id);assert.ok(['translation','rotation','scale'].includes(channel.path));assert.equal(channel.times.length,channel.values.length);assert.ok(channel.times.length>1);
   let previous=-Infinity;const first=channel.values[0];
   for(let i=0;i<channel.times.length;i++){
    const t=channel.times[i],value=channel.values[i];assert.ok(Number.isFinite(t)&&t>=0&&t<=clip.duration+1e-6&&t>previous);previous=t;assert.ok(value.every(Number.isFinite));assert.equal(value.length,channel.path==='rotation'?4:3);
    if(channel.path==='rotation')assert.ok(Math.abs(Math.hypot(...value)-1)<1e-5,id+' quaternion normalization');
    if(channel.path==='scale')for(let k=0;k<3;k++)assert.ok(Math.abs(value[k]-first[k])<1e-6,id+' cannot squash/stretch');
    if(channel.path==='translation'&&channel.node!=='root')assert.ok(Math.abs(Math.hypot(...value)-Math.hypot(...first))<1e-5,id+' cannot change the bone offset length');
   }
  }
  assert.ok(clip.channels.some(c=>c.node==='jaw'&&c.path==='rotation'));rows.push({case:'authored-data-contract',clip:clip.name,duration:clip.duration,channels:clip.channels.length,normalizedQuaternions:true,fixedScalesAndBoneLengths:true});
 }
});

test('runtime preparation removes only exact constant-channel duplicates and preserves all moving keys and metadata',()=>{
 const bytes=fs.readFileSync(sourcePath('wolf-v02-attacks-r9','clips.json')),raw=JSON.parse(bytes),prepared=JSON.parse(fs.readFileSync(new URL('../src/wolf-v02-attack-clips.json',import.meta.url)));assert.equal(prepared.preparation.sourceDataSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(prepared.clips.length,raw.clips.length);let originalKeys=0,runtimeKeys=0,reduced=0;
 for(let i=0;i<raw.clips.length;i++){
  const source=raw.clips[i],runtime=prepared.clips[i],{channels:sourceChannels,...sourceMeta}=source,{channels:runtimeChannels,...runtimeMeta}=runtime;assert.deepEqual(runtimeMeta,sourceMeta);assert.equal(runtimeChannels.length,sourceChannels.length);
  for(let j=0;j<sourceChannels.length;j++){
   const channel=sourceChannels[j],actual=runtimeChannels[j],first=channel.values[0],constant=channel.values.every(v=>v.length===first.length&&v.every((n,k)=>Object.is(n,first[k])));originalKeys+=channel.times.length;runtimeKeys+=actual.times.length;
   if(constant){assert.deepEqual(actual,{...channel,times:[channel.times[0],channel.times.at(-1)],values:[channel.values[0],channel.values.at(-1)]});reduced+=channel.times.length>2?1:0;}
   else assert.deepEqual(actual,channel,'moving channel must retain every exact source time and value');
  }
 }
 assert.equal(prepared.preparation.originalKeys,originalKeys);assert.equal(prepared.preparation.runtimeKeys,runtimeKeys);assert.ok(runtimeKeys<originalKeys&&reduced>0);rows.push({case:'lossless-constant-key-preparation',sourceDataSha256:prepared.preparation.sourceDataSha256,originalKeys,runtimeKeys,reducedChannels:reduced,movingKeysExact:true});
});

test('new R10 motion channels preserve the original limb offsets and scales while allowing authored pelvis movement',()=>{
 const reference=JSON.parse(fs.readFileSync(new URL(JSON.parse(fs.readFileSync(new URL('alpha-wolf.json',assetBase))).model,assetBase))),bindNodes=new Map(reference.nodes.map(n=>[n.name,n]));
 for(const clip of WOLF_V02_FERAL_CLIPS){
  assert.ok(clip.duration>0&&clip.duration<=1);assert.equal(clip.fps,60);assert.equal(clip.channels.length,84);
  const ids=new Set();for(const channel of clip.channels){
   const id=channel.node+'/'+channel.path;assert.equal(ids.has(id),false);ids.add(id);assert.equal(channel.times.length,channel.values.length);
   assert.ok(channel.times.length>=2);let previous=-1;const first=channel.values[0];
   for(let i=0;i<channel.times.length;i++){
    const time=channel.times[i],value=channel.values[i];assert.ok(time>previous&&time>=0&&time<=clip.duration+1e-6);previous=time;assert.ok(value.every(Number.isFinite));
    if(channel.path==='rotation')assert.ok(Math.abs(Math.hypot(...value)-1)<1e-5,id+' rotation normalization');
    if(channel.path==='scale')assert.ok(value.every((v,k)=>Math.abs(v-first[k])<1e-6),id+' rigid scale');
    if(channel.path==='translation'&&!['root','pelvis'].includes(channel.node)){
     const original=bindNodes.get(channel.node);assert.ok(original,id+' approved bind node exists');
     assert.ok(Math.abs(Math.hypot(...value)-Math.hypot(...(original.translation??[0,0,0])))<1e-5,id+' approved bind attachment length');
     assert.ok(Math.abs(Math.hypot(...value)-Math.hypot(...first))<1e-5,id+' fixed bone attachment length');
    }
   }
  }
 }
});

test('authored clips install once per cloned rig without changing the shared twelve-clip template',async t=>{
 const f=await fixture(t),templateGroups=[...f.container.animationGroups],config=JSON.stringify(f.config),sourceData=JSON.stringify(WOLF_V02_AUTHORED_CLIPS);
 assert.equal(await f.battle.summon(f.player,2,'wolf'),true);const [a,b]=f.battle.encounters,expected=12+WOLF_V02_AUTHORED_CLIPS.length;
 assert.equal(a.animator.clips.size,expected);assert.equal(b.animator.clips.size,expected);assert.notStrictEqual(a.config,f.config);assert.equal(JSON.stringify(f.config),config);assert.deepEqual(f.container.animationGroups,templateGroups);assert.equal(templateGroups.length,12);
 assert.strictEqual(installWolfV02AttackClips(a.asset,f.config),a.config);assert.equal(a.asset.animationGroups.length,expected);
 const keyHashes=[authoredKeyHash(a.asset),authoredKeyHash(b.asset)];
 const body=x=>x.meshes.find(m=>m.getTotalVertices()>1000&&!m.metadata?.moonforestOutline);assert.strictEqual(body(a.asset).geometry,body(b.asset).geometry);assert.strictEqual(body(a.asset).geometry,body(f.container).geometry);
 for(const clip of WOLF_V02_AUTHORED_CLIPS){
  const ga=a.asset.animationGroups.find(g=>g.name===clip.name),gb=b.asset.animationGroups.find(g=>g.name===clip.name);assert.notStrictEqual(ga,gb);
  assert.equal(ga.targetedAnimations.length,clip.channels.length);assert.equal(gb.targetedAnimations.length,clip.channels.length);
  for(let i=0;i<ga.targetedAnimations.length;i++){assert.notStrictEqual(ga.targetedAnimations[i].target,gb.targetedAnimations[i].target);assert.notStrictEqual(ga.targetedAnimations[i].animation,gb.targetedAnimations[i].animation);}
  for(let frame=0;frame<200;frame++)for(const [e,time]of [[a,(frame%61)/60*clip.duration],[b,(60-frame%61)/60*clip.duration]]){e.animator.transition(clip.name,{clipTime:time,actionId:frame,blendDuration:0});e.animator.update(0);}
 }
 assert.equal(JSON.stringify(WOLF_V02_AUTHORED_CLIPS),sourceData,'sampling cannot rewrite module key data');assert.deepEqual([authoredKeyHash(a.asset),authoredKeyHash(b.asset)],keyHashes,'sampling cannot rewrite shared animation key objects');assert.equal(f.scene._activeAnimatables.length,0);
 const baseline=resources(f.scene),animators=[a.animator,b.animator];for(let repeat=0;repeat<5;repeat++){f.battle.hide();assert.equal(await f.battle.summon(f.player,2,'wolf'),true);assert.deepEqual(f.battle.encounters.map(e=>e.animator),animators);assert.deepEqual(resources(f.scene),baseline);}
 rows.push({case:'actor-local-install-and-reuse',sourceClips:12,totalClips:expected,repeats:5,resources:baseline,unchangedSharedTemplate:true,independentTargetsAndCursors:true});
});

test('0.2 heavy/bash knockback travels about twenty percent less with original source poses and hit timing',async t=>{
 const f=await fixture(t),oracle=new WolfEncounter(f.world,()=>{},()=>{},()=>{},{loadAsset:()=>f.models.instantiate()});
 for(const fps of [30,60])for(const id of ['judgment','shield-push']){
  assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const variant=f.battle.encounters[0];await oracle.summon(f.player,{position:Vector3.Zero(),rotationY:0});f.player.position.set(0,0,2.4);
  for(const e of [variant,oracle]){
   e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.time=0;e.animator.transition(WOLF_CLIPS.watch,{clipTime:0,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.alignPose();e.player=f.player;e.dt=1/fps;
   e.gate.collect=()=>({hits:[{id,damage:20,heavy:id==='judgment'}],hitStop:.03});try{e.poseAndContacts(f.player,{state:'idle'},{actionId:22},null);}finally{delete e.gate.collect;}
   assert.equal(e.brain.hp,880);assert.equal(e.brain.mode,'down');assert.equal(e.hitCount,1);assert.equal(e.heavyCount,1);
  }
  const impulse=variant.knockVelocity.length()/oracle.knockVelocity.length();assert.ok(Math.abs(impulse-.8)<1e-6);assert.ok(Vector3.Dot(variant.knockVelocity.clone().normalize(),oracle.knockVelocity.clone().normalize())>1-1e-6);
  for(let frame=0;frame<2*fps;frame++){
   variant.update(1/fps,f.player);oracle.update(1/fps,f.player);variant.alignPose();oracle.alignPose();
   assert.equal(variant.brain.state,oracle.brain.state);assert.ok(Math.abs(variant.brain.time-oracle.brain.time)<1e-6);assert.equal(variant.playerHp,500);
   for(const name of ['pelvis','chest','head','fore.L.paw','fore.R.paw']){assert.ok(Vector3.Distance(variant.nodes[name].position,oracle.nodes[name].position)<1e-6);assert.ok(Math.abs(Math.abs(variant.nodes[name].rotationQuaternion.dot(oracle.nodes[name].rotationQuaternion))-1)<1e-6);}
  }
  const originalDistance=Math.hypot(oracle.actor.position.x,oracle.actor.position.z),variantDistance=Math.hypot(variant.actor.position.x,variant.actor.position.z),ratio=variantDistance/originalDistance;assert.ok(originalDistance>.1);assert.ok(ratio>=.75&&ratio<=.85,JSON.stringify({fps,id,originalDistance,variantDistance,ratio}));
  assert.ok(Vector3.Dot(variant.actor.position.clone().normalize(),oracle.actor.position.clone().normalize())>.99);assert.equal(variant.brain.hp,oracle.brain.hp);
  rows.push({case:'v02-knockback-reduction',fps,id,impulseRatio:impulse,originalDistance,variantDistance,totalDistanceRatio:ratio,sourcePoseAndTimingUnchanged:true});
 }
 oracle.hide();
});

test('preserved R9 standing snap keeps four feet planted while body pressure uses a short supported forepaw step',async t=>{
 const f=await fixture(t);assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const e=f.battle.encounters[0],scales=Object.fromEntries(Object.entries(e.nodes).map(([name,node])=>[name,node.scaling.clone()]));let serial=10000;
 const snap=WOLF_V02_R9_CLIPS.find(c=>c.name==='Wolf_Snap_Bite_V02'),swipe=WOLF_V02_R9_CLIPS.find(c=>c.name==='Wolf_Forepaw_Swipe_V02');assert.ok(snap&&swipe);
 for(const clip of [snap,swipe]){
  const snapshots=[];
  for(let i=0;i<=60;i++){
   samplePose(e,clip.name,clip.duration*i/60,serial++);const root=e.animator.root.position,start=clip.rootTrack[0];e.actor.position.set((root.x-start[0])*e.config.scale,0,(root.z-start[2])*e.config.scale);e.alignPose();for(const [name,node]of Object.entries(e.nodes))assert.ok(Vector3.Distance(node.scaling,scales[name])<3e-6,name+' scale stays fixed');
   snapshots.push({actor:e.actor.position.clone(),root:e.animator.root.getAbsolutePosition().clone(),pelvis:e.nodes.pelvis.getAbsolutePosition().clone(),jaw:e.nodes.jaw.getAbsolutePosition().clone(),jawRotation:e.nodes.jaw.rotationQuaternion.clone(),left:e.nodes['fore.L.paw'].getAbsolutePosition().clone(),feet:['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'].map(n=>e.nodes[n].getAbsolutePosition().clone())});
  }
  assert.ok(span(snapshots.map(s=>s.pelvis),'y')<.20,'short attacks cannot inherit the pin body dive');
  if(clip===snap){
   assert.ok(span(snapshots.map(s=>s.root),'x')<.01&&span(snapshots.map(s=>s.root),'z')<.01,'snap cannot inherit a pin root burst');
   const reference=snapshots[0],jawAngles=snapshots.map(s=>2*Math.acos(Math.min(1,Math.abs(s.jawRotation.dot(reference.jawRotation)))));assert.ok(Math.max(...jawAngles)>.10,'snap must open its jaw');assert.ok(jawAngles.at(-1)<.03,'snap closes after contact');
   const footDrift=Math.max(...snapshots.flatMap(s=>s.feet.map((p,i)=>Vector3.Distance(p,reference.feet[i]))));assert.ok(footDrift<.06,'snap keeps its four support feet planted');
   let distinct=0;for(const u of [.2,.4,.6,.8]){samplePose(e,snap.name,snap.duration*u,serial++);const p=e.nodes.pelvis.getAbsolutePosition().clone(),j=e.nodes.jaw.getAbsolutePosition().clone();samplePose(e,WOLF_CLIPS.pin,e.animator.durations[WOLF_CLIPS.pin]*u,serial++);distinct+=Vector3.Distance(p,e.nodes.pelvis.getAbsolutePosition())+Vector3.Distance(j,e.nodes.jaw.getAbsolutePosition());}assert.ok(distinct>1,'snap must differ numerically from a renamed full pin');
   rows.push({case:'standing-snap-shape',jawAngularExcursion:Math.max(...jawAngles),supportFootDrift:footDrift,pelvisVerticalSpan:span(snapshots.map(s=>s.pelvis),'y'),differenceFromPin:distinct});
  }else{
   const paw=snapshots.map(s=>s.left),travel=Math.max(...snapshots.map(s=>Vector3.Distance(snapshots[0].actor,s.actor))),step=Math.max(...paw.map(p=>Vector3.Distance(paw[0],p))),lift=span(paw,'y');assert.ok(travel>.35&&travel<.50,'body pressure has a modest authored advance before retreat');assert.ok(step>.80&&step<.88,JSON.stringify({message:'lead paw follows its authored .335 source-metre stride at 2.5 scale',travel,step,lift,pawAt:[paw[0].asArray(),paw[26].asArray(),paw.at(-1).asArray()]}));assert.ok(lift>.10&&lift<.35,'support paw lifts modestly rather than striking high');
   const supportDrift=Math.max(...snapshots.flatMap(s=>s.feet.slice(1).map((p,i)=>Vector3.Distance(p,snapshots[0].feet[i+1]))));assert.ok(supportDrift<.06,'other three feet keep their planted support');
   const planted=snapshots.filter((s,i)=>clip.duration*i/60>=clip.impact&&clip.duration*i/60<=.70);const afterLandingDrift=Math.max(...planted.map(s=>Vector3.Distance(s.left,planted[0].left)));assert.ok(afterLandingDrift<.03,'lead paw plants during the authored .43–.70 support interval');assert.ok(Vector3.Distance(snapshots[0].actor,snapshots.at(-1).actor)<.01,'pressure recovers to its initial stance');
   rows.push({case:'body-pressure-support-step',rootExcursion:travel,leadPawStep:step,leadPawLift:lift,otherSupportFootDrift:supportDrift,plantedInterval:[.43,.70],leadFootDriftDuringSupport:afterLandingDrift,pawSpan:{x:span(paw,'x'),y:span(paw,'y'),z:span(paw,'z')},pelvisVerticalSpan:span(snapshots.map(s=>s.pelvis),'y'),pressAndRetreat:true});
  }
 }
 const localPose=()=>Object.entries(e.nodes).map(([name,node])=>[name,...node.position.asArray(),...(node.rotationQuaternion?.asArray()??node.rotation.asArray()),...node.scaling.asArray()]);
 samplePose(e,WOLF_CLIPS.rest,0,serial++);samplePose(e,snap.name,.4,serial++);const fromRest=localPose();samplePose(e,WOLF_CLIPS.pin,1.85,serial++);samplePose(e,snap.name,.4,serial++);const afterPin=localPose();assert.deepEqual(afterPin.map(row=>row[0]),fromRest.map(row=>row[0]));for(let i=0;i<fromRest.length;i++)for(let k=1;k<fromRest[i].length;k++)assert.ok(Math.abs(afterPin[i][k]-fromRest[i][k])<1e-7,'new clip overwrites the complete bone pose after pin, without stale limbs');
});

test('new snap, chain and swipe hit actual warrior body once per strike using only their authored contact parts',async t=>{
 const f=await fixture(t);
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const id of ['quick-bite','chain-bite','paw-swipe']){
  assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const e=f.battle.encounters[0],action=WOLF_V02_BY_ID[id];e.actor.position.setAll(0);e.actor.rotation.y=0;f.player.position.set(0,0,action.preferredDistance);f.player.rotation.y=Math.PI;const initial=f.player.position.clone(),hits=new Map(),contacts=[];
  e.brain.configureAttacks({custom:true,sequence:[id],speed});e.brain.startAction(id);e.playerHp=500;e.playerInvulnerable=0;const hitPlayer=e.hitPlayer.bind(e);
  e.hitPlayer=(...args)=>{const before=e.playerHp;hitPlayer(...args);if(e.playerHp<before){hits.set(e.brain.serial,(hits.get(e.brain.serial)??0)+1);contacts.push(structuredClone(e.v02LastContact));}};
  let frames=0;try{while(frames++<1200&&(e.brain.mode==='attack'||e.brain.behavior==='recovery')){f.battle.update(1/fps,f.player);const hp=e.playerHp,behavior=e.brain.behavior;f.battle.poseAndContacts(f.player,{state:'idle'},null,null);if(['anticipation','recovery'].includes(behavior))assert.equal(e.playerHp,hp);assert.equal(e.grab.active,false);}}finally{e.hitPlayer=hitPlayer;}
  assert.ok(frames<1200);assert.equal(hits.size,action.chain?2:1);assert.ok([...hits.values()].every(n=>n===1));assert.deepEqual(f.player.position.asArray(),initial.asArray());
  for(const contact of contacts){assert.ok(contact?.contact);assert.ok(action.contactParts.includes(contact.part));assert.ok(contact.distance<=contact.radius+1e-8);assert.ok(contact.point[1]>=.15-contact.radius&&contact.point[1]<=WARRIOR_DIMENSIONS.headHeight+contact.radius);}
  assert.equal(f.scene._activeAnimatables.length,0);rows.push({case:'authored-body-contact',id,fps,speed,strikes:hits.size,contacts});
 }
});

test('disposing authored actor adapters removes all six added animation groups and leaves the shared template intact',async t=>{
 const f=await fixture(t),baseline={groups:f.scene.animationGroups.length,native:f.scene._activeAnimatables.length,dispose:f.scene.onDisposeObservable.observers.length},factory=createActorEncounterFactory({world:f.world,battle:f.battle,getPlayer:()=>f.player,libraryFactory:()=>({library:f.models,owned:false})});f.player.position.setAll(0);
 try{for(let cycle=0;cycle<3;cycle++){const adapter=factory('alpha-wolf.r8');await adapter.activate({position:new Vector3(0,0,4)});assert.equal(adapter.encounter.asset.animationGroups.length,18);await adapter.dispose();assert.equal(f.scene.animationGroups.length,baseline.groups);assert.equal(f.scene._activeAnimatables.length,baseline.native);assert.equal(f.scene.onDisposeObservable.observers.length,baseline.dispose);assert.equal(f.container.animationGroups.length,12);}}finally{await factory.dispose();}
 rows.push({case:'authored-group-disposal',cycles:3,addedGroupsPerActor:6,groupsReturnedToBaseline:true,nativeAndDisposalObserversStable:true});
});
