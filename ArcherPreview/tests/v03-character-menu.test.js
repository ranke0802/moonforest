import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {ArcRotateCamera,Color3,MeshBuilder,NullEngine,Scene,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';
import en from '../src/v03/locales/en.js';
import {equipmentStats} from '../src/equipment-stats.js';
import {characterItems,bagContents,combatSkills} from '../src/v03/character-menu-data.js';
import {createCharacterPortrait} from '../src/v03/character-menu-camera.js';
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
  assert.equal(root.querySelector('.mf-menu-gear'),null);
  menu.show('Inventory');assert.ok(root.querySelectorAll('.mf-menu-empty').length<6);
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
test('the equipment portrait submits only the owned warrior and never advances scene observers, including on a failed draw',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const camera=new ArcRotateCamera('play',.6,1.1,11,new Vector3(2,1,5),scene);
  const actor=new TransformNode('warrior',scene);actor.position.set(5,0,9);actor.rotation.y=.4;
  const body=MeshBuilder.CreateBox('equipped body',{},scene);body.parent=actor;
  body.material=new StandardMaterial('skin',scene);body.material.diffuseColor=Color3.White();
  const enemy=MeshBuilder.CreateSphere('wolf',{},scene);
  const effect=MeshBuilder.CreateBox('spell effect',{},scene);effect.parent=actor;
  const rendered=[];let ticks=0,clears=0,clip=null;
  // NullEngine has no GL context; instrument the actual Babylon render path.
  engine.enableScissor=(...args)=>{clip=args;};engine.disableScissor=()=>{};
  engine.clear=(color,back,depth,stencil)=>{if(back&&color?.r===0&&color?.g===0&&color?.b===0&&color.a===1&&depth&&stencil)clears++;};
  for(const mesh of [body,enemy,effect])mesh.onBeforeDrawObservable.add(()=>rendered.push(mesh.name));
  scene.onBeforeRenderObservable.add(()=>ticks++);
  scene.render();await scene.whenReadyAsync();rendered.length=0;ticks=0;
  camera.targetScreenOffset.set(.2,-.1);
  const portrait=createCharacterPortrait(scene),rect={left:0,top:0,width:800,height:500};
  const options={camera,actor,meshes:[body],height:1.6,canvasRect:rect,frameRect:{left:250,top:40,width:300,height:400}};
  let drawn=false;
  for(let i=0;i<12&&!drawn;i++){drawn=portrait.draw(options);if(!drawn)await new Promise(r=>setTimeout(r,16));}
  assert.equal(drawn,true);assert.deepEqual(rendered,['equipped body']);assert.equal(ticks,0);assert.ok(clears>0);assert.ok(clip[2]>0);
  assert.deepEqual(camera.target.asArray(),[2,1,5]);assert.deepEqual(camera.targetScreenOffset.asArray(),[.2,-.1]);
  body.onBeforeDrawObservable.add(()=>{throw Error('context lost');});
  assert.throws(()=>portrait.draw(options),/context lost/);
  assert.deepEqual([camera.alpha,camera.beta,camera.radius],[.6,1.1,11]);
  portrait.dispose();assert.equal(portrait.draw(options),false);
 }finally{scene.dispose();engine.dispose();}
});
