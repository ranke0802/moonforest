import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {mountMenuLabels} from '../src/v03/character-mount-locale.js';
import {createRidingWardrobe} from '../src/v03/riding-wardrobe.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {createWagonHorse} from '../src/v03/wagon-horse.js';
import {parseHTML} from 'linkedom';
import {ArcRotateCamera,Color3,MeshBuilder,NullEngine,RawTexture,Scene,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';
import en from '../src/v03/locales/en.js';
import ko from '../src/v03/locales/ko.js';
import {t,setPack,cloneChapter,localizeChapter} from '../src/v03/i18n.js';
import {COMBAT_HINTS,TIPS} from '../src/v03/data/chapter1.js';
import {equipmentStats} from '../src/equipment-stats.js';
import {PlaygroundInput} from '../src/input.js';
import {characterItems,bagContents,combatSkills,SKILL_BRANCHES,SKILL_COLUMNS,SKILL_OPEN,SKILL_TREE} from '../src/v03/character-menu-data.js';
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
  root.querySelector(`[aria-label="${t('char.gear.sword.soldier-sword')}"]`).click();named(root,t('char.equip')).click();
  assert.equal(state.equipment.sword,'soldier-sword');
  menu.show('Skills');
  assert.equal(root.querySelectorAll('.mf-skill-node:not(.is-open)').length,7);
  menu.show('Inventory');named(root,t('char.type.Supplies')).click();named(root,t('char.usePotion')).click();
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
 assert.deepEqual(bagContents(rows,'Gear','Name','ko').map(row=>row.name),rows.filter(row=>row.type==='Gear').map(row=>row.name).sort((a,b)=>a.localeCompare(b,'ko')));
 const fresh=characterItems({...state,armorDefense:0,potions:0});
 assert.ok(!fresh.some(row=>row.id==='armor/leather'||row.id==='potion'));
});
test('skills use current input mode, actual tutorial locks and the chosen language',()=>{
 const source={COMBAT_HINTS,TIPS},lessons=()=>localizeChapter(cloneChapter(source),source);
 try{
  setPack('en',en);
  const touch=combatSkills(lessons(),true,kind=>kind==='guard');
  assert.equal(touch.find(row=>row.id==='push').name,'Shield shove');assert.equal(touch.find(row=>row.id==='push').available,true);
  assert.equal(touch.find(row=>row.id==='heavy').available,false);
  assert.equal(touch.find(row=>row.id==='heavy').control,en.story.hints.heavy.touch);
  const desktop=combatSkills(lessons(),false,()=>true);
  assert.equal(desktop.find(row=>row.id==='sprint').control,en.story.tips.sprint.keys);
  assert.equal(desktop.find(row=>row.id==='justGuard').control,en.ui['char.skill.justGuardKeys']);
  assert.equal(touch.find(row=>row.id==='justGuard').control,en.ui['char.skill.justGuardTouch']);
  assert.ok(desktop.every(row=>row.available&&row.text&&!/[가-힣]/.test(row.name+row.control+row.text+row.touch)));
  setPack('ko',ko);
  const korean=combatSkills(lessons(),true,()=>true);
  assert.equal(korean.find(row=>row.id==='heavy').control,COMBAT_HINTS.find(row=>row.id==='heavy').touch);
  assert.ok(korean.every(row=>/[가-힣]/.test(row.name)&&!/[A-Za-z]{3,}/.test(row.name)));
 }finally{setPack('ko',ko);}
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

test('status mouse and touch orbit match the gameplay camera in the rendered portrait',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 scene.useRightHandedSystem=true;
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
 const root=document.querySelector('main'),rect={left:0,top:0,width:800,height:500};
 let frame=null,sample=null,menu;
 window.ResizeObserver=class{observe(){}disconnect(){}};
 window.requestAnimationFrame=callback=>{frame=callback;return 1;};
 window.cancelAnimationFrame=()=>{frame=null;};
 engine.enableScissor=engine.disableScissor=()=>{};
 function flush(){const callback=frame;frame=null;callback?.();}
 try{
  const camera=new ArcRotateCamera('world',.6,1.1,11,Vector3.Zero(),scene);
  camera.lowerBetaLimit=.4;camera.upperBetaLimit=1.75;
  const actor=new TransformNode('warrior',scene);actor.rotation.y=.35;
  const body=MeshBuilder.CreateBox('equipped body',{},scene);body.parent=actor;
  body.material=new StandardMaterial('skin',scene);
  scene.render();await scene.whenReadyAsync();
  body.onBeforeDrawObservable.add(()=>{sample={alpha:camera.alpha,beta:camera.beta,radius:camera.radius};});
  menu=createCharacterMenu({root,onPause(){},read:()=>({equipment:{},gold:0,potions:0}),
   subject:()=>({camera,scene,actor,meshes:[body],height:1.6,canvasRect:rect})});
  const dialog=root.querySelector('dialog');
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  menu.show('Status');
  const view=root.querySelector('.mf-menu-pose');
  view.getBoundingClientRect=()=>rect;view.setPointerCapture=()=>{};
  for(let i=0;i<8&&!sample;i++){flush();if(!sample)await new Promise(done=>setTimeout(done,105));}
  assert.ok(sample,'the initial front view renders');
  const expected={...sample,lowerBetaLimit:camera.lowerBetaLimit,upperBetaLimit:camera.upperBetaLimit};
  const drag=(dx,dy)=>PlaygroundInput.prototype.drag.call({camera:expected,callbacks:{}},dx,dy,false);
  const check=()=>{
   assert.ok(Math.abs(sample.alpha-expected.alpha)<1e-10);assert.ok(Math.abs(sample.beta-expected.beta)<1e-10);
   assert.deepEqual([camera.alpha,camera.beta,camera.radius],[.6,1.1,11]);
  };
  const pointer=(name,pointerId,pointerType,button,clientX,clientY)=>{
   view.dispatchEvent(Object.assign(new window.Event(name),{pointerId,pointerType,button,clientX,clientY}));
   flush();
  };
  pointer('pointerdown',1,'mouse',2,100,100);
  pointer('pointermove',1,'mouse',-1,180,145);drag(80,45);check();
  pointer('pointerup',1,'mouse',2,180,145);
  pointer('pointerdown',2,'touch',0,200,100);
  pointer('pointermove',2,'touch',-1,180,-300);drag(-20,-400);check();
  const radius=sample.radius;
  pointer('pointerdown',3,'touch',0,210,-300);
  pointer('pointermove',3,'touch',-1,240,-300);check();assert.ok(sample.radius<radius);
  pointer('pointercancel',3,'touch',-1,240,-300);
  pointer('pointermove',2,'touch',-1,180,200);drag(0,500);check();
  pointer('lostpointercapture',2,'touch',-1,180,200);
  pointer('pointermove',2,'touch',-1,300,0);check();
  pointer('pointerdown',1,'mouse',0,100,100);
  pointer('pointermove',1,'mouse',-1,120,90);drag(20,-10);check();
  pointer('pointerup',1,'mouse',0,120,90);
  view.dispatchEvent(Object.assign(new window.Event('keydown'),{key:'ArrowRight'}));flush();drag(36,0);check();
 }finally{menu?.dispose();scene.dispose();engine.dispose();}
});

test('the skill page is a left-to-right tree: three branches, a line per prerequisite, the picked skill in detail',()=>{
 // The layout itself: every skill and open slot in its own cell, inside the grid, and
 // each skill to the right of (or under) the one it builds on, on its own branch.
 const rows=SKILL_BRANCHES.length*2,cells=new Set(),byId=new Map(SKILL_TREE.map(node=>[node.id,node]));
 for(const [row,col] of [...SKILL_TREE.map(node=>[node.row,node.col]),...SKILL_OPEN]){
  assert.ok(row>=1&&row<=rows&&col>=1&&col<=SKILL_COLUMNS,`${row}/${col} inside the grid`);
  assert.ok(!cells.has(row+'/'+col),`${row}/${col} used once`);cells.add(row+'/'+col);
 }
 for(const node of SKILL_TREE){
  assert.equal(SKILL_BRANCHES.indexOf(node.branch),Math.floor((node.row-1)/2),node.id+' sits in its branch rows');
  for(const id of node.need){
   const from=byId.get(id);assert.ok(from,id+' exists');assert.equal(from.branch,node.branch);
   assert.ok(from.col<node.col||(from.col===node.col&&from.row<node.row),node.id+' grows right or down from '+id);
  }
 }
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
 const root=document.getElementById('app');
 window.ResizeObserver=class{observe(){}disconnect(){}};
 window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
 const state={equipment:{sword:'original',shield:'original'},hp:1,maxHp:1,stamina:1,maxStamina:1,attackBonus:0,defense:0,armorDefense:0,potions:0,gold:0,
  canUsePotion:false,touch:true,allows:kind=>kind!=='attack'};
 const menu=createCharacterMenu({root,read:()=>state,subject:()=>null,onPause(){},usePotion(){},equip(){}});
 const dialog=root.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 try{
  menu.show('Skills');
  assert.deepEqual([...dialog.querySelectorAll('.mf-skill-branches span')].map(n=>n.textContent),SKILL_BRANCHES.map(id=>t('char.branch.'+id)));
  const nodes=[...dialog.querySelectorAll('.mf-skill-node:not(.is-open)')];
  assert.deepEqual(nodes.map(n=>n.querySelector('b').textContent),SKILL_TREE.map(node=>t('char.skill.'+node.id)));
  assert.deepEqual(nodes.filter(n=>n.classList.contains('is-locked')).map(n=>n.querySelector('b').textContent),[t('char.skill.combo'),t('char.skill.heavy')]);
  assert.equal(dialog.querySelectorAll('.mf-skill-node.is-open').length,SKILL_OPEN.length);
  const lines=[...dialog.querySelectorAll('.mf-skill-nodes>svg path')];
  assert.equal(lines.length,SKILL_TREE.reduce((sum,node)=>sum+node.need.length,0),'one line per prerequisite');
  assert.equal(lines.filter(line=>line.getAttribute('class')==='on').length,3,'only lines between usable skills are lit (guard, dodge branches)');
  // The first skill is picked; picking another shows its controls, touch first.
  assert.equal(nodes[0].getAttribute('aria-pressed'),'true');
  const heavy=COMBAT_HINTS.find(row=>row.id==='heavy');
  nodes[1].click();
  assert.equal(dialog.querySelector('.mf-skill-detail h2').textContent,t('char.skill.heavy'));
  assert.deepEqual([...dialog.querySelectorAll('.mf-skill-keys dd')].map(n=>n.textContent),[heavy.touch,heavy.keys]);
  const needs=[...dialog.querySelectorAll('.mf-skill-needs li')];
  assert.deepEqual(needs.map(n=>[n.textContent,n.className]),[[t('char.skill.needs',{name:t('char.skill.combo')}),''],[t('char.locked'),'']]);
  // A usable skill whose prerequisite is usable: the line is met, no lock line; the pick survives a re-open.
  nodes[3].click();
  assert.deepEqual([...dialog.querySelectorAll('.mf-skill-needs li')].map(n=>n.className),['is-met']);
  assert.equal(dialog.querySelector('.mf-skill-detail .mf-menu-equipped').textContent,t('char.skill.ready'));
  state.touch=false;menu.show('Inventory');menu.show('Skills');
  assert.equal(dialog.querySelector('.mf-skill-detail h2').textContent,t('char.skill.justGuard'));
  assert.equal(dialog.querySelector('.mf-skill-keys dd').textContent,t('char.skill.justGuardKeys'),'keyboard first on a desktop');
 }finally{menu.dispose();}
});

function mountMenuHarness({wardrobe,subject=()=>null}){
 const {document,window}=parseHTML('<html lang="en"><body><main></main></body></html>'),root=document.querySelector('main');
 window.ResizeObserver=class{observe(){}disconnect(){}};
 let frame=null;
 window.requestAnimationFrame=fn=>{frame=fn;return 1;};window.cancelAnimationFrame=()=>{frame=null;};
 const originalCreate=document.createElement.bind(document);
 document.createElement=(name,...options)=>{
  const el=originalCreate(name,...options);
  if(name==='dialog'){
   el.showModal=()=>{el.open=true;};el.close=()=>{el.open=false;el.dispatchEvent(new window.Event('close'));};
  }
  return el;
 };
 const menu=createCharacterMenu({root,onPause(){},read:()=>({equipment:{},gold:0}),mount:()=>wardrobe,subject});
 return {root,document,window,menu,flush(){const callback=frame;frame=null;callback?.();}};
}

test('mount ownership, cancelled loads, disposal and timeouts follow the selected tab',async t=>{
 const labels=mountMenuLabels('en'),world={owned:false,stats:{speedMultiplier:1.7,gallopSpeed:14,gallopSeconds:2.4},coat:'original'};
 const loads=[],closed=[];let released=0;
 world.preview=()=>new Promise(resolve=>loads.push(resolve));world.closePreview=()=>closed.push(loads.length);
 const {root,window,menu}=mountMenuHarness({wardrobe:world});
 const fakeTimers=new Map();let timerCount=0;
 t.mock.method(window,'setTimeout',(fn,delay)=>{const id=++timerCount;fakeTimers.set(id,{fn,delay});return id;});
 t.mock.method(window,'clearTimeout',id=>fakeTimers.delete(id));setPack('en',en);
 try{
  menu.show('Status');root.querySelectorAll('nav button')[3].click();
  assert.equal(root.querySelector('dialog').dataset.page,'Mount');assert.ok(root.textContent.includes(labels.locked));assert.equal(loads.length,0);
  world.owned=true;menu.show('Mount');assert.equal(loads.length,1);
  assert.deepEqual([...root.querySelectorAll('.mf-mount-details dd')].map(n=>n.textContent),['1.7 ×','14 m/s','2.4 s']);
  menu.show('Inventory');assert.equal(closed.length,1);menu.show('Mount');assert.equal(loads.length,2);
  loads[0]({dispose(){released++;}});await Promise.resolve();assert.equal(released,1);assert.equal(closed.length,1);
  [...fakeTimers.values()].find(row=>row.delay===12000).fn();
  assert.ok(root.textContent.includes(labels.failed));assert.equal(closed.length,2);
  root.querySelector('.mf-mount-notice button').click();assert.equal(loads.length,3);
  loads[1]({dispose(){released++;}});await Promise.resolve();assert.equal(released,2);assert.equal(closed.length,2);
  loads[2](null);await Promise.resolve();assert.equal(closed.length,3);assert.ok(root.textContent.includes(labels.failed));
  root.querySelector('.mf-mount-notice button').click();menu.close();assert.equal(closed.length,4);
  loads[3]({dispose(){released++;}});await Promise.resolve();assert.equal(released,3);assert.ok(!root.hasAttribute('data-character-portrait'));
  for(const iso of ['ko','en','ja','zh-Hans','vi']){
   const terms=mountMenuLabels(iso);assert.equal(Object.values(terms).filter(Boolean).length,28);
   assert.ok(terms.locked&&terms.tab&&terms.change&&terms.saveError&&terms.white);
  }
 }finally{menu.dispose();setPack('ko',ko);}
});

test('the live horse portrait orbits, fits a narrow frame and previews or commits a coat independently',async t=>{
 const engine=new NullEngine({renderWidth:800,renderHeight:500}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 engine.enableScissor=engine.disableScissor=()=>{};
 const camera=new ArcRotateCamera('world',.46,1.2,9,Vector3.Zero(),scene);camera.lowerBetaLimit=.45;camera.upperBetaLimit=1.65;
 // NullEngine does not complete GPU uploads for the outline's 1×1 inactive fog sampler.
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const body=MeshBuilder.CreateBox('warrior',{},scene),canvasRect={left:0,top:0,width:800,height:500};
 const viewRect={left:82,top:40,width:195,height:325};
 t.mock.method(globalThis,'fetch',async()=>new Response(readFileSync(new URL('../src/v03/models/wagon-horse-rig.glb',import.meta.url))));
 t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(_context,_texture,assign){
  const image=RawTexture.CreateRGBATexture(new Uint8Array([118,77,43,255]),1,1,this.babylonScene,false,false);
  image.getInternalTexture().isReady=true;assign(image);return Promise.resolve(image);
 });
 let failSave=false,horse=null,sample=null;const writes=[],paints=[];
 const wardrobe=createRidingWardrobe({world:{scene},owned:()=>true,storage:{getItem:()=>null,setItem(_key,value){if(failSave)throw Error('quota');writes.push(value);}},
  fieldHorse:()=>null,makeHorse(args){horse=createWagonHorse(args);const paint=horse.setCoat.bind(horse);horse.setCoat=v=>{paints.push(v);paint(v);};return horse;}});
 const {root,menu,flush,window}=mountMenuHarness({wardrobe,subject:()=>({scene,camera,actor:body,meshes:[body],height:1.6,canvasRect})});
 const labels=mountMenuLabels('en'),named=(host,label)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label);
 setPack('en',en);
 try{
  menu.show('Mount');const view=root.querySelector('.mf-menu-pose');
  view.getBoundingClientRect=()=>viewRect;view.setPointerCapture=()=>{};
  const model=await wardrobe.preview(),horseSkin=model.meshes.find(m=>m.name==='wagon_horse');assert.ok(horseSkin?.skeleton);
  await scene.whenReadyAsync();
  horseSkin.onBeforeDrawObservable.add(()=>{
   const verts=horseSkin.getPositionData(true),toScreen=scene.getTransformMatrix(),vp=camera.viewport.toGlobal(800,500);
   let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
   for(let k=0;k<verts.length;k+=3){
    const p=Vector3.Project(Vector3.FromArray(verts,k),horseSkin.getWorldMatrix(),toScreen,vp);
    xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);
   }
   sample={alpha:camera.alpha,beta:camera.beta,radius:camera.radius,xmin,xmax,ymin,ymax};
  });
  for(let i=0;i<10&&!sample;i++){flush();if(!sample)await new Promise(done=>setTimeout(done,110));}
  assert.ok(sample,'real posed horse draw');const fitted=()=>assert.ok(sample.xmin>=viewRect.left&&sample.xmax<=viewRect.left+viewRect.width&&sample.ymin>=viewRect.top&&sample.ymax<=viewRect.top+viewRect.height,
   'horse nose, tail, ears and hooves stay inside portrait '+JSON.stringify(sample));fitted();
  const event=(type,data,target=view)=>{target.dispatchEvent(Object.assign(new window.Event(type),data));flush();};
  const before={...sample,lowerBetaLimit:camera.lowerBetaLimit,upperBetaLimit:camera.upperBetaLimit};
  event('pointerdown',{pointerId:1,pointerType:'touch',button:0,clientX:30,clientY:25});
  event('pointermove',{pointerId:1,pointerType:'touch',button:-1,clientX:145,clientY:65});
  PlaygroundInput.prototype.drag.call({camera:before,callbacks:{}},115,40,false);
  assert.ok(Math.abs(sample.alpha-before.alpha)<1e-8&&Math.abs(sample.beta-before.beta)<1e-8 ,'horse and gameplay camera turn in the same direction');fitted();
  for(let i=1;i<=8;i++){
   event('pointermove',{pointerId:1,pointerType:'touch',button:-1,clientX:145+i*157,clientY:i<5?150:-25});fitted();
  }
  const radius=sample.radius;event('wheel',{deltaY:-100});assert.ok(sample.radius<radius);
  const closeRadius=sample.radius;root.querySelector('[aria-label="Zoom out"]').click();flush();assert.ok(sample.radius>closeRadius);
  assert.deepEqual([camera.alpha,camera.beta,camera.radius],[.46,1.2,9]);
  const change=root.querySelector('.mf-mount-action');assert.equal(change.disabled,false);
  const panel=()=>root.querySelector('.mf-mount-palette');
  change.click();named(panel(),labels.white).click();assert.equal(paints.at(-1),'#ffffff');assert.deepEqual(writes,[]);
  event('keydown',{key:'Escape'},panel());assert.equal(panel(),null);assert.equal(paints.at(-1),'original');assert.ok(menu.open);
  change.click();const color=panel().querySelector('input');color.value='#537489';event('input',{},color);
  assert.equal(paints.at(-1),'#537489');named(panel(),labels.cancel).click();assert.equal(paints.at(-1),'original');
  change.click();named(panel(),labels.white).click();failSave=true;named(panel(),labels.apply).click();
  assert.equal(panel().querySelector('[role=status]').textContent,labels.saveError);assert.equal(wardrobe.coat,'original');
  failSave=false;named(panel(),labels.apply).click();assert.equal(panel(),null);assert.equal(wardrobe.coat,'#ffffff');
  assert.equal(root.querySelector('.mf-mount-colour').textContent,labels.white);
  change.click();named(panel(),labels.original).click();named(panel(),labels.apply).click();assert.equal(wardrobe.coat,'original');
  assert.deepEqual(writes,['#ffffff','original']);
  change.click();named(panel(),labels.chestnut).click();menu.close();
  assert.equal(panel(),null);assert.equal(wardrobe.coat,'original');assert.equal(scene.getMeshByName('wagon_horse'),null);
  menu.show('Mount');await wardrobe.preview();scene.dispose();assert.equal(menu.open,false,'scene teardown releases the modal immediately');
 }finally{menu.dispose();wardrobe.closePreview();scene.dispose();engine.dispose();setPack('ko',ko);}
});
