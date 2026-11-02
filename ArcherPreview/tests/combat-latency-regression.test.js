import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {FrameDiagnostics} from '../src/frame-diagnostics.js';
import {prepareBossShaders} from '../src/boss-shader-warmup.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {Vector3} from '@babylonjs/core';

const durations={idle:2,run:.8,slash:1.5,attack:3,judgment:130/30,shieldPush:71/30,dodge:74/30};
test('production attack button buffers a full hold during dodge/push at 15/30/60 FPS, even released before recovery ends',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),binding=source.slice(source.indexOf('  let lastPointerAttack'),source.indexOf('  const releaseAttack'));
 for(const kind of ['dodge','shieldPush'])for(const fps of [15,30,60])for(const releaseEarly of [false,true,'lost-capture']){
  const c=new WarriorV2Controller({durations}),{document,Event}=parseHTML('<button id="attack"></button>'),button=document.getElementById('attack'),sources=new Set();
  button.setPointerCapture=()=>{};
  const held=(id,value)=>{if(value){if(c.setAttackHeld(true)!==false)sources.add(id);}else if(sources.delete(id))c.setAttackHeld(sources.size>0);};
  const cancelSource=source.slice(source.indexOf('function cancelAttackInput('),source.indexOf('function faceHeading('));
  const cancel=new Function('attackSources','controller',cancelSource+';return cancelAttackInput;')(sources,c);
  new Function('attackButton','ready','performance','setAttackHeld','cancelAttackInput','actions',binding)(button,true,{now:()=>100},held,cancel,{attack:()=>c.attack()});
  const send=type=>{const e=new Event(type);Object.assign(e,{pointerId:7,button:0});button.dispatchEvent(e);};
  c[kind]();send('pointerdown');for(let i=0;i<Math.ceil(.46*fps);i++)c.update(1/fps);
  assert.equal(c.chargeProgress,1);
  if(releaseEarly){if(releaseEarly!=='lost-capture')send('pointerup');send('lostpointercapture');}
  for(let i=0;i<4*fps&&c.action?.state!== 'judgment';i++)c.update(1/fps);
  assert.equal(c.action?.state,'judgment',`${kind}/${fps}/${releaseEarly}`);assert.equal(c.serial,2);
  send('pointerup');send('lostpointercapture');assert.equal(c.action.state,'judgment');
 }
});

test('early lost HUD capture cannot turn a partial charge into a tap, and global focus loss clears a retained heavy',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),body=source.slice(source.indexOf('function cancelAttackInput('),source.indexOf('function faceHeading('));
 for(const time of [.2,.5]){
  const c=new WarriorV2Controller({durations}),sources=new Set(['button:7']),cancel=new Function('attackSources','controller',body+';return cancelAttackInput;')(sources,c);
  c.shieldPush();c.setAttackHeld(true);c.update(time);cancel('button:7',{preserveCompletedCharge:true});
  assert.equal(c.held,false);assert.equal(c.queuedAttack,time===.5?'judgment':null);
  cancel();assert.equal(c.queuedAttack,null);c.update(3);assert.equal(c.action,null);
 }
});

test('ordinary shield recovery hit retains completed heavy charge; forced hits and focus cancellation still clear it',()=>{
 for(const reason of ['normal','forced','blocked','focus']){
  const c=new WarriorV2Controller({durations});c.shieldPush();c.setAttackHeld(true);c.update(.5);assert.equal(c.queuedAttack,'judgment');
  if(reason==='focus')c.cancelAttackInput();else c.hit(.2,{force:reason==='forced',reason:reason==='blocked'?'blocked':undefined});
  if(reason==='normal'){assert.equal(c.queuedAttack,'judgment');c.update(.21);assert.equal(c.action.state,'judgment');}
  else assert.equal(c.queuedAttack,null);
 }
});

test('casting body core stays reachable without giving distant/non-casting/goblin automatic hits',()=>{
 const e={kind:'elena',radius:1.5,sizeScale:4.5/1.6,actor:{position:new Vector3(4,6,8)},brain:{mode:'attack'}};
 const capsule=BossEncounter.prototype.skillHurtCapsule.call(e);assert.equal(capsule.radius,.48);assert.deepEqual(capsule.points,[[4,6.48,8],[4,7.55,8]]);
 e.actor.position.x=7;assert.strictEqual(BossEncounter.prototype.skillHurtCapsule.call(e),capsule);assert.equal(capsule.points[0][0],7);
 for(const mode of ['idle','dead','guard','evade']){e.brain.mode=mode;assert.equal(BossEncounter.prototype.skillHurtCapsule.call(e),null);}
 e.brain.mode='attack';e.kind='goblin';assert.equal(BossEncounter.prototype.skillHurtCapsule.call(e),null);
});

test('shadow warmup restores main render pass before yielding and on exceptions, and never registers hidden casters',async()=>{
 for(const fail of [false,true]){
  const engine={currentRenderPassId:3},sub={},mesh={visibility:1,getTotalVertices:()=>3,getScene:()=>({getEngine:()=>engine}),subMeshes:[sub],material:{metadata:{moonforestMonsterToon:true},isReady:()=>true,needAlphaBlendingForMesh:()=>false}},seen=[];
  const shadows={getShadowMap:()=>({renderPassId:77}),isReady(s,instances,alpha){assert.equal(engine.currentRenderPassId,77);assert.equal(s,sub);assert.equal(instances,false);assert.equal(alpha,false);seen.push(1);if(fail)throw Error('shadow failed');return true;},addShadowCaster(){assert.fail('hidden actor must not be registered');}};
  const pending=prepareBossShaders({meshes:[mesh]},{shadows,frame:async()=>assert.equal(engine.currentRenderPassId,3)});
  if(fail)await assert.rejects(pending,/shadow failed/);else await pending;
  assert.equal(engine.currentRenderPassId,3);assert.equal(seen.length,1);assert.equal(mesh.visibility,1);
 }
});

test('long current-frame work is captured immediately even before it causes the next delayed interval',()=>{
 const m=new FrameDiagnostics();m.begin(0,30);m.end(4);m.begin(33,30);m.end(243,()=>({activity:'death',contactsMs:2}));
 assert.equal(m.events.length,1);assert.equal(m.events[0].trigger,'current-work');assert.equal(m.events[0].jsSubmitMs,210);assert.equal(m.events[0].frameMs,33);
 m.begin(250,30);m.end(260,()=>({activity:'idle'}));assert.equal(m.events[1].trigger,'interval');assert.equal(m.events[1].jsSubmitMs,10);
});
