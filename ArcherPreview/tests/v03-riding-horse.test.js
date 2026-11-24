import test from 'node:test';
import assert from 'node:assert/strict';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {ridingLabels} from '../src/v03/riding-locale.js';

function harness({delay=false}={}) {
  const handlers = new Map();
  const button = {dataset:{},setAttribute(){},addEventListener(name,fn){handlers.set(name,fn);},remove(){}};
  const doc = {documentElement:{lang:'en'},createElement:()=>button,querySelector:()=>null,addEventListener(){},removeEventListener(){}};
  const slot = new Map();
  const storage = {getItem:key=>slot.get(key),setItem:(key,value)=>slot.set(key,value)};
  const world = {mapId:'great-plains',terrain:{heightAt:()=>0}};
  const saddle = {position:new Vector3(),rotation:new Vector3(),parent:{computeWorldMatrix:()=>Matrix.IdentityReadOnly},isDisposed:()=>false};
  const actor = {position:{x:1,z:2},rotation:{y:0},metadata:{saddleOffset:saddle},getChildMeshes:()=>[]};
  let wallet = true, disposeCount=0, loads=0, finish;
  const clips=[],notices=[];
  const stable=createRidingHorse({root:{ownerDocument:doc,querySelector:()=>({append(){}})},world,player:()=>actor,
    storage,ridingAllowed:()=>wallet,forwardYaw:()=>0,tell:text=>notices.push(text),
    pose:()=>({ready:true,hips:{computeWorldMatrix(){},get absolutePosition(){return new Vector3(0,1+saddle.position.y,0);}},apply(){}}),
    makeHorse:()=>{loads++;return {ready:delay?new Promise(r=>{finish=r;}):Promise.resolve({}),play:c=>clips.push(c),
      saddleContactToRef(v){v.set(0,1.48,0);return true;},speed(){},place(){},dispose(){disposeCount++;}};}});
  return {stable,button,doc,clips,notices,world,slot,saddle,click:()=>handlers.get('click')(),finish:()=>finish({}),
    combat:()=>{wallet=false;},loads:()=>loads,disposed:()=>disposeCount};
}
test('the driver grants the horse to the current save; only mounting loads the model',async()=>{
  const h=harness();h.stable.updateAvailability();assert.equal(h.button.hidden,true);
  h.stable.offer();h.stable.updateAvailability();assert.equal(h.button.hidden,false);assert.equal(h.loads(),0);
  await h.click();assert.equal(h.stable.active,true);assert.equal(h.loads(),1);
  h.stable.afterMove({state:'run'},5);assert.deepEqual(h.clips,['Horse_Idle','Horse_Gallop']);
  assert.ok(Math.abs(h.saddle.position.y-.76)<1e-6);
  h.combat();h.stable.updateAvailability();assert.equal(h.stable.active,false);assert.equal(h.saddle.position.y,0);
  h.slot.clear();h.stable.reload();assert.equal(h.button.hidden,true);assert.equal(h.disposed(),1);
});
test('mount controls and acquisition/save/load messages follow all five game languages',async()=>{
  const h=harness();h.stable.offer();h.stable.updateAvailability();
  for(const [lang,mount,dismount] of [['ko','승마','하마'],['ja','乗馬','下馬'],['zh-Hans','上马','下马'],['vi','Lên ngựa','Xuống ngựa'],['en','Mount','Dismount']]){
    h.doc.documentElement.lang=lang;h.stable.updateAvailability();assert.equal(h.button.textContent,mount);
    const words=ridingLabels(h.doc);assert.equal(Object.keys(words).length,10);assert.ok(Object.values(words).every(Boolean));
    await h.click();assert.equal(h.button.textContent,dismount);assert.equal(h.notices.at(-1),words.mounted);
    await h.click();assert.equal(h.notices.at(-1),words.dismounted);
  }
});
test('late horse imports cannot survive a map departure or reattach a rider',async()=>{
  const h=harness({delay:true});h.stable.offer();h.stable.updateAvailability();
  const loading=h.click();h.world.mapId='village';h.stable.updateAvailability();h.finish();await loading;
  assert.equal(h.stable.active,false);assert.equal(h.disposed(),1);assert.deepEqual(h.clips,[]);
  h.world.mapId='witch-cave';h.stable.updateAvailability();assert.equal(h.button.hidden,true);
});
