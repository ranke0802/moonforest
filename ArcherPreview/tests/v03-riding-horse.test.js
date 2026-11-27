import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {ridingLabels} from '../src/v03/riding-locale.js';
import {createInteractButton} from '../src/v03/interact-button.js';
import {arrangeTopActions} from '../src/hud-top-actions.js';
import {BossEncounter} from '../src/boss-encounter.js';

function harness({delay=false}={}) {
  const {document:doc}=parseHTML('<html lang="en"><body><main id="app"><div class="top-actions"><button data-chapter="bag"></button><button id="motion-speed-toggle"></button></div><button id="attack-button" title="Attack" aria-label="Attack"></button><button id="guard-button" title="Shield push (F)" aria-label="Shield push" aria-pressed="false"></button></main></body></html>');
  const root=doc.getElementById('app'),attack=doc.getElementById('attack-button');
  const slot = new Map();
  const storage = {getItem:key=>slot.get(key),setItem:(key,value)=>slot.set(key,value)};
  const world = {mapId:'great-plains',terrain:{heightAt:()=>0}};
  const saddle = {position:new Vector3(),rotation:new Vector3(),parent:{computeWorldMatrix:()=>Matrix.IdentityReadOnly},isDisposed:()=>false};
  const actor = {position:{x:1,z:2},rotation:{y:0},metadata:{saddleOffset:saddle},getChildMeshes:()=>[]};
  let paused=false, alive=true, disposeCount=0, loads=0, scans=0, finish;
  const clips=[],notices=[];
  const stable=createRidingHorse({root,world,player:()=>actor,
    storage,ridingAllowed:arrival=>{scans++;return arrival||!paused;},riderAlive:()=>alive,forwardYaw:()=>0,tell:text=>notices.push(text),
    pose:()=>({ready:true,hips:{computeWorldMatrix(){},get absolutePosition(){return new Vector3(0,1+saddle.position.y,0);}},apply(){}}),
    makeHorse:()=>{loads++;return {ready:delay?new Promise(r=>{finish=r;}):Promise.resolve({}),play:c=>clips.push(c),
      saddleContactToRef(v){v.set(0,1.48,0);return true;},speed(){},place(){},dispose(){disposeCount++;}};}});
  const button=root.querySelector('.v03-ride-toggle');
  const advance=()=>{
    for(let frames=0;frames<250&&['approaching','mounting','dismounting','departing'].includes(stable.inspect().state);frames++)
      stable.afterMove({state:'idle'},0,1/30);
  };
  const click=async()=>{await button.onclick();advance();};
  return {stable,button,root,attack,doc,clips,notices,world,slot,saddle,click,advance,finish:()=>finish({}),
    combat:()=>{world.combatCount=1;},pause:value=>{paused=value;},die:()=>{alive=false;},scans:()=>scans,loads:()=>loads,disposed:()=>disposeCount};
}
test('the driver grants the horse to the current save; only mounting loads the model',async()=>{
  const h=harness();h.stable.updateAvailability();assert.equal(h.button.hidden,true);
  h.stable.offer();h.stable.updateAvailability();assert.equal(h.button.hidden,false);assert.equal(h.loads(),0);
  await h.click();assert.equal(h.stable.active,true);assert.equal(h.loads(),1);
  h.stable.afterMove({state:'run'},5);assert.deepEqual(h.clips.slice(-2),['Horse_Idle','Horse_Gallop']);
  assert.deepEqual(h.stable.inspect(),{state:'mounted',mounts:1,gait:'Horse_Gallop'});
  assert.ok(Math.abs(h.saddle.position.y-.76)<1e-6);
  h.combat();h.stable.updateAvailability();assert.equal(h.stable.active,true);assert.equal(h.button.hidden,false);
  h.slot.clear();h.stable.reload();assert.equal(h.button.hidden,true);assert.equal(h.disposed(),1);
});
test('dialogue, notices, combat reactions and enemy attack attempts keep the same horse until a hit costs HP',async()=>{
  const h=harness(),ride=h.stable;ride.offer();ride.updateAvailability();await h.click();
  h.pause(true);ride.updateAvailability();ride.afterMove({state:'idle'},0);ride.dismount();
  assert.ok(ride.active);assert.ok(h.button.hidden);assert.equal(ride.startGallop(),false);
  h.pause(false);h.combat();ride.updateAvailability();assert.equal(h.button.hidden,false);
  const foe=new BossEncounter({},()=>{});foe.active=true;foe.player={position:Vector3.Zero()};foe.brain={parry(){}};
  foe.combat.onPlayerDamaged=ride.playerDamaged;
  foe.receiveBossHit({damage:15,bodyContact:false});
  foe.receiveBossHit({damage:15,bodyContact:true,action:{state:'dodge',actionId:7}});
  foe.receiveBossHit({damage:15,shieldContact:true});
  foe.hitPlayer(0);foe.hitPlayer(15); // Still in the repeat-hit cooldown.
  for(const state of ['dodge','shieldPush','hit','knockdown'])ride.afterMove({state},0);
  assert.equal(foe.playerHp,500);assert.ok(ride.active);assert.equal(h.loads(),1);assert.equal(h.disposed(),0);
  foe.playerInvulnerable=0;foe.receiveBossHit({damage:15,bodyContact:true});
  assert.equal(foe.playerHp,485);assert.equal(ride.active,false);assert.equal(h.saddle.position.y,0);assert.equal(h.disposed(),1);
  ride.updateAvailability();assert.equal(h.button.hidden,false);ride.dispose();
});
test('mount controls and acquisition/save/load messages follow all five game languages',async()=>{
  const h=harness();h.stable.offer();h.stable.updateAvailability();
  assert.equal(h.button.nextElementSibling.dataset.chapter,'bag');
  const guard=h.root.querySelector('#guard-button');
  for(const [lang,mount,dismount] of [['ko','말 타기','말에서 내리기'],['ja','乗馬','下馬'],['zh-Hans','上马','下马'],['vi','Lên ngựa','Xuống ngựa'],['en','Mount','Dismount']]){
    h.doc.documentElement.lang=lang;h.stable.updateAvailability();assert.equal(h.button.textContent,mount);
    const words=ridingLabels(h.doc);assert.ok(Object.values(words).every(Boolean));
    assert.equal(h.button.getAttribute('aria-label'),mount);assert.equal(h.button.getAttribute('aria-pressed'),'false');
    await h.click();assert.equal(h.button.textContent,dismount);assert.equal(h.notices.at(-1),words.mounted+' '+words.controlsHint);
    assert.equal(h.button.getAttribute('aria-label'),dismount);assert.equal(h.button.getAttribute('aria-pressed'),'true');
    assert.equal(h.attack.getAttribute('aria-label'),words.charge);assert.equal(h.attack.title,words.charge+' (J)');
    assert.equal(guard.getAttribute('aria-label'),dismount);assert.equal(guard.title,dismount+' (F)');
    assert.equal(guard.getAttribute('aria-keyshortcuts'),'F');assert.ok(!guard.hasAttribute('aria-pressed'));
    await h.click();assert.equal(h.notices.at(-1),words.dismounted);assert.equal(h.attack.title,'Attack');
    assert.equal(h.attack.getAttribute('aria-label'),'Attack');assert.equal(h.root.dataset.v03Riding,'on-foot');
    assert.equal(guard.getAttribute('aria-label'),'Shield push');assert.equal(guard.title,'Shield push (F)');
    assert.equal(guard.getAttribute('aria-pressed'),'false');assert.ok(!guard.hasAttribute('aria-keyshortcuts'));
  }
});
test('late horse imports cannot survive a map departure or reattach a rider',async()=>{
  const h=harness({delay:true});h.stable.offer();h.stable.updateAvailability();
  const loading=h.click();h.world.mapId='village';h.stable.updateAvailability();h.finish();await loading;
  assert.equal(h.stable.active,false);assert.equal(h.disposed(),1);assert.deepEqual(h.clips,[]);
  h.world.mapId='witch-cave';h.stable.updateAvailability();assert.equal(h.button.hidden,true);
});
test('a staged reset, another slot or unsafe landing cancels a carried ride',async()=>{
  const landing=()=>({x:1,y:0,z:2});
  for(const reason of ['stage','slot','unsafe','death']){
    const h=harness();h.stable.offer();h.stable.updateAvailability();await h.click();
    h.stable.beginTravel('witch-cave');h.world.mapId='witch-cave';await h.stable.finishTravel(landing);
    assert.equal(h.notices.at(-1),ridingLabels(h.doc).parked);
    if(reason==='stage')h.stable.leave();
    if(reason==='slot'){h.slot.clear();h.stable.reload();}
    h.stable.beginTravel('village');h.world.mapId='village';
    if(reason==='death')h.die();
    await h.stable.finishTravel(reason==='unsafe'?()=>({x:1,y:NaN,z:2}):landing);
    assert.equal(h.stable.active,false);assert.equal(h.saddle.position.y,0);
    h.stable.updateAvailability();assert.equal(h.loads(),reason==='unsafe'?2:1);
    h.stable.dispose();
  }
});
test('a stalled cave-return mount releases the transition, even when the old load later succeeds',async ctx=>{
  ctx.mock.timers.enable({apis:['setTimeout']});
  const h=harness({delay:true}),landing=()=>({x:1,y:0,z:2});
  h.stable.offer();h.stable.updateAvailability();
  const first=h.click();h.finish();await first;
  h.stable.beginTravel('witch-cave');h.world.mapId='witch-cave';await h.stable.finishTravel(landing);
  h.stable.beginTravel('village');h.world.mapId='village';
  const arrival=h.stable.finishTravel(landing);ctx.mock.timers.tick(4000);await arrival;h.finish();await Promise.resolve();
  assert.equal(h.stable.active,false);assert.equal(h.root.dataset.v03Riding,'on-foot');
  assert.equal(h.disposed(),2);assert.equal(h.notices.at(-1),ridingLabels(h.doc).loadError);
  h.stable.dispose();
});
test('touch interaction and a late bag button survive mounting, cancellation and dismounting',async()=>{
  const h=harness({delay:true});
  h.root.dataset.hudInput='touch';
  const bag=h.root.querySelector('[data-chapter="bag"]');
  bag.remove();h.root.querySelector('.top-actions').append(bag);arrangeTopActions(h.root);
  assert.equal(bag.previousElementSibling,h.button);
  const interact=createInteractButton({doc:h.doc});
  try{
    interact.sync({act:'talk',action:'Talk',label:'Talk to driver'});
    h.stable.offer();h.stable.updateAvailability();
    const pending=h.click();
    assert.equal(h.root.dataset.v03Riding,'loading');assert.equal(h.button.getAttribute('aria-label'),'Cancel horse loading');
    h.button.click();h.finish();await pending;
    assert.equal(h.root.dataset.v03Riding,'on-foot');assert.equal(h.attack.getAttribute('aria-label'),'Talk to driver');
    h.button.click();h.finish();await Promise.resolve();h.advance();
    assert.equal(h.stable.active,true);assert.equal(interact.active,false);assert.equal(h.attack.getAttribute('aria-label'),'Gallop charge');
    h.button.click();h.advance();
    assert.equal(h.stable.active,false);assert.equal(interact.active,true);assert.equal(h.attack.getAttribute('aria-label'),'Talk to driver');
    interact.sync(null);assert.equal(h.attack.getAttribute('aria-label'),'Attack');
  }finally{interact.dispose();h.stable.dispose();}
});
test('the mount hint samples input availability, and a new call succeeds with an alerted enemy',async()=>{
  const h=harness();
  for(let i=0;i<600;i++)h.stable.updateAvailability(100+i*1000/60);
  assert.equal(h.scans(),0);h.stable.offer();
  for(let i=0;i<600;i++)h.stable.updateAvailability(10100+i*1000/60);
  assert.ok(h.scans()>=60&&h.scans()<=67);
  assert.equal(h.loads(),0);assert.equal(h.button.hidden,false);
  h.pause(true);await h.click();assert.equal(h.loads(),0);
  h.pause(false);h.combat();await h.click();assert.equal(h.loads(),1);assert.ok(h.stable.active);
});
test('the riding URL switch skips the horse UI and does not read or write ownership',t=>{
  t.mock.method(URLSearchParams.prototype,'get',key=>key==='riding'?'0':null);
  const stable=createRidingHorse({});
  stable.reload();assert.equal(stable.offer(),false);
  stable.updateAvailability();stable.afterMove({},0);stable.leave();stable.dispose();
  assert.equal(stable.active,false);
  assert.deepEqual(stable.inspect(),{state:'disabled',mounts:0,gait:null});
});

