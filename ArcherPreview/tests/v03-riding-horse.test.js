import test from 'node:test';
import assert from 'node:assert/strict';
import {createRidingHorse} from '../src/v03/riding-horse.js';

function harness({delay=false}={}) {
  const handlers = new Map();
  const button = {dataset:{},setAttribute(){},addEventListener(name,fn){handlers.set(name,fn);},remove(){}};
  const doc = {createElement:()=>button,querySelector:()=>null,addEventListener(){},removeEventListener(){}};
  const slot = new Map();
  const storage = {getItem:key=>slot.get(key),setItem:(key,value)=>slot.set(key,value)};
  const world = {mapId:'great-plains',terrain:{heightAt:()=>0}};
  const saddle = {position:{y:0},isDisposed:()=>false};
  const actor = {position:{x:1,z:2},rotation:{y:0},metadata:{saddleOffset:saddle},getChildMeshes:()=>[]};
  let wallet = true, disposeCount=0, loads=0, finish;
  const clips=[];
  const stable=createRidingHorse({root:{ownerDocument:doc,querySelector:()=>({append(){}})},world,player:()=>actor,
    storage,ridingAllowed:()=>wallet,forwardYaw:()=>0,tell(){},
    pose:()=>({ready:true,hips:{},hipsAbove:()=>1+saddle.position.y,apply(){}}),
    makeHorse:()=>{loads++;return {ready:delay?new Promise(r=>{finish=r;}):Promise.resolve({}),play:c=>clips.push(c),
      speed(){},place(){},dispose(){disposeCount++;}};}});
  return {stable,button,clips,world,slot,saddle,click:()=>handlers.get('click')(),finish:()=>finish({}),
    combat:()=>{wallet=false;},loads:()=>loads,disposed:()=>disposeCount};
}
test('the driver grants the horse to the current save; only mounting loads the model',async()=>{
  const h=harness();h.stable.updateAvailability();assert.equal(h.button.hidden,true);
  h.stable.offer();h.stable.updateAvailability();assert.equal(h.button.hidden,false);assert.equal(h.loads(),0);
  await h.click();assert.equal(h.stable.active,true);assert.equal(h.loads(),1);
  h.stable.afterMove({state:'run'},5);assert.deepEqual(h.clips,['Horse_Idle','Horse_Gallop']);
  assert.ok(Math.abs(h.saddle.position.y-.608)<1e-6);
  h.combat();h.stable.updateAvailability();assert.equal(h.stable.active,false);assert.equal(h.saddle.position.y,0);
  h.slot.clear();h.stable.reload();assert.equal(h.button.hidden,true);assert.equal(h.disposed(),1);
});
test('late horse imports cannot survive a map departure or reattach a rider',async()=>{
  const h=harness({delay:true});h.stable.offer();h.stable.updateAvailability();
  const loading=h.click();h.world.mapId='village';h.stable.updateAvailability();h.finish();await loading;
  assert.equal(h.stable.active,false);assert.equal(h.disposed(),1);assert.deepEqual(h.clips,[]);
  h.world.mapId='witch-cave';h.stable.updateAvailability();assert.equal(h.button.hidden,true);
});
