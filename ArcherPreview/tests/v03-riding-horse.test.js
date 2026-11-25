import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {ridingLabels} from '../src/v03/riding-locale.js';
import {createInteractButton} from '../src/v03/interact-button.js';
import {arrangeTopActions} from '../src/hud-top-actions.js';

function harness({delay=false}={}) {
  const {document:doc}=parseHTML('<html lang="en"><body><main id="app"><div class="top-actions"><button data-chapter="bag"></button><button id="motion-speed-toggle"></button></div><button id="attack-button" title="Attack" aria-label="Attack"></button></main></body></html>');
  const root=doc.getElementById('app'),attack=doc.getElementById('attack-button');
  const slot = new Map();
  const storage = {getItem:key=>slot.get(key),setItem:(key,value)=>slot.set(key,value)};
  const world = {mapId:'great-plains',terrain:{heightAt:()=>0}};
  const saddle = {position:new Vector3(),rotation:new Vector3(),parent:{computeWorldMatrix:()=>Matrix.IdentityReadOnly},isDisposed:()=>false};
  const actor = {position:{x:1,z:2},rotation:{y:0},metadata:{saddleOffset:saddle},getChildMeshes:()=>[]};
  let wallet = true, disposeCount=0, loads=0, scans=0, finish;
  const clips=[],notices=[];
  const stable=createRidingHorse({root,world,player:()=>actor,
    storage,ridingAllowed:()=>{scans++;return wallet;},forwardYaw:()=>0,tell:text=>notices.push(text),
    pose:()=>({ready:true,hips:{computeWorldMatrix(){},get absolutePosition(){return new Vector3(0,1+saddle.position.y,0);}},apply(){}}),
    makeHorse:()=>{loads++;return {ready:delay?new Promise(r=>{finish=r;}):Promise.resolve({}),play:c=>clips.push(c),
      saddleContactToRef(v){v.set(0,1.48,0);return true;},speed(){},place(){},dispose(){disposeCount++;}};}});
  const button=root.querySelector('.v03-ride-toggle');
  return {stable,button,root,attack,doc,clips,notices,world,slot,saddle,click:()=>button.onclick(),finish:()=>finish({}),
    combat:()=>{wallet=false;},scans:()=>scans,loads:()=>loads,disposed:()=>disposeCount};
}
test('the driver grants the horse to the current save; only mounting loads the model',async()=>{
  const h=harness();h.stable.updateAvailability();assert.equal(h.button.hidden,true);
  h.stable.offer();h.stable.updateAvailability();assert.equal(h.button.hidden,false);assert.equal(h.loads(),0);
  await h.click();assert.equal(h.stable.active,true);assert.equal(h.loads(),1);
  h.stable.afterMove({state:'run'},5);assert.deepEqual(h.clips,['Horse_Idle','Horse_Gallop']);
  assert.deepEqual(h.stable.inspect(),{state:'mounted',mounts:1,gait:'Horse_Gallop'});
  assert.ok(Math.abs(h.saddle.position.y-.76)<1e-6);
  h.combat();h.stable.updateAvailability();assert.equal(h.stable.active,false);assert.equal(h.saddle.position.y,0);
  h.slot.clear();h.stable.reload();assert.equal(h.button.hidden,true);assert.equal(h.disposed(),1);
});
test('mount controls and acquisition/save/load messages follow all five game languages',async()=>{
  const h=harness();h.stable.offer();h.stable.updateAvailability();
  assert.equal(h.button.nextElementSibling.dataset.chapter,'bag');
  for(const [lang,mount,dismount] of [['ko','말 타기','말에서 내리기'],['ja','乗馬','下馬'],['zh-Hans','上马','下马'],['vi','Lên ngựa','Xuống ngựa'],['en','Mount','Dismount']]){
    h.doc.documentElement.lang=lang;h.stable.updateAvailability();assert.equal(h.button.textContent,mount);
    const words=ridingLabels(h.doc);assert.ok(Object.values(words).every(Boolean));
    assert.equal(h.button.getAttribute('aria-label'),mount);assert.equal(h.button.getAttribute('aria-pressed'),'false');
    await h.click();assert.equal(h.button.textContent,dismount);assert.equal(h.notices.at(-1),words.mounted);
    assert.equal(h.button.getAttribute('aria-label'),dismount);assert.equal(h.button.getAttribute('aria-pressed'),'true');
    assert.equal(h.attack.getAttribute('aria-label'),words.gallop);assert.equal(h.attack.title,words.gallop);
    await h.click();assert.equal(h.notices.at(-1),words.dismounted);assert.equal(h.attack.title,'Attack');
    assert.equal(h.attack.getAttribute('aria-label'),'Attack');assert.equal(h.root.dataset.v03Riding,'on-foot');
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
  for(const reason of ['stage','slot','unsafe','combat']){
    const h=harness();h.stable.offer();h.stable.updateAvailability();await h.click();
    h.stable.beginTravel('witch-cave');h.world.mapId='witch-cave';await h.stable.finishTravel(landing);
    assert.equal(h.notices.at(-1),ridingLabels(h.doc).parked);
    if(reason==='stage')h.stable.leave();
    if(reason==='slot'){h.slot.clear();h.stable.reload();}
    h.stable.beginTravel('village');h.world.mapId='village';
    if(reason==='combat')h.combat();
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
    h.button.click();h.finish();await Promise.resolve();
    assert.equal(h.stable.active,true);assert.equal(interact.active,false);assert.equal(h.attack.getAttribute('aria-label'),'Gallop');
    h.button.click();
    assert.equal(h.stable.active,false);assert.equal(interact.active,true);assert.equal(h.attack.getAttribute('aria-label'),'Talk to driver');
    interact.sync(null);assert.equal(h.attack.getAttribute('aria-label'),'Attack');
  }finally{interact.dispose();h.stable.dispose();}
});
test('on foot the mount hint samples combat without per-frame scans and clicks still check immediately',async()=>{
  const h=harness();
  for(let i=0;i<600;i++)h.stable.updateAvailability(100+i*1000/60);
  assert.equal(h.scans(),0);h.stable.offer();
  for(let i=0;i<600;i++)h.stable.updateAvailability(10100+i*1000/60);
  assert.ok(h.scans()>=60&&h.scans()<=67);
  assert.equal(h.loads(),0);assert.equal(h.button.hidden,false);
  h.combat();await h.click();assert.equal(h.loads(),0);assert.equal(h.stable.active,false);
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
  assert.ok(ride.travelSpeed(2)>3.4&&ride.travelSpeed(2)<14);
  const steer={x:1,y:0};
  ride.steerGallop(steer,cameraAngle,.15);
  assert.deepEqual(steer,{x:1,y:0});
  assert.equal(ride.travelSpeed(2),14);
  for(let i=0;i<150;i++)ride.steerGallop({x:0,y:0},0,1/60);
  assert.equal(ride.travelSpeed(2),3.4);
  ride.startGallop();ride.steerGallop(steer,0,.25);ride.stopGallop();
  assert.equal(ride.travelSpeed(2),3.4);
  ride.startGallop();h.combat();ride.updateAvailability();
  assert.equal(ride.active,false);assert.equal(ride.startGallop(),false);
  assert.equal(ride.travelSpeed(2),3.4);
});
