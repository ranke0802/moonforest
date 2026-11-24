import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {ArcRotateCamera,NullEngine,Scene,Vector3} from '@babylonjs/core';
import en from '../src/v03/locales/en.js';
import {equipmentStats} from '../src/equipment-stats.js';
import {characterItems,bagContents,combatSkills} from '../src/v03/character-menu-data.js';
import {drawCharacterPose} from '../src/v03/character-menu-camera.js';
import {createCharacterMenu} from '../src/v03/character-menu.js';

test('all three menu pages use the same modal, and picking an item changes the actual loadout',async()=>{
  const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
  const root=document.getElementById('app');
  window.ResizeObserver=class{observe(){}disconnect(){}};
  window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
  const state={equipment:{sword:'original',shield:'original'},hp:320,maxHp:500,stamina:100,maxStamina:100,attackBonus:5,defense:2,armorDefense:0,potions:2,gold:65,canUsePotion:true,touch:true,allows:()=>true};
  let updates=0,uses=0;
  const menu=createCharacterMenu({root,read:()=>state,subject:()=>null,onPause:()=>updates++,usePotion:()=>uses++,
    equip:(slot,id)=>{state.equipment[slot]=id;}});
  const dialog=root.querySelector('dialog');
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
  menu.show('Status');assert.equal(updates,1);assert.equal(root.querySelectorAll('.mf-menu-slots>*').length,8);
  menu.show('Inventory');assert.equal(root.querySelectorAll('.mf-menu-grid>*').length,30);
  const named=(host,text)=>[...host.querySelectorAll('button')].find(n=>n.textContent===text);
  root.querySelector('[aria-label="Soldier’s Sword"]').click();named(root,'Equip').click();
  assert.equal(state.equipment.sword,'soldier-sword');
  menu.show('Skills');await import('../src/v03/locales/en.js');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.querySelectorAll('.mf-menu-skills dt').length,7);
  menu.show('Inventory');named(root,'Supplies').click();named(root,'Use potion').click();
  assert.equal(uses,1);assert.equal(updates,2);assert.equal(menu.open,false);
  menu.dispose();assert.equal(root.querySelector('dialog'),null);
});

test('bag and equipment reflect the active loadout, quest armor and potion charges',()=>{
 const state={equipment:{sword:'soldier-sword',shield:'teal-bronze'},potions:2,armorDefense:2};
 const rows=characterItems(state);
 assert.deepEqual(rows.filter(row=>row.worn).map(row=>row.id),['sword/soldier-sword','shield/teal-bronze','armor/leather']);
 const compare=rows.find(row=>row.id==='sword/violet-silver');
 assert.equal(compare.delta,compare.value-equipmentStats(state.equipment).attackBonus);
 assert.equal(bagContents(rows,'Supplies','Name')[0].quantity,2);
 assert.deepEqual(bagContents(rows,'Gear','Name').map(row=>row.name),rows.filter(row=>row.type==='Gear').map(row=>row.name).sort((a,b)=>a.localeCompare(b,'en')));
 const fresh=characterItems({...state,armorDefense:0,potions:0});
 assert.ok(!fresh.some(row=>row.id==='armor/leather'||row.id==='potion'));
});
test('skills use current input mode and actual tutorial locks',()=>{
 const touch=combatSkills(en,true,kind=>kind==='guard');
 assert.equal(touch.find(row=>row.name==='Shield shove').available,true);
 assert.equal(touch.find(row=>row.name==='Heavy attack').available,false);
 assert.equal(touch.find(row=>row.name==='Heavy attack').control,en.story.hints.heavy.touch);
 const desktop=combatSkills(en,false,()=>true);
 assert.equal(desktop.find(row=>row.name==='Sprint').control,en.story.tips.sprint.keys);
 assert.ok(desktop.every(row=>row.available&&!/[가-힣]/.test(row.name+row.control)));
});
test('inspection renders one view and restores the live camera even if drawing fails',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const target=new Vector3(2,1,5),camera=new ArcRotateCamera('play',.6,1.1,11,target,scene);
  const actor={position:new Vector3(5,0,9),rotation:{y:.4}};
  camera.targetScreenOffset.set(.2,-.1);
  const rect={left:0,top:0,width:800,height:500};
  let draws=0;
  const original=scene.render.bind(scene);
  scene.render=(update,ignore)=>{draws++;assert.equal(update,false);assert.equal(ignore,true);assert.notEqual(camera.radius,11);original(update,ignore);};
  const options={scene,camera,actor,height:1.6,canvasRect:rect,frameRect:rect};
  drawCharacterPose(options);
  assert.equal(draws,1);assert.deepEqual(camera.target.asArray(),[2,1,5]);assert.deepEqual(camera.targetScreenOffset.asArray(),[.2,-.1]);
  scene.render=()=>{throw Error('context lost');};
  assert.throws(()=>drawCharacterPose(options),/context lost/);
  assert.deepEqual([camera.alpha,camera.beta,camera.radius],[.6,1.1,11]);
 }finally{scene.dispose();engine.dispose();}
});
