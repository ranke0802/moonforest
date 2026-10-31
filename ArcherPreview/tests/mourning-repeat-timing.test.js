import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion,StandardMaterial,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {MOURNING_SPELLS,ELENA_HOME} from '../src/elena-spec.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));
const report={baselineRevision:'d1ad05b',sourceSha256:config.sourceSha256,scope:'Actual shipped packed r10 model and BossBattle/encounter/telegraph/contact path on a flat legal floor isolating motion/timing. CPU NullEngine with injected player action states, not the warrior locomotion controller. No browser automation, GPU timing, physical iPhone/S23, audio or visual-art claims. Actual-cave routes and real player dodge animation have separate existing suites.',cases:[],controls:[],lifecycle:[],observations:[]};
const clips={cast:'Chimera_Arcane_Cast_3s',cast_slam:'Chimera_Advance_Slam_3s',cast_alternate:'Chimera_Alternating_Cast_3s'};
const schedules={fps30:[1/30],fps60:[1/60],slow:[1/30,.09,.1,.05]}; // FrameLoop caps real hitches to 100 ms.
const near=(a,b,tolerance=1e-5,message='value')=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const qDistance=(a,b)=>2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(a,b))));
const difference=(a,b)=>a instanceof Quaternion?Math.min(Math.hypot(...a.asArray().map((v,i)=>v-b.asArray()[i])),Math.hypot(...a.asArray().map((v,i)=>v+b.asArray()[i]))):Vector3.Distance(a,b);
const keys=f=>f.e.animator.body.filter(c=>!c.target.name.startsWith('DEF_HaloCloth_')&&!c.target.name.includes('Halo'));
const snapshot=f=>keys(f).map(c=>c.target[c.property].clone());
const count=f=>({meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,nodes:f.scene.transformNodes.length,groups:f.scene.animationGroups.length,skeletons:f.scene.skeletons.length,materials:f.scene.materials.length,textures:f.scene.textures.length,morphManagers:f.scene.morphTargetManagers.length,pool:f.battle.allPooled.length,animatables:f.scene.animatables.length});
function save(){mkdirSync(new URL('../reports/elena-repeat-ios/',import.meta.url),{recursive:true});writeFileSync(new URL('../reports/elena-repeat-ios/animation-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
async function fixture(t){
 setWorldCharacter('warrior-v5');const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,d,format,mips,invert,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invert,sampling,compression,type);texture.depth=d;texture.is2DArray=true;return texture;};
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const source=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(source.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 for(const group of container.animationGroups)group.stop();for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('repeat-offline',scene);
 const models=new BossModelLibrary(scene,'mourning-elena');models.config=config;models.container=container;models.load=async()=>{};
 // Isolate timing/pose from cave route choices; route collision has a separate
 // actual-cave suite. The real encounter, movement and damage implementations run.
 const terrain={heightAt:()=>6,place:p=>{p.y=6;}},navigation={free:()=>true,segmentClear:()=>true,steer:(_p,target)=>target,constrain(){}};
 const world={scene,cave:true,terrain,navigation,shadows:{addShadowCaster(){},removeShadowCaster(){}}},events=[];
 const battle=new BossBattle(world,()=>{},(...event)=>events.push(event),()=>true,{mourningModels:models}),player=new TransformNode('repeat-player',scene);player.position.set(29,6,-17.4);player.rotation.y=Math.PI;
 battle.residentPhase=2;await battle.activateResident(player);const e=battle.mourningPool[0];e.renderVisible=true;
 const f={engine,scene,world,battle,player,e,source,container,loader,events,calls:[],frame:0,time:0};
 const original=e.receiveBossHit.bind(e);e.receiveBossHit=args=>{f.calls.push({serial:e.brain.serial,frame:f.frame,elapsed:f.time,clipTime:e.brain.time,variant:e.animator.castVariant,player:player.position.asArray(),plan:e.spell.plan,damage:args.damage,action:args.action?.state});return original(args);};
 t.after(()=>{battle.hide();e.spell?.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');});return f;
}
function step(f,dt=1/60,action={state:'idle'}){f.frame++;f.time+=dt;f.battle.update(dt,f.player);f.scene._animate(0);const pending=f.e.pendingEvents.filter(e=>e.kind==='ground').length;f.battle.poseAndContacts(f.player,action,null,null);return pending;}
function advance(f,seconds,action={state:'idle'}){let elapsed=0;while(elapsed<seconds-1e-9){const dt=Math.min(1/60,seconds-elapsed);step(f,dt,action);elapsed+=dt;}}
function resetPosition(f){f.e.actor.position.set(29,6,-25.5);f.e.home=ELENA_HOME;f.e.actor.rotation.y=0;f.player.position.set(29,6,-17.4);f.battle.combat.reset();f.e.brain.hp=1800;f.e.brain.stagger=0;f.events.length=0;f.calls.length=0;f.time=0;f.frame=0;}
function groundContainsByTriangles(mesh,p){
 const v=mesh.getVerticesData(VertexBuffer.PositionKind),idx=mesh.getIndices();
 for(let i=0;i<idx.length;i+=3){
  const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
  if(Math.abs((v[b]-v[a])*(v[c+2]-v[a+2])-(v[c]-v[a])*(v[b+2]-v[a+2]))<1e-9)continue;
  const sign=(x,z,y,w)=>(p.x-y)*(z-w)-(x-y)*(p.z-w),d1=sign(v[a],v[a+2],v[b],v[b+2]),d2=sign(v[b],v[b+2],v[c],v[c+2]),d3=sign(v[c],v[c+2],v[a],v[a+2]);
  if(!((d1<-.000001||d2<-.000001||d3<-.000001)&&(d1>.000001||d2>.000001||d3>.000001)))return true;
 }
 return false;
}
function sourceError(f){
 const a=f.e.animator;if(a.weights.cast<1-1e-8)return 0;
 const procedural=new Set(a.halo.map(c=>c.target.uniqueId+':'+c.property));let max=0;
 for(const {target,animation}of f.e.asset.animationGroups.find(g=>g.name===clips[a.castVariant]).targetedAnimations){
  const p=animation.targetProperty;if(!['position','rotationQuaternion','scaling'].includes(p)||target.name.startsWith('DEF_HaloCloth_')||procedural.has(target.uniqueId+':'+p))continue;
  const expected=animation.evaluate(a.castTime*animation.framePerSecond);max=Math.max(max,difference(target[p],expected));
 }
 return max;
}

test('real model repeat casts keep authored poses, fixed warnings and one same-frame release at all configured speeds/frame schedules',{timeout:120000},async t=>{
 const f=await fixture(t);let sourceMax=0,maxBoundaryError=0;
 try{
  for(const [schedule,steps]of Object.entries(schedules))for(const speed of [.5,1,2])for(let repeat=0;repeat<2;repeat++)for(const spec of MOURNING_SPELLS){
   resetPosition(f);f.e.brain.configureAttacks({custom:true,sequence:[spec.pattern],speed});f.e.brain.movementTurn=0;f.e.brain.reposition();
   for(let i=0;i<12;i++)step(f,1/60);const entry=snapshot(f);f.e.brain.cast();const serial=f.e.brain.serial;step(f,0);
   const boundary=Math.max(...keys(f).map((c,i)=>difference(c.target[c.property],entry[i])));maxBoundaryError=Math.max(maxBoundaryError,boundary);
   const locked=f.e.spell.plan,positions=Array.from(f.e.spell.mesh.getVerticesData(VertexBuffer.PositionKind)),indices=Array.from(f.e.spell.mesh.getIndices()),start=f.time;
   assert.ok(locked,'warning exists before the cast advances');assert.equal(f.e.animator.castVariant,spec.motion);assert.ok(groundContainsByTriangles(f.e.spell.mesh,f.player.position),'stationary positive control starts inside the actual rendered fill');
   const expected=.65+1.65/(1.6*speed),row={schedule,speed,repeat,pattern:spec.pattern,variant:spec.motion,serial,expectedRelease:expected,entryPoseError:boundary,releaseEvents:0,contacts:0};report.cases.push(row);
   let elapsed=0,previousElapsed=0,previousClip=0,lastWarning=0,frame=0,previous=snapshot(f),largestJoint={radians:0};
   while(f.e.brain.mode==='attack'&&frame<800){
    const dt=steps[frame++%steps.length];previousElapsed=elapsed;elapsed+=dt;
    const pending=step(f,dt);row.releaseEvents+=pending;
    if(f.e.brain.mode==='attack'){
     assert.strictEqual(f.e.spell.plan,locked,`serial ${serial}: warning footprint retargeted`);
     assert.ok(f.e.brain.castWarningElapsed>=lastWarning-1e-8,'warning clock cannot run backwards');lastWarning=f.e.brain.castWarningElapsed;
     if(elapsed<expected-1e-8){assert.equal(pending,0,'no damage during the actual pre-release interval');assert.equal(f.calls.length,0);assert.equal(f.e.spell.fired,false);assert.equal(f.e.spell.mesh.isEnabled(),true);}
     sourceMax=Math.max(sourceMax,sourceError(f));
     if(pending){row.release={frame:f.frame,elapsed:f.time-start,clipTime:f.e.brain.time,previousClip,previousElapsed,dt};assert.ok(previousElapsed<expected+1e-8&&elapsed>=expected-1e-8,'release must occur on the frame crossing the independently authored 1.65 s pose');assert.equal(f.e.spell.fired,true);assert.equal(f.e.spell.material.alpha,.48);assert.deepEqual(Array.from(f.e.spell.mesh.getVerticesData(VertexBuffer.PositionKind)),positions);assert.deepEqual(Array.from(f.e.spell.mesh.getIndices()),indices);}
    }
    const current=keys(f);for(let i=0;i<current.length;i++)if(current[i].property==='rotationQuaternion'){const radians=qDistance(current[i].target.rotationQuaternion,previous[i]);if(radians>largestJoint.radians)largestJoint={radians,node:current[i].target.name,frame:f.frame,clip:f.e.brain.time,previousClip,dt};}previous=snapshot(f);previousClip=f.e.brain.time;
   }
   row.contacts=f.calls.length;row.damageEvents=f.events.filter(e=>e[3]==='player').length;row.largestJoint=largestJoint;row.finishState=f.e.brain.state;row.finishVariant=f.e.animator.castVariant;
   assert.ok(frame<800,'cast must complete');assert.equal(row.releaseEvents,1,`serial ${serial} release count`);assert.equal(row.contacts,1,`serial ${serial} contact count`);assert.equal(row.damageEvents,1,`serial ${serial} HP damage count`);assert.equal(f.calls[0].frame,row.release.frame,'damage and visible flash share the release frame');assert.equal(row.finishState,'walk');
   // Independent no-time transition check: a render-only redraw must not move limbs.
   const stopped=snapshot(f);step(f,0);const redrawError=Math.max(...keys(f).map((c,i)=>difference(c.target[c.property],stopped[i])));row.redrawError=redrawError;assert.ok(redrawError<5e-6,`serial ${serial} zero-delta pose discontinuity ${redrawError}`);
  }
  report.pose={maxSourceError:sourceMax,maxEntryBoundaryError:maxBoundaryError};assert.ok(sourceMax<5e-5,'all fully weighted samples match the real authored clip');assert.ok(maxBoundaryError<5e-6,'walk to cast at zero delta is continuous');
 }finally{save();}
});

test('real map hide-return, interrupted cast, death and pooled restart cannot revive a stale spell or retain extra resources',{timeout:120000},async t=>{
 const f=await fixture(t);
 try{
  // Warm every geometry topology before comparing stable resource inventory.
  for(const spec of MOURNING_SPELLS){f.e.brain.nextSpell=MOURNING_SPELLS.indexOf(spec);f.e.brain.cast();step(f,0);f.e.brain.cancelCast();step(f,0);}
  const resources=count(f),actor=f.e.actor,animator=f.e.animator,asset=f.e.asset,geometries=new Set(f.e.spell.topologies.flatMap(e=>[e.fill,e.rim]));report.resourceBaseline=resources;
  for(let repeat=0;repeat<3;repeat++)for(const pattern of ['ring','fan']){
   resetPosition(f);const speed=[.5,1,2][repeat];f.e.brain.configureAttacks({custom:true,sequence:[pattern],speed});f.e.brain.cast();advance(f,.65+1.2/(1.6*speed));const oldSerial=f.e.brain.serial,oldPlan=f.e.spell.plan;
   near(f.e.animator.castTime,1.2,1e-5,'hide occurs during a real weighted attack, not lead-in');assert.equal(f.calls.length,0);
   f.battle.hide();f.world.cave=false;step(f,.1);assert.equal(f.e.spell.plan,null);assert.equal(f.e.actor.isEnabled(),false);assert.equal(f.e.pendingEvents.length,0);
   f.world.cave=true;await f.battle.activateResident(f.player);assert.strictEqual(f.e.actor,actor);assert.strictEqual(f.e.animator,animator);assert.strictEqual(f.e.asset,asset);assert.notEqual(f.e.brain.serial,oldSerial);assert.equal(f.e.spell.plan,null);assert.equal(f.e.pendingEvents.length,0);assert.equal(f.e.animator.disposed,false);
   f.e.brain.configureAttacks({custom:true,sequence:[pattern],speed:[.5,1,2][repeat]});f.e.brain.cast();step(f,0);assert.notStrictEqual(f.e.spell.plan,oldPlan);assert.equal(f.e.spell.serial,f.e.brain.serial);
   advance(f,.65+1.3/(1.6*speed));const before=snapshot(f);f.e.brain.hit({damage:9999});step(f,0);const deathError=Math.max(...keys(f).map((c,i)=>difference(c.target[c.property],before[i])));assert.ok(deathError<5e-6,'death must capture the current attack pose atomically');assert.equal(f.e.spell.plan,null);assert.equal(f.e.pendingEvents.length,0);assert.equal(f.calls.length,0,'interrupted old and dying fresh casts cannot apply release damage');
   for(let frame=0;frame<355;frame++)step(f,1/60);assert.equal(f.e.corpseGone,true);assert.equal(f.e.animator.deathFinished,true);
   await f.battle.activateResident(f.player,{reset:true,phase:2});assert.strictEqual(f.e.actor,actor);assert.strictEqual(f.e.animator,animator);assert.strictEqual(f.e.asset,asset);assert.equal(f.e.animator.deathStarted,false);assert.equal(f.e.brain.hp,1800);assert.equal(f.e.spell.plan,null);assert.deepEqual(count(f),resources);assert.deepEqual(new Set(f.e.spell.topologies.flatMap(e=>[e.fill,e.rim])),geometries,'warm floor buffers are reused through map/death/restart');
   report.lifecycle.push({repeat,pattern,oldSerial,deathError,resourcesStable:true});
  }
 }finally{save();}
});

test('moving out of a locked fill or dodging its release cancels damage without a second late hit',{timeout:120000},async t=>{
 const f=await fixture(t);
 try{
  for(const speed of [.5,1,2])for(const spec of MOURNING_SPELLS)for(const defense of ['outside','dodge']){
   resetPosition(f);f.e.brain.configureAttacks({custom:true,sequence:[spec.pattern],speed});f.e.brain.cast();step(f,0);const serial=f.e.brain.serial,plan=f.e.spell.plan;
   assert.ok(groundContainsByTriangles(f.e.spell.mesh,f.player.position));
   if(defense==='outside'){
    f.player.position.set(plan.origin.x,6,plan.origin.z+(spec.pattern==='ring'?2.5:-4));
    assert.equal(groundContainsByTriangles(f.e.spell.mesh,f.player.position),false,'negative control is outside the actual rendered mesh');
   }
   let releases=0;
   while(f.e.brain.mode==='attack'){
    const action=defense==='dodge'?{state:'dodge',actionId:serial}:{state:'idle'};releases+=step(f,.1,action);
   }
   // Return to normal after the same cast: fired protects against a late retry
   // once invulnerability ends, while the next attack is not advanced yet.
   step(f,0);const damages=f.events.filter(e=>e[3]==='player').length,evades=f.events.filter(e=>e[3]==='evade').length;
   assert.equal(releases,1);assert.equal(damages,0);assert.equal(f.battle.playerHp,500);assert.equal(f.calls.length,defense==='dodge'?1:0);if(defense==='dodge')assert.equal(evades,1);
   report.controls.push({speed,pattern:spec.pattern,defense,serial,releases,damageEvents:damages,contacts:f.calls.length,evades});
  }
 }finally{save();}
});

test('authored angular-step audit separates source motion speed from runtime pose resets',async t=>{
 const f=await fixture(t);const audits=[];
 for(const [variant,name]of Object.entries(clips)){
  const group=f.e.asset.animationGroups.find(g=>g.name===name);let largest={degrees:0};const byNode={},returnByNode={};
  for(const {target,animation}of group.targetedAnimations){
   if(animation.targetProperty!=='rotationQuaternion'||!/^DEF_(Front|Mid|Rear)(Hand|Foot)/.test(target.name))continue;
   for(let frame=1;frame<=90;frame++){
    const from=(frame-1)/30,to=frame/30,a=animation.evaluate(from*animation.framePerSecond),b=animation.evaluate(to*animation.framePerSecond),degrees=qDistance(a,b)*180/Math.PI;
    if(degrees>largest.degrees)largest={degrees,node:target.name,sourceFrom:from,sourceTo:to,sourceDegreesPerSecond:degrees*30};
    if(degrees>(byNode[target.name]?.degrees??0))byNode[target.name]={degrees,sourceFrom:from,sourceTo:to};
    if(from>=.85&&to<=1.65&&degrees>(returnByNode[target.name]?.degrees??0))returnByNode[target.name]={degrees,sourceFrom:from,sourceTo:to};
   }
  }
  audits.push({variant,...largest,byNode,returnByNode});
 }
 report.sourceAngularSteps=audits;
 report.alternateReturnCurve=f.e.asset.animationGroups.find(g=>g.name===clips.cast_alternate).targetedAnimations.filter(({target,animation})=>animation.targetProperty==='rotationQuaternion'&&['DEF_FrontHand.L_Forearm','DEF_FrontHand.L_Forearm_Volume','DEF_FrontHand.L_UpperArm','DEF_MidHand.L_Palm'].includes(target.name)).map(({target,animation})=>{
  let previous=animation.evaluate(.8*animation.framePerSecond);const samples=[];
  for(let frame=49;frame<=108;frame++){const time=frame/60,q=animation.evaluate(time*animation.framePerSecond);samples.push({time,fromPreviousDegrees:qDistance(previous,q)*180/Math.PI,quaternion:q.asArray()});previous=q;}
  return {node:target.name,samples};
 });
 report.summary={positiveCasts:report.cases.length,sameFrameUniqueContacts:report.cases.filter(c=>c.contacts===1&&c.releaseEvents===1&&c.damageEvents===1).length,defenseControls:report.controls.length,mapDeathRestartCycles:report.lifecycle.length,maxReleaseDelaySeconds:Math.max(...report.cases.map(c=>c.release.elapsed-c.expectedRelease)),sourcePoseError:report.pose?.maxSourceError,entryPoseError:report.pose?.maxEntryBoundaryError};
 report.observations.push('Release is quantized to the first rendered game frame that crosses source 1.65 s. Slow 100 ms frames can visibly skip intermediate poses; this is not an additional asynchronous contact delay.','A source arm rotation can be fast even when runtime/source pose error is zero. The per-frame/source angular-step measurements are retained for author review, not classified as mathematical discontinuities.');
 const before=JSON.parse(readFileSync(new URL('fixtures/mourning-return-before.json',import.meta.url)));
 if(before&&before.sourceSha256!==config.sourceSha256){
  const node='DEF_FrontHand.L_Forearm',oldCurve=before.alternateReturnCurve.find(c=>c.node===node),oldDegrees=Math.max(...oldCurve.samples.map(s=>s.fromPreviousDegrees))*2,alternate=audits.find(a=>a.variant==='cast_alternate'),newDegrees=alternate.byNode[node].degrees,newReturnDegrees=alternate.returnByNode[node].degrees;
  report.smoothingComparison={beforeSource:before.sourceSha256,afterSource:config.sourceSha256,node,oldSourceStepDegrees:oldDegrees,newSourceStepDegrees:newDegrees,fullClipReductionPercent:(1-newDegrees/oldDegrees)*100,newReturnStepDegrees:newReturnDegrees,returnReductionPercent:(1-newReturnDegrees/oldDegrees)*100,returnWindow:[.85,1.65],oldWorstGameStepDegrees:Math.max(...before.cases.map(c=>c.largestJoint.radians))*180/Math.PI,newWorstGameStepDegrees:Math.max(...report.cases.map(c=>c.largestJoint.radians))*180/Math.PI,baseline:'Original 30 Hz quaternion step reconstructed from the saved two 60 Hz half-steps. Same runtime timing/pose fixture. Full-clip max can remain at the original intentional reach before the corrected return window.'};
  save();
  for(const variant of ['cast','cast_slam'])near(audits.find(a=>a.variant===variant).degrees,before.sourceAngularSteps.find(a=>a.variant===variant).degrees,.001,variant+' unchanged source angular step');
  assert.ok(newDegrees<oldDegrees*.75,'corrected large forearm return must reduce peak source angular step by at least 25%');
  assert.ok(newReturnDegrees<oldDegrees*.6,'corrected return itself must reduce peak source angular step by at least 40%');
 }
 save();assert.ok(audits.every(a=>Number.isFinite(a.degrees)));
});