test('a gallop launches from rest along the horse heading, steers, and returns to normal riding speed',async()=>{
  const h=harness(),ride=h.stable;
  assert.equal(ride.startGallop(),false);
  ride.offer();ride.updateAvailability();await h.click();
  assert.equal(ride.startGallop(),true);
  const neutral={x:0,y:0},cameraAngle=Math.PI/2;
  ride.steerGallop(neutral,cameraAngle,.1);
  assert.ok(Math.abs(neutral.x)<1e-8);
  assert.equal(neutral.y,-1);
  assert.ok(ride.travelSpeed(2)>3.4&&ride.travelSpeed(2)<15);
  const steer={x:1,y:0};
  ride.steerGallop(steer,cameraAngle,.15);
  assert.deepEqual(steer,{x:1,y:0});
  assert.equal(ride.travelSpeed(2),15);
  for(let i=0;i<150;i++)ride.steerGallop({x:0,y:0},0,1/60);
  assert.equal(ride.travelSpeed(2),3.4);
  ride.startGallop();ride.steerGallop(steer,0,.25);ride.stopGallop();
  assert.equal(ride.travelSpeed(2),3.4);
  ride.startGallop();h.combat();ride.updateAvailability();
  assert.ok(ride.active);assert.ok(ride.startGallop());
  ride.dismount();assert.equal(ride.inspect().state,'dismounting');h.advance();
  assert.equal(ride.active,false);assert.equal(ride.startGallop(),false);
  assert.equal(ride.travelSpeed(2),3.4);
});

test('the rider is released on landing while the departing horse still owns its scene resources',async()=>{
  const h=harness();const ride=h.stable;ride.offer();ride.updateAvailability();
  await h.button.onclick();assert.equal(ride.inspect().state,'approaching');assert.ok(ride.locksRider);
  await h.button.onclick();assert.equal(ride.inspect().state,'on-foot');assert.equal(h.disposed(),1);
  await h.button.onclick();
  const reach=state=>{
    for(let i=0;i<180&&ride.inspect().state!==state;i++)ride.afterMove({state:'idle'},0,1/30);
    assert.equal(ride.inspect().state,state);
  };
  reach('mounting');assert.equal(ride.active,false);assert.ok(h.button.disabled&&ride.blocksFirstPerson);
  await h.button.onclick();assert.equal(ride.inspect().state,'mounting');
  reach('mounted');assert.equal(ride.active,true);
  await h.button.onclick();assert.equal(ride.inspect().state,'dismounting');assert.ok(ride.locksRider);
  reach('departing');assert.equal(ride.active,false);assert.ok(!ride.locksRider&&!ride.blocksFirstPerson);
  assert.equal(h.disposed(),1);reach('on-foot');assert.equal(h.disposed(),2);assert.ok(!h.button.disabled);
});
