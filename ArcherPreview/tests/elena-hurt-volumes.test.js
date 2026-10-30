import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,VertexBuffer,Matrix} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {MeleeContactGate} from '../src/melee-collision.js';
import {MOURNING_HURT_SEGMENTS} from '../src/mourning-elena-hurt.js';
import {MOURNING_SIZE,MOURNING_SIZE_SCALE} from '../src/elena-spec.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));let packed;
async function fixture(t){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  packed??=readRuntimeGltf(new URL(config.model,base));const source=await packed,gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const group of container.animationGroups)group.stop();
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('hurt-offline',scene);
  const models=new BossModelLibrary(scene,'mourning-elena');models.config=config;models.container=container;models.load=async()=>{};
  const world={scene,terrain:{heightAt:()=>6,place:p=>{p.y=6;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const e=new MourningElenaEncounter(world,()=>{},()=>{},()=>{},{loadAsset:()=>models.instantiate()}),player=new TransformNode('hurt-player',scene);
  player.position.set(0,6,4);await e.summon(player,{position:new Vector3(0,6,0),rotationY:0});
  t.after(()=>{e.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
  const body=e.asset.meshes.find(mesh=>mesh.morphTargetManager&&!mesh.metadata?.moonforestOutline);
  return {e,player,body,scene,engine};
}
function pose(e,state,time,yaw=0){e.actor.rotation.y=yaw;e.animator.current=state;e.animator.walkTime=state==='walk'?time:0;e.animator.castTime=state==='cast'?time:0;e.animator.gaitBlend=state==='walk'?1:0;e.alignPose();e.animator.sample(0);}
function skin(body,stride=8){
  body.skeleton.prepare(true);const matrices=body.skeleton.getTransformMatrices(body),positions=body.getVerticesData(VertexBuffer.PositionKind),joints=body.getVerticesData(VertexBuffer.MatricesIndicesKind),weights=body.getVerticesData(VertexBuffer.MatricesWeightsKind),targets=body.morphTargetManager;
  const out=[],matrix=Matrix.Identity(),p=new Vector3(),q=new Vector3(),world=body.getWorldMatrix(),boneNames=Object.fromEntries(body.skeleton.bones.map((bone,index)=>[bone.getIndex()??index,bone.name]));
  for(let i=0;i<positions.length/3;i+=stride){
    p.copyFromFloats(positions[i*3],positions[i*3+1],positions[i*3+2]);
    for(let target=0;target<targets.numTargets;target++){const morph=targets.getTarget(target),data=morph.getPositions();if(morph.influence)for(let k=0;k<3;k++)p[['x','y','z'][k]]+=(data[i*3+k]-positions[i*3+k])*morph.influence;}
    q.setAll(0);let dominant=0;for(let j=0;j<4;j++){const w=weights[i*4+j];if(w>weights[i*4+dominant])dominant=j;if(w){Matrix.FromArrayToRef(matrices,joints[i*4+j]*16,matrix);q.addInPlace(Vector3.TransformCoordinates(p,matrix).scaleInPlace(w));}}
    out.push({p:Vector3.TransformCoordinates(q,world).asArray(),bone:boneNames[joints[i*4+dominant]]});
  }
  return out;
}

function clearance(point,capsules){let distance=Infinity;for(const {points:[a,b],radius} of capsules){const x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2],dx=point[0]-a[0],dy=point[1]-a[1],dz=point[2]-a[2],length=x*x+y*y+z*z,t=length?Math.max(0,Math.min(1,(dx*x+dy*y+dz*z)/length)):0;distance=Math.min(distance,Math.hypot(dx-x*t,dy-y*t,dz-z*t)-radius);}return distance;}
function originalCapsules(e){return [['DEF_Abdomen','DEF_Chest',.4],['DEF_Chest','DEF_Head',.3],['DEF_FrontHand.L_UpperArm','DEF_FrontHand.L_Forearm',.22],['DEF_FrontHand.L_Forearm','DEF_FrontHand.L_Palm',.2],['DEF_FrontFoot.R_Thigh','DEF_FrontFoot.R_Shin',.22],['DEF_FrontFoot.R_Shin','DEF_FrontFoot.R_Foot',.22]].map(([a,b,radius])=>({points:[e.nodes[a].getAbsolutePosition().asArray(),e.nodes[b].getAbsolutePosition().asArray()],radius:radius*MOURNING_SIZE_SCALE}));}
const snapshots=scene=>[scene.meshes.length,scene.geometries.length,scene.materials.length,scene.textures.length,scene.skeletons.length,scene.morphTargetManagers.length];
const part=bone=>bone.replace(/^DEF_/,'').replace(/_(UpperArm|Forearm|Palm|Thigh|Shin|Foot|Finger|Toe).*/,''),isAnatomy=bone=>/Hand|Foot|Prayer|^DEF_Head$|^DEF_Neck$/.test(bone);
const sampleAt=(point,actionId=1)=>({actionId,window:{id:'blade',damage:18},elapsed:.6,blade:[point,[point[0],point[1]+.01,point[2]]],previous:null,bladeRadius:.055});

test('the unchanged packed body scales from 2.7 to 5.7 metres without accumulating across summons',async t=>{
  const {e,body,player}=await fixture(t),sourceScale=config.scale;
  e.actor.scaling.setAll(sourceScale);pose(e,'idle',0);const source=skin(body,1),height=vertices=>Math.max(...vertices.map(v=>v.p[1]))-Math.min(...vertices.map(v=>v.p[1]));
  const originalHeight=height(source);e.actor.scaling.setAll(sourceScale*MOURNING_SIZE_SCALE);pose(e,'idle',0);const enlarged=skin(body,1),enlargedHeight=height(enlarged);
  assert.ok(Math.abs(originalHeight-2.7)<.04,originalHeight);assert.ok(Math.abs(enlargedHeight-5.7)<.08,enlargedHeight);
  assert.ok(Math.abs(enlargedHeight/originalHeight-MOURNING_SIZE_SCALE)<1e-5);
  for(let i=0;i<source.length;i+=83)for(let k=0;k<3;k++)assert.ok(Math.abs((enlarged[i].p[k]-e.actor.position.asArray()[k])-(source[i].p[k]-e.actor.position.asArray()[k])*MOURNING_SIZE_SCALE)<2e-5);
  const capsules=e.hurtCapsules();for(let i=0;i<capsules.length;i++)assert.equal(capsules[i].radius,MOURNING_HURT_SEGMENTS[i].radius*MOURNING_SIZE_SCALE);
  assert.equal(e.radius,MOURNING_SIZE.radius);assert.equal(e.separationRadius,MOURNING_SIZE.separationRadius);assert.equal(e.contact.mesh.scaling.x,3*MOURNING_SIZE_SCALE);
  const anchor=e.healthBarPosition();assert.ok(Math.abs(anchor.y-e.actor.position.y-6)<1e-6);assert.strictEqual(e.healthBarPosition(),anchor);
  for(let i=0;i<4;i++){await e.summon(player,{position:new Vector3(0,6,0),rotationY:0});assert.equal(e.actor.scaling.x,sourceScale*MOURNING_SIZE_SCALE);assert.equal(e.config.scale,sourceScale);assert.strictEqual(e.hurtCapsules(),capsules);}
  t.diagnostic(JSON.stringify({sourceBodyHeight:originalHeight,enlargedBodyHeight:enlargedHeight,ratio:MOURNING_SIZE_SCALE,originalManifestHeight:config.height,collisionRadius:e.radius,hurtCapsules:capsules.length,playerBladeRadius:.055}));
});

test('all asymmetric limbs follow actual skinned walk/cast surfaces from front, side and rear',async t=>{
  const {e,body}=await fixture(t),groups={};let total=0,hits=0,oldHits=0;
  const poses=[... [.12,.49,.97,1.56,2.17].map(time=>['walk',time]),... [.08,.38,.91,1.37,1.91,2.43,2.91].map(time=>['cast',time])];
  for(const yaw of [0,Math.PI/2,Math.PI])for(const [state,time] of poses){
    pose(e,state,time,yaw);const capsules=e.hurtCapsules(),old=originalCapsules(e);assert.equal(capsules.length,MOURNING_HURT_SEGMENTS.length);
    assert.ok(capsules.every(c=>c.radius>0&&c.points.flat().every(Number.isFinite)));
    for(const {bone,p} of skin(body)){
      if(!isAnatomy(bone))continue;const key=part(bone),entry=groups[key]??={total:0,hits:0};entry.total++;total++;
      const hit=clearance(p,capsules)<=.055;entry.hits+=Number(hit);hits+=Number(hit);oldHits+=Number(clearance(p,old)<=.055);
    }
  }
  assert.ok(hits/total>.985,JSON.stringify({hits,total,coverage:hits/total}));
  for(const [name,group] of Object.entries(groups))assert.ok(group.hits/group.total>.975,name+': '+JSON.stringify(group));
  assert.ok(oldHits/total<.5,'fixture must reproduce the old missing-limb regression');
  for(const name of ['FrontHand.L','MidHand.L','OuterHand.L','InnerHand.L','RearHand.L','RearInnerHand.R','RearOuterHand.R','OuterHand.R','MidHand.R','FrontFoot.R'])assert.ok(groups[name]?.total>100,name);
  t.diagnostic(JSON.stringify({poses:poses.length*3,capsules:MOURNING_HURT_SEGMENTS.length,skinnedSurfaceSamples:total,coverage:hits/total,previousCoverage:oldHits/total,perPart:Object.fromEntries(Object.entries(groups).map(([name,g])=>[name,g.hits/g.total]))}));
});

test('r8 idle, explicit hit and interrupted-cast hit keep skin contacts through the complete clips',async t=>{
  const {e,body}=await fixture(t),gate=new MeleeContactGate(),results={},torsoMisses=[];let actionId=0,torsoContacts=0,lowestFoot=Infinity,poses=0;
  const samples={idle:[0,.25,.75,1.5,2.25,3,4.5,5.75,5.999],hit:[0,.035,.07,.16,.35,.65,.95,1.15,1.299],'cast-hit':[0,.035,.07,.16,.35,.65,.95,1.15,1.299]};
  for(const yaw of [0,Math.PI/2,Math.PI])for(const [state,times] of Object.entries(samples))for(const time of times){
    e.actor.rotation.y=yaw;e.alignPose();e.animator.reset();
    if(state==='cast-hit'){e.animator.transition('cast',{clipTime:1.5,actionId:1});e.animator.update(0);}
    e.animator.transition(state==='idle'?'idle':'hit',{actionId:2});e.animator.update(time);poses++;
    assert.equal(e.animator.current,state==='idle'?'idle':'hit');
    if(state==='idle')assert.equal(e.animator.weights.idle,1);
    else if(time>=.16&&time<=.95)assert.equal(e.animator.weights.hit,1,'the authored hit clip must actually be sampled');
    const capsules=e.hurtCapsules(),vertices=skin(body),result=results[state]??={total:0,hits:0,parts:{},worstMiss:null};
    assert.equal(capsules.length,49);assert.ok(capsules.every(c=>c.points.flat().every(Number.isFinite)));
    for(const {bone,p} of vertices){
      if(/_Palm$|_Foot$|_Toe/.test(bone))lowestFoot=Math.min(lowestFoot,p[1]-e.actor.position.y);
      if(!isAnatomy(bone))continue;
      const distance=clearance(p,capsules),hit=distance<=.055,key=part(bone),group=result.parts[key]??={total:0,hits:0};result.total++;group.total++;result.hits+=Number(hit);group.hits+=Number(hit);
      if(!hit&&(!result.worstMiss||distance>result.worstMiss.distance))result.worstMiss={bone,time,yaw,distance,position:p};
    }
    // The torso check selects real skin nearest authored chest/abdomen anchors,
    // independently of the capsules, including leaning hit poses.
    const torso=vertices.filter(v=>/^(DEF_Abdomen|DEF_Chest|DEF_Neck)$/.test(v.bone));
    for(const name of ['DEF_Abdomen','DEF_Chest'])for(const [x,z] of [[0,.3],[.3,0],[0,-.3],[-.3,0]]){
      const center=e.nodes[name].getAbsolutePosition(),target=[center.x+(x*Math.cos(yaw)+z*Math.sin(yaw))*MOURNING_SIZE_SCALE,center.y,center.z+(z*Math.cos(yaw)-x*Math.sin(yaw))*MOURNING_SIZE_SCALE];
      const closest=torso.reduce((best,v)=>{const distance=Math.hypot(...v.p.map((value,k)=>value-target[k]));return distance<best.distance?{point:v.p,distance}:best;},{distance:Infinity});
      if(gate.check({...sampleAt(closest.point,++actionId),capsules}))torsoContacts++;else torsoMisses.push({state,time,yaw,name,point:closest.point,clearance:clearance(closest.point,capsules)});
    }
    const underBody=[0,e.actor.position.y+.25*MOURNING_SIZE_SCALE,0];assert.equal(gate.check({...sampleAt(underBody,++actionId),capsules}),false,'space beneath the raised body stays open');
  }
  const summary={poses,torsoContacts,torsoMisses,lowestFoot,clips:Object.fromEntries(Object.entries(results).map(([state,r])=>[state,{samples:r.total,coverage:r.hits/r.total,perPart:Object.fromEntries(Object.entries(r.parts).map(([name,p])=>[name,p.hits/p.total])),worstMiss:r.worstMiss}]))};
  t.diagnostic(JSON.stringify(summary));
  for(const [state,result] of Object.entries(results)){assert.ok(result.hits/result.total>.985,state+' total skin coverage');for(const [name,p] of Object.entries(result.parts))assert.ok(p.hits/p.total>.975,state+' '+name+': '+p.hits/p.total);}
  assert.equal(torsoMisses.length,0);assert.equal(torsoContacts,poses*8);assert.ok(lowestFoot>-.12,'planted skin must stay above the floor within 12 cm');
});

test('real side/rear blade contacts damage once per swing through the encounter route',async t=>{
  const {e,body,player}=await fixture(t);let actionId=0,checked=0;
  for(const yaw of [0,Math.PI/2,Math.PI])for(const [state,time] of [['walk',.75],['cast',1.5]]){
    pose(e,state,time,yaw);const vertices=skin(body),capsules=e.hurtCapsules(),old=originalCapsules(e);
    for(const limb of ['MidHand.L','OuterHand.L','RearHand.L','RearInnerHand.R','RearOuterHand.R','OuterHand.R','MidHand.R']){
      const points=vertices.filter(v=>v.bone==='DEF_'+limb+'_Palm').map(v=>v.p),point=points[Math.floor(points.length/2)];assert.ok(point,limb);
      assert.ok(clearance(point,capsules)<=.055,limb+' '+state);assert.ok(clearance(point,old)>.1,limb+' must reproduce a previously uncovered surface');
      player.position.set(0,6,5);e.brain.hp=1800;e.brain.stagger=0;e.brain.mode='idle';e.brain.state='idle';e.pendingEvents=[];
      const sample=sampleAt(point,++actionId);e.poseAndContacts(player,{state:'idle'},sample,null);const hp=e.brain.hp;
      assert.ok(hp<1800,limb);e.poseAndContacts(player,{state:'idle'},sample,null);assert.equal(e.brain.hp,hp,'one swing must not hit several overlapping body parts');checked++;
    }
  }
  t.diagnostic(JSON.stringify({realPreviouslyMissedContacts:checked}));
});

test('empty spaces between planted limbs and outside the head remain unhittable',async t=>{
  const {e}=await fixture(t),gate=new MeleeContactGate();let id=0;
  const gaps=[[0,.25,0],[.65,.25,1.45],[-.3,.22,-1.75],[-1.5,.15,.04],[0,3.4,0],[2.2,1.4,0]];
  for(const yaw of [0,.8,2.7]){
    pose(e,'walk',0,yaw);const capsules=e.hurtCapsules();
    for(const [x,y,z] of gaps){const point=[(x*Math.cos(yaw)+z*Math.sin(yaw))*MOURNING_SIZE_SCALE,6+y*MOURNING_SIZE_SCALE,(z*Math.cos(yaw)-x*Math.sin(yaw))*MOURNING_SIZE_SCALE];assert.ok(clearance(point,capsules)>.055,JSON.stringify({point,gap:[x,y,z],clearance:clearance(point,capsules)}));assert.equal(gate.check({...sampleAt(point,++id),capsules}),false);}
  }
});

test('front, side and back torso skin remains vulnerable while the actor rotates',async t=>{
  const {e,body}=await fixture(t),gate=new MeleeContactGate();let actionId=0;
  for(const yaw of [0,Math.PI/2,Math.PI])for(const [state,time] of [['walk',.6],['cast',1.5]]){
    pose(e,state,time,yaw);const vertices=skin(body).filter(v=>/^(DEF_Abdomen|DEF_Chest|DEF_Neck)$/.test(v.bone)),capsules=e.hurtCapsules();
    for(const name of ['DEF_Abdomen','DEF_Spine','DEF_Chest'])for(const [x,z] of [[0,.3],[.3,0],[0,-.3],[-.3,0]]){
      const center=e.nodes[name].getAbsolutePosition(),target=[center.x+(x*Math.cos(yaw)+z*Math.sin(yaw))*MOURNING_SIZE_SCALE,center.y,center.z+(z*Math.cos(yaw)-x*Math.sin(yaw))*MOURNING_SIZE_SCALE];
      const closest=vertices.reduce((best,v)=>{const distance=Math.hypot(...v.p.map((value,k)=>value-target[k]));return distance<best.distance?{point:v.p,distance}:best;},{distance:Infinity});
      assert.ok(closest.distance<.45*MOURNING_SIZE_SCALE,name+' must sample the nearby torso surface');assert.equal(gate.check({...sampleAt(closest.point,++actionId),capsules}),true,name+' '+state+' '+yaw);
    }
  }
  assert.equal(actionId,72);
});

test('hurt volumes reuse endpoint arrays through pose changes, relocation and a pooled reset',async t=>{
  const {e,scene,player}=await fixture(t);pose(e,'walk',0);const capsules=e.hurtCapsules(),references=capsules.map(c=>[c,c.points,c.points[0],c.points[1]]),counts=snapshots(scene);
  for(let i=0;i<600;i++){
    if(i%20===0){e.actor.position.set(i/200,6,0);pose(e,i%40?'walk':'cast',(i%160)/60,i/100);}
    assert.strictEqual(e.hurtCapsules(),capsules);for(let j=0;j<capsules.length;j++){assert.strictEqual(capsules[j],references[j][0]);assert.strictEqual(capsules[j].points,references[j][1]);assert.strictEqual(capsules[j].points[0],references[j][2]);assert.strictEqual(capsules[j].points[1],references[j][3]);}
  }
  assert.deepEqual(snapshots(scene),counts);e.hide();await e.summon(player,{position:new Vector3(3,6,-2),rotationY:.8});pose(e,'walk',0,.8);
  assert.strictEqual(e.hurtCapsules(),capsules);assert.deepEqual(snapshots(scene),counts);assert.ok(capsules.every(c=>c.points.flat().every(Number.isFinite)));
});

test('optional actual sword-sweep CPU sample includes misses, lateral cuts and cached volumes',async t=>{
  if(process.env.ELENA_HURT_BENCHMARK!=='1')return;
  const {e}=await fixture(t);pose(e,'walk',.6);const capsules=e.hurtCapsules(),gate=new MeleeContactGate(),times=[],samples=[];
  for(const [x,y,z] of [[-1.1,.7,.4],[1.45,.7,-.9],[-.9,.6,-1.4],[0,1.4,0],[3,1,0],[-1.5,.2,.04]])samples.push({blade:[[x,6+y,z-.5],[x,6+y,z+.5]],previous:[[x-.2,6+y,z-.5],[x-.2,6+y,z+.5]],lateral:{axis:[1,0,0],halfWidth:.3},bladeRadius:.055,window:{id:'cut',damage:20}});
  for(let i=0;i<1800;i++){const start=performance.now();gate.check({...samples[i%samples.length],actionId:i,capsules:e.hurtCapsules()});if(i>=300)times.push(performance.now()-start);}
  const candidates=samples.map(sample=>capsules.filter(c=>[0,1,2].every(axis=>{const values=[...sample.blade,...sample.previous].map(p=>p[axis]),extra=c.radius+sample.bladeRadius+Math.abs(sample.lateral.axis[axis])*sample.lateral.halfWidth;return Math.max(...values)+extra>=Math.min(c.points[0][axis],c.points[1][axis])&&Math.min(...values)-extra<=Math.max(c.points[0][axis],c.points[1][axis]);})).length);
  times.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({kind:'CPU only; cached posed capsules plus actual MeleeContactGate sword sweeps',capsules:capsules.length,broadphaseCandidates:candidates,warmup:300,samples:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)]}));
});
