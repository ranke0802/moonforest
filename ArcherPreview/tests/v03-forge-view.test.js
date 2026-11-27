import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import postcss from 'postcss';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {ArcRotateCamera,MeshBuilder,NullEngine,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {FORGE_RULES,FORGE_MATERIALS,FORGE_WEAR_RANGE,TOWN_ITEMS,forgeCursor,forgeGradeWear,forgePulse,forgeSweepMs,forgeZones,forgeGain,forgeWear,gradeRing,gradeStrike,gradeLabel,gearName,itemName} from '../src/v03/town-items.js';
import {ringColor,ringStep,ringTable} from '../src/v03/forge-ring.js';
import {FORGE_LAYER} from '../src/v03/forge-bench.js';
import {FORGE_SOUNDS} from '../src/v03/forge-sound.js';
import {setAccessibility} from '../src/v03/accessibility.js';
import {t} from '../src/v03/i18n.js';

// 2026-11-25, user: the smith's temper screen was bare; a tap on the dialog (not a
// button) strikes. 2026-11-26, user: "+N" counts attempts up to 20 and every attempt is
// saved; the grade decides the gain (failed 0, fair 1, success 2, great 3; 4 on blessed
// gear; shields and armour half); an attempt wears the maximum by 3..6, 4 most often;
// the zones keep their size and the hammer speeds up with the attempts already made.
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
// wear: what the economy's random() returns (.3 wears 4, see forgeWear).
function forge({id='goblin-cleaver',level=0,bonus=null,max=null,hp=null,blessed=false,materials={'wolf-fang':2,'iron-scrap':1},wear=.3,stage=null,sound=null,before=null}={}){
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');before?.(window);
 let clock=1000,frames=0,cancelled=0,draw=null;const timers=[];
 Object.defineProperty(window,'performance',{value:{now:()=>clock},configurable:true});
 window.requestAnimationFrame=fn=>{draw=fn;return ++frames;};window.cancelAnimationFrame=()=>{draw=null;cancelled++;};
 window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};window.clearTimeout=id=>{if(timers[id-1])timers[id-1].fn=null;};
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('forge-view',5000);
 const economy=createTownEconomy(gold,{},{random:()=>wear});economy.grant(id);economy.equip(id);
 for(const [key,n] of Object.entries(materials))economy.grant(key,n);
 const piece=economy.state.condition[id],sword=TOWN_ITEMS[id].slot==='sword';
 piece.level=level;piece.bonus=bonus??level*(sword?2:1);piece.max=max??TOWN_ITEMS[id].max-level*4;piece.hp=hp??piece.max;if(blessed)piece.blessed=true;
 let changes=0,pauses=0;const shop=createTownShop({root:document.getElementById('app'),economy,onChange:()=>changes++,onPause(){pauses++;},stage,sound});
 const dialog=document.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 void shop.show('smith','forge');
 const button=label=>[...dialog.querySelectorAll('button')].find(node=>node.textContent===label);
 // The bench opens on the worn sword; another piece is chosen in its list.
 if(economy.state.equipped.sword!==id){
  const select=dialog.querySelector('select');
  for(const option of select.querySelectorAll('option'))option.selected=option.value===id;
  if(select.value!==id)Object.defineProperty(select,'value',{value:id,configurable:true});
  select.onchange();
 }
 const start=button(t('shop.forge',{cost:economy.forgeCost(id)}));
 if(start&&!start.disabled)start.click();
 return {document,window,dialog,economy,shop,button,timers,id,get changes(){return changes;},get pauses(){return pauses;},get frames(){return frames;},get cancelled(){return cancelled;},get pending(){return !!draw;},
  at(ms){clock=1000+ms;},frameAt(ms){clock=1000+ms;const fn=draw;draw=null;fn?.(clock);},
  tap(target=dialog.querySelector('.mf-bench')){target.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));}};
}
const gain=(id,n)=>t('shop.gradeGain',{stat:t(TOWN_ITEMS[id].slot==='sword'?'char.attack':'char.defense'),n});

// 2026-11-27, user review: "no background sound, no effect, too plain". A first-person
// bench (the piece on the anvil, the left hand on it, the hammer in the right) and a
// ring that pulses on the piece instead of the bar: yellow great success, green
// success, grey near miss, black failed. A great success keeps the maximum, a near
// miss wears half the roll (rounded up); success and failed are unchanged.
function rects(window,rect,reads){
 const proto=window.HTMLElement.prototype,old=Object.getOwnPropertyDescriptor(proto,'getBoundingClientRect');
 proto.getBoundingClientRect=function(){reads.n++;return rect;};
 return ()=>{if(old)Object.defineProperty(proto,'getBoundingClientRect',old);else delete proto.getBoundingClientRect;};
}

test('the ring closes on the centre once a sweep; its size when struck is the grade, four fixed zones',()=>{
 assert.equal(forgePulse(0),1);assert.equal(forgePulse(450),0);assert.equal(forgePulse(900),1);assert.equal(forgePulse(225),.5);
 const zone=forgeZones();
 assert.deepEqual([zone.perfect,zone.success,zone.near,zone.scale],[.12,.39,.69,1]);
 assert.deepEqual([0,.12,.1201,.39,.3901,.69,.6901,1].map(e=>gradeRing(e)),['Perfect','Perfect','Success','Success','Near miss','Near miss','Failed','Failed']);
 // At +0 a great success is the 108 ms around each closing (54 ms either side).
 assert.equal(gradeRing(forgePulse(450-53)),'Perfect');assert.equal(gradeRing(forgePulse(450-56)),'Success');
 // The ring and the old bar grade every moment the same: the timing did not change.
 for(const level of [0,4,19])for(let ms=0;ms<=2000;ms+=13)assert.equal(gradeRing(forgePulse(ms,level),level),gradeStrike(forgeCursor(ms,level),level));
 // Fixed zones at every count (2026-11-26); the hammer, now the ring, speeds up instead.
 for(const level of [0,7,19,20,99])assert.equal(forgeZones(level),zone);
 assert.equal(FORGE_RULES.zoneShrink,0);
 // The 2026-11-25 rule is one value away: 3% narrower great/success zones per attempt.
 const narrow=forgeZones(12,.03);
 assert.ok(Math.abs(narrow.perfect-.12*.64)<1e-12&&Math.abs(narrow.success-.39*.64)<1e-12);assert.equal(narrow.near,.69);
 assert.equal(forgeZones(20,.03).scale,FORGE_RULES.minZoneScale,'never below the floor');
 assert.equal(forgeZones(12,.03),narrow,'one shared object per level');
 assert.equal(gradeRing(.1,12),'Perfect');assert.equal(gradeRing(.09,0),'Perfect');
});

test('the ring colour runs black, grey, green, yellow towards the centre and blends at each edge',()=>{
 const c=e=>ringTable().colors[ringStep(e)];
 assert.equal(c(0),'rgb(255,243,160)');assert.equal(c(.25),'rgb(79,194,86)');assert.equal(c(.55),'rgb(155,155,155)');assert.equal(c(.9),'rgb(0,0,0)');
 assert.deepEqual(ringColor(.39),[117,175,121],'half way between green and grey at the success edge');
 assert.deepEqual(ringColor(.69),[78,78,78]);
 // No hard step: neighbouring sizes differ by a small amount everywhere.
 for(let i=1;i<=256;i++){const a=ringColor((i-1)/256),b=ringColor(i/256);assert.ok(Math.max(...a.map((v,k)=>Math.abs(v-b[k])))<=40,'step '+i);}
 assert.equal(ringTable(),ringTable(),'made once');assert.equal(ringTable().scales[0],'scale(0.0350)');assert.equal(ringTable().scales[256],'scale(1.0000)');
});

test('the bench view: ring by transform and colour only, laid out once (not per frame), the 2D bench without a 3D stage',()=>{
 const reads={n:0};let restore=null;
 const h=forge({level:4,before:window=>{restore=rects(window,{left:0,top:0,width:900,height:500,right:900,bottom:500},reads);}});
 try{
  const area=h.dialog.querySelector('.mf-bench'),ring=h.dialog.querySelector('.mf-forge-ring'),aim=h.dialog.querySelector('.mf-forge-aim');
  assert.ok(area.classList.contains('is-flat'),'no stage: the 2D bench');assert.ok(h.dialog.classList.contains('is-bench'));
  assert.equal(h.document.getElementById('app').dataset.forgeBench,'');
  assert.equal(ring.style.transform,'scale(1.0000)');assert.equal(ring.style.stroke,'rgb(0,0,0)');
  assert.equal(aim.style.transform,'translate(450.0px,250.0px)');assert.equal(aim.style.getPropertyValue('--ring'),'230.0px');
  const laid=reads.n,sweep=forgeSweepMs(4);
  h.frameAt(sweep/2);assert.equal(ring.style.transform,'scale(0.0350)');assert.equal(ring.style.stroke,'rgb(255,243,160)');
  h.frameAt(sweep/4);assert.equal(ring.style.transform,'scale(0.5000)');assert.equal(ring.style.stroke,'rgb(155,155,155)');
  ring.style.transform='kept';h.frameAt(sweep/4);assert.equal(ring.style.transform,'kept','an unchanged size writes nothing');
  for(let ms=0;ms<3000;ms+=16)h.frameAt(ms);
  assert.equal(reads.n,laid,'no layout read in a frame');
  assert.equal(ring.style.left||'','');assert.equal(aim.style.left||'','');
  const hint=h.dialog.querySelector('.mf-bench-hint').textContent;
  assert.equal(hint,t('forge.tap')+' · '+t('forge.speed',{n:120}));
  assert.deepEqual([...h.dialog.querySelectorAll('.mf-bench-legend li b')].map(node=>node.textContent),['대성공','성공','아쉬움','실패']);
  assert.deepEqual([...h.dialog.querySelectorAll('.mf-bench-legend li span')].map(node=>node.textContent),[3,2,1,0].map(n=>gain('goblin-cleaver',n)));
  assert.deepEqual([...h.dialog.querySelectorAll('.mf-bench-legend li small')].map(node=>node.textContent),
   [t('forge.noWear'),t('forge.wearRange',{min:3,max:6}),t('forge.wearRange',{min:2,max:3}),t('forge.wearRange',{min:3,max:6})]);
  assert.deepEqual([...h.dialog.querySelectorAll('.mf-bench-legend li')].map(node=>node.dataset.zone),['perfect','success','near','failed']);
  const card=h.dialog.querySelector('.mf-forge-item'),item=TOWN_ITEMS['goblin-cleaver'];
  assert.equal(card.querySelector('.mf-forge-icon b').textContent,'+4');
  const [attack,durability,count]=[...card.querySelectorAll('dl>div')];
  assert.equal(attack.querySelector('dd').textContent,'+'+(item.attack+8)+' → +'+(item.attack+10)+' '+t('shop.forgeOnPerfect',{value:'+'+(item.attack+11)}));
  assert.equal(durability.querySelector('dd').textContent,(item.max-16)+'/'+(item.max-16));assert.equal(count.querySelector('dd').textContent,'4 / 20');
  assert.equal(h.dialog.querySelector('.mf-bench-saved').textContent,t('shop.forgeSaved'));
  assert.ok(h.dialog.querySelector('.mf-bench-flat .mf-bench-piece'),'the 2D bench shows the piece on its anvil');
  assert.equal(h.button(t('shop.strike')),undefined,'no strike button');
 }finally{h.shop.dispose();restore?.();}
});

test('a tap strikes once where the ring is; the grade and the changes show large, the buttons wait 0.45 s, the ring stops',()=>{
 const h=forge({level:4});
 try{
  const item=TOWN_ITEMS['goblin-cleaver'],before=h.economy.state.bag['iron-scrap'],sweep=forgeSweepMs(4);
  h.tap(h.dialog.querySelector('header button'));assert.equal(h.dialog.querySelector('.mf-bench').classList.contains('is-struck'),false,'its own buttons never strike');
  h.at(sweep/2);h.tap(h.dialog);
  const area=h.dialog.querySelector('.mf-bench');
  assert.equal(area.dataset.grade,'perfect');assert.equal(h.dialog.querySelector('.mf-bench-burst').dataset.grade,'perfect');
  assert.equal(h.dialog.querySelector('.mf-bench-result strong').textContent,gradeLabel('Perfect'));
  assert.deepEqual(h.economy.gear(),{level:5,bonus:11,blessed:false,hp:item.max-16,max:item.max-16,attack:item.attack+11,defense:0},'one attempt, +3, the maximum kept');
  assert.equal(h.economy.state.bag['iron-scrap']??0,before-1);
  const rows=[...h.dialog.querySelectorAll('.mf-bench-change>div')].map(line=>[line.querySelector('dt').textContent,line.querySelector('dd').textContent]);
  assert.deepEqual(rows,[[t('shop.forgeCount'),'+4 → +5'],[t('char.attack'),'+16 → +19 '+gain('goblin-cleaver',3)],
   [t('forge.maxDurability'),(item.max-16)+' → '+(item.max-16)+' '+t('forge.kept')]]);
  assert.equal(h.dialog.querySelector('.mf-bench-result span').textContent,itemName('goblin-cleaver')+' +5 · '+t('char.durability',{hp:item.max-16,max:item.max-16}));
  assert.equal(h.dialog.querySelector('.mf-forge-ring').style.transform,'scale(0.0350)','the ring stays where it was struck');
  assert.equal(h.changes,1);assert.ok(h.cancelled>=1);assert.equal(h.pending,false,'the 2D bench draws no more frames');
  assert.equal(h.dialog.querySelectorAll('.mf-bench-spark').length,14);assert.equal(h.dialog.querySelector('.mf-bench-foot').hidden,true);
  const gold=h.economy.gold;h.tap(h.dialog);h.dialog.dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true}),{code:'Space'}));
  assert.equal(h.economy.gold,gold);assert.equal(h.economy.gear().level,5);
  const again=h.button(t('shop.forgeAgain',{cost:h.economy.forgeCost('goblin-cleaver')})),back=h.button(t('panel.back'));
  assert.equal(again.disabled,true);
  const arm=h.timers.find(timer=>timer.ms===450);assert.ok(arm,'0.45 s');arm.fn();
  assert.equal(again.disabled,false);
  again.click();assert.equal(h.dialog.querySelector('.mf-bench-hint').textContent,t('forge.tap')+' · '+t('forge.speed',{n:125}));
  assert.equal(h.dialog.querySelectorAll('.mf-bench').length,1);
  h.at(forgeSweepMs(5)/2+10000);
  h.dialog.querySelector('.mf-bench').dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true}),{code:'Enter'}));
  assert.equal(h.dialog.querySelector('.mf-bench').classList.contains('is-struck'),true);assert.equal(h.economy.gear().level,6);
  const pauses=h.pauses;h.button(t('panel.back')).click();
  assert.equal(h.dialog.querySelector('.mf-bench'),null);assert.equal(h.dialog.dataset.mode,'forge');assert.equal(h.dialog.classList.contains('is-bench'),false);
  assert.equal(h.document.getElementById('app').dataset.forgeBench,undefined);assert.ok(h.pauses>pauses,'playback is reconciled on leaving');
  assert.match(h.dialog.querySelector('.mf-shop-receipt').textContent,new RegExp(itemName('goblin-cleaver')));
  assert.ok([...h.dialog.querySelectorAll('.mf-shop-row')][1].querySelector('small').textContent.startsWith(t('forge.temperNote',{maxLevel:20,minDurability:32}).slice(0,12)));
  void back;
 }finally{h.shop.dispose();}
});

test('four grades, four results: great keeps the maximum, success and failed wear the roll, a near miss half of it rounded up',()=>{
 assert.deepEqual(FORGE_RULES.gradeWear,{Perfect:0,Success:1,'Near miss':.5,Failed:1});
 assert.deepEqual([3,4,5,6].map(w=>forgeGradeWear('Near miss',w)),[2,2,3,3]);
 assert.deepEqual([3,4,5,6].map(w=>forgeGradeWear('Perfect',w)),[0,0,0,0]);
 assert.deepEqual([3,4,5,6].map(w=>forgeGradeWear('Success',w)),[3,4,5,6]);assert.deepEqual([3,4,5,6].map(w=>forgeGradeWear('Failed',w)),[3,4,5,6]);
 // [position, grade, attack gained, maximum lost with a roll of 4, with a roll of 6]
 const cases=[[.5,'Perfect',3,0,0],[.36,'Success',2,4,6],[.24,'Near miss',1,2,3],[0,'Failed',0,4,6]];
 for(const [position,grade,gainNow,four,six] of cases)for(const [roll,loss] of [[.3,four],[.95,six]]){
  const gold=new GoldLoot({storage:store()});gold.creditCumulative('grades',500);
  const town=createTownEconomy(gold,{},{random:()=>roll});town.grant('oathblade');town.equip('oathblade');town.grant('iron-scrap');
  assert.equal(town.forge(position),grade);
  const w=town.gear();assert.deepEqual([w.level,w.bonus,TOWN_ITEMS.oathblade.max-w.max,w.hp],[1,gainNow,loss,w.max],grade+' '+roll);
 }
 // The floor still holds.
 {const gold=new GoldLoot({storage:store()});gold.creditCumulative('floor',500);
  const town=createTownEconomy(gold,{},{random:()=>.95});town.grant('oathblade');town.equip('oathblade');town.grant('iron-scrap',2);
  town.state.condition.oathblade.max=34;town.state.condition.oathblade.hp=34;
  assert.equal(town.forge(.24),'Near miss');assert.equal(town.gear().max,32);assert.equal(town.forge(.5),'Perfect');assert.equal(town.gear().max,32);}
 // The view says what changed: a near miss -2 (of 4), a failure -4.
 for(const [ms,key,line] of [[forgeSweepMs(0)/2*.35,'near',(TOWN_ITEMS['goblin-cleaver'].max)+' → '+(TOWN_ITEMS['goblin-cleaver'].max-2)+' '+t('shop.forgeWore',{d:2})],
  [0,'failed',(TOWN_ITEMS['goblin-cleaver'].max)+' → '+(TOWN_ITEMS['goblin-cleaver'].max-4)+' '+t('shop.forgeWore',{d:4})]]){
  const h=forge();
  try{
   h.at(ms);h.tap();assert.equal(h.dialog.querySelector('.mf-bench').dataset.grade,key);
   assert.equal([...h.dialog.querySelectorAll('.mf-bench-change dd')][2].textContent,line);
   assert.equal(h.dialog.querySelector('.mf-bench-result strong').textContent,gradeLabel(key==='near'?'Near miss':'Failed'));
  }finally{h.shop.dispose();}
 }
});

test('the 3D bench uses the game scene: the worn piece, hands, hammer and anvil on their own layer, released on close; a broken stage falls back to 2D',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const camera=new ArcRotateCamera('play',.6,1.1,11,new Vector3(2,1,5),scene);
  const sword=MeshBuilder.CreateBox('Golden_Oathblade',{height:1.2,width:.1,depth:.03},scene);sword.material=new StandardMaterial('sword',scene);
  const canvas={getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})};
  const stage=()=>({scene,camera,canvas,piece:id=>id==='goblin-cleaver'?{mesh:sword}:null});
  const reads={n:0};let restore=null;
  const h=forge({stage,before:window=>{restore=rects(window,{left:300,top:60,width:700,height:560,right:1000,bottom:620},reads);}});
  try{
   const bench=()=>scene.meshes.filter(m=>m.name.startsWith('v03-'));
   assert.equal(bench().length,7,'anvil, piece, heat, left hand, hammer arm, flash, sparks');
   assert.ok(bench().every(m=>m.layerMask===FORGE_LAYER&&!m.isPickable),'never in the world render or picking');
   assert.equal(bench().find(m=>m.name==='v03-forge-piece-surface').geometry,sword.geometry,'the worn geometry, shared');
   assert.equal(bench().find(m=>m.name==='v03-forge-piece-surface').material,sword.material);
   const area=h.dialog.querySelector('.mf-bench');
   for(let i=0;i<40&&area.classList.contains('is-flat');i++){await new Promise(done=>setImmediate(done));h.frameAt(16+i);}
   assert.equal(area.classList.contains('is-flat'),false);assert.ok(h.dialog.classList.contains('is-3d'));
   assert.equal(h.document.getElementById('app').dataset.forgeDrawn,'');
   assert.ok(Number.parseFloat(h.dialog.querySelector('.mf-forge-aim').style.getPropertyValue('--ring'))>=44);
   h.at(450);h.tap();assert.equal(area.dataset.grade,'perfect');
   assert.equal(h.dialog.querySelectorAll('.mf-bench-spark').length,0,'the 3D bench throws its own sparks');
   for(let ms=466;ms<2000;ms+=16)h.frameAt(ms);
   assert.equal(bench().find(m=>m.name==='v03-forge-sparks').isVisible,false,'sparks are gone again');
   h.frameAt(2100);assert.equal(h.pending,false,'frames stop after the strike settles');
   h.shop.close();
   assert.equal(bench().length,0,'closing the shop releases the bench');
   assert.ok(sword.geometry&&!sword.isDisposed(),'the worn piece keeps its geometry');
  }finally{h.shop.dispose();restore?.();}
  // A camera that cannot draw: the first frame fails and the 2D bench stays.
  const broken=forge({stage:()=>({scene,camera:{fov:.8},canvas,piece:()=>null}),before:window=>{restore=rects(window,{left:0,top:0,width:600,height:400,right:600,bottom:400},reads);}});
  try{
   const warn=console.warn;console.warn=()=>{};
   try{broken.frameAt(16);}finally{console.warn=warn;}
   assert.ok(broken.dialog.querySelector('.mf-bench').classList.contains('is-flat'));assert.equal(broken.dialog.classList.contains('is-3d'),false);
   assert.equal(scene.meshes.filter(m=>m.name.startsWith('v03-')).length,0,'the failed bench is released');
   broken.frameAt(400);broken.at(450);broken.tap();assert.equal(broken.dialog.querySelector('.mf-bench').dataset.grade,'perfect','the 2D bench still tempers');
  }finally{broken.shop.dispose();restore?.();}
  // No scene at all.
  const none=forge({stage:()=>null});
  try{none.at(450);none.tap();assert.equal(none.dialog.querySelector('.mf-bench').dataset.grade,'perfect');}finally{none.shop.dispose();}
 }finally{engine.dispose();}
});

test('sound: strikes and the great success use effects the game already plays; the bench bed is a named hook with nothing connected',()=>{
 assert.deepEqual(Object.keys(FORGE_SOUNDS),['forge:ambience','forge:ambience:end','forge:strike:perfect','forge:strike:success','forge:strike:near','forge:strike:failed',
  'forge:result:perfect','forge:result:success','forge:result:near','forge:result:failed']);
 assert.equal(FORGE_SOUNDS['forge:ambience'],null,'no new sound until one is approved');
 let audio=null;try{audio=JSON.parse(readFileSync(new URL('../public/assets/audio.json',import.meta.url),'utf8'));}catch{}
 if(audio)for(const cue of Object.values(FORGE_SOUNDS))if(cue)assert.ok(audio.sounds[cue[0]],cue[0]+' is an existing cue');
 const calls=[];const h=forge({level:2,sound:(cue,options)=>calls.push([cue,options?.volume])});
 try{
  assert.deepEqual(calls,[],'the bed hook plays nothing yet');
  h.at(forgeSweepMs(2)/2);h.tap();
  assert.deepEqual(calls.map(([cue])=>cue),['parry','critical']);
  h.timers.find(timer=>timer.ms===450).fn();
  h.button(t('shop.forgeAgain',{cost:h.economy.forgeCost(h.id)})).click();h.at(forgeSweepMs(2)/2+2*forgeSweepMs(3));h.tap();
  assert.deepEqual(calls.slice(2).map(([cue])=>cue),['land']);
 }finally{h.shop.dispose();}
});

test('reduced motion keeps the ring and drops the 2D sparks; the bench CSS keeps touch targets, the ring stroke and the hidden HUD',()=>{
 setAccessibility({motion:'on'});
 const h=forge();
 try{
  h.frameAt(200);assert.notEqual(h.dialog.querySelector('.mf-forge-ring').style.transform,'scale(1.0000)','the ring still moves');
  h.at(450);h.tap();assert.equal(h.dialog.querySelectorAll('.mf-bench-spark').length,0);
 }finally{h.shop.dispose();setAccessibility({motion:'system'});}
 const css=postcss.parse(readFileSync(new URL('../src/v03/forge-bench.css',import.meta.url),'utf8'));
 const value=(selector,name)=>{let found;css.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(name,d=>{found=d.value;});});return found;};
 assert.equal(value('.mf-town-shop.is-bench button','min-height'),'44px');
 assert.equal(value('.mf-forge-rings circle','vector-effect'),'non-scaling-stroke');
 assert.equal(value('#app[data-forge-bench]>:not(#viewport):not(.mf-town-shop):not(#loading)','visibility'),'hidden');
 // Nothing under 12px (0.75rem) in the bench.
 css.walkDecls('font-size',decl=>{for(const m of decl.value.matchAll(/([\d.]+)(rem|px)/g)){const px=m[2]==='rem'?16*Number(m[1]):Number(m[1]);assert.ok(px>=12,decl.parent.selector+' '+decl.value);}});
});
test('every attempt counts and is saved at once; it wears the maximum by 3 to 6 (by its grade) and never restores durability',()=>{
 // forgeWear: 3 (20%), 4 (50%), 5 (20%), 6 (10%). Four is the usual loss.
 assert.deepEqual([0,.19,.21,.45,.69,.71,.89,.91,.999].map(roll=>forgeWear(()=>roll)),[3,3,4,4,4,5,5,6,6]);
 const tally={};for(let i=0;i<1000;i++){const loss=forgeWear(()=>(i+.5)/1000);tally[loss]=(tally[loss]??0)+1;}
 assert.deepEqual(tally,{3:200,4:500,5:200,6:100});
 assert.deepEqual(['Failed','Near miss','Success','Perfect'].map(grade=>forgeGain('sword',grade)),[0,1,2,3]);
 assert.deepEqual(['Failed','Near miss','Success','Perfect'].map(grade=>forgeGain('sword',grade,true)),[0,1,2,4],'blessed: only the great success grows');
 for(const slot of ['shield','armor']){
  assert.deepEqual(['Failed','Near miss','Success','Perfect'].map(grade=>forgeGain(slot,grade)),[0,0,1,2]);
  assert.equal(forgeGain(slot,'Perfect',true),3);
 }
 const seeded=(hp,rolls=[],storage=store())=>{
  const gold=new GoldLoot({storage});gold.creditCumulative('forge-rule',5000);
  const first=createTownEconomy(gold);first.grant('oathblade');first.grant('iron-scrap',30);
  // A save from before this rule: +9 at 7 durability a level, no stored bonus.
  const saved=structuredClone(first.state);saved.condition.oathblade={level:9,hp};assert.equal(gold.tradeTown(0,saved),true);
  const economy=createTownEconomy(gold,{},{random:()=>rolls.length?rolls.shift():.3});
  assert.deepEqual(economy.gear('oathblade'),{level:9,bonus:18,blessed:false,hp,max:57,attack:23,defense:0},'the old +9 keeps its 18');
  return {gold,storage,economy};
 };
 const read=economy=>{const w=economy.gear('oathblade');return [w.level,w.bonus,w.hp,w.max];};
 {const {economy}=seeded(45);assert.equal(economy.forge(.36,'oathblade'),'Success');assert.deepEqual(read(economy),[10,20,45,53]);}
 {const {economy}=seeded(55);assert.equal(economy.forge(.36,'oathblade'),'Success');assert.deepEqual(read(economy),[10,20,53,53],'above the new maximum it follows it');}
 {const {economy}=seeded(45);assert.equal(economy.forge(.5,'oathblade'),'Perfect');assert.deepEqual(read(economy),[10,21,45,57],'a great success is one attempt and keeps the maximum (2026-11-27)');}
 {const {economy}=seeded(45);assert.equal(economy.forge(.3,'oathblade'),'Near miss');assert.deepEqual(read(economy),[10,19,45,55],'a near miss wears half the roll');}
 {const {economy,storage}=seeded(45,[.95]);assert.equal(economy.forge(0,'oathblade'),'Failed');
  assert.deepEqual(read(economy),[10,18,45,51],'a failure counts, adds nothing, and wears like any attempt (6 here)');
  // Saved at once: another reader of the same storage sees it, and repair fills only to the worn maximum.
  const again=createTownEconomy(new GoldLoot({storage}),{},{random:()=>.3});
  assert.deepEqual(again.state.condition.oathblade,{level:10,bonus:18,max:51,hp:45});
  assert.equal(again.repairCost('oathblade'),1);assert.ok(again.repair('oathblade'));assert.equal(again.gear('oathblade').hp,51);
  // To the cap: ten more attempts, the floor holds, and the count stops at 20.
  for(let i=0;i<10;i++)assert.equal(again.forge(0,'oathblade'),'Failed');
  assert.deepEqual(read(again),[20,18,FORGE_RULES.minDurability,FORGE_RULES.minDurability],'never below the floor');
  assert.equal(again.forge(.5,'oathblade'),null);
  assert.deepEqual(createTownEconomy(new GoldLoot({storage})).state.condition.oathblade,{level:20,bonus:18,max:32,hp:32});}
 // Twenty great successes from new: +60 on a blade, +40 on a shield.
 {const gold=new GoldLoot({storage:store()});gold.creditCumulative('cap',9000);
  const economy=createTownEconomy(gold,{},{random:()=>0});economy.grant('iron-scrap',40);economy.grant('oak-shield');
  let cost=0;
  for(let i=0;i<20;i++){cost+=economy.forgeCost('field-sword');assert.equal(economy.forge(.5,'field-sword'),'Perfect');assert.equal(economy.forge(.5,'oak-shield'),'Perfect');}
  assert.equal(cost,1000,'12 G rising by 4 an attempt');
  assert.deepEqual([economy.gear('field-sword').level,economy.gear('field-sword').attack,economy.gear('field-sword').max],[20,63,180],'great successes keep the maximum');
  assert.deepEqual([economy.gear('oak-shield').level,economy.gear('oak-shield').defense],[20,44]);}
});

test('saves from the old rule keep their numbers: maximums with failure loss, +12 pieces and their bonus',()=>{
 const storage=store(),wallet=new GoldLoot({storage});
 wallet.creditCumulative('migration',500);
 const inventory=createTownEconomy(wallet);inventory.grant('oathblade');inventory.grant('oak-shield');inventory.grant('iron-scrap',3);
 const saved=structuredClone(inventory.state);
 saved.condition.oathblade={level:3,loss:12,hp:61,wearUnits:210};saved.condition['oak-shield']={level:12,max:61,hp:50};
 assert.equal(wallet.tradeTown(0,saved),true);
 const load=()=>createTownEconomy(new GoldLoot({storage}),{},{random:()=>.3});
 const first=load();
 assert.deepEqual(first.gear('oathblade'),{level:3,bonus:6,blessed:false,hp:61,max:87,attack:11,defense:0});
 assert.deepEqual(first.gear('oak-shield'),{level:12,bonus:12,blessed:false,hp:50,max:61,attack:0,defense:16},'the old cap is no longer the cap');
 assert.equal(first.canForge('oak-shield'),true);
 assert.equal(first.forge(.5,'oathblade'),'Perfect');assert.equal(first.forge(.5,'oak-shield'),'Perfect');
 for(let i=0;i<2;i++){
  const restored=load();
  assert.deepEqual(restored.state.condition.oathblade,{level:4,bonus:9,max:87,hp:61,wearUnits:210});
  assert.deepEqual(restored.state.condition['oak-shield'],{level:13,bonus:14,max:61,hp:50});
  assert.equal(restored.state.bag['iron-scrap'],1);
 }
 // A bonus that cannot belong to its count is not trusted.
 const odd=structuredClone(load().state);odd.condition.oathblade={level:2,bonus:99,max:100,hp:100};
 assert.equal(new GoldLoot({storage}).tradeTown(0,odd),true);
 assert.equal(load().gear('oathblade').bonus,4);
});

test('one crafted piece in ten is blessed; the blessing shows in its name, stays through reloads and lifts the great success',()=>{
 assert.equal(FORGE_RULES.blessChance,.1);
 const storage=store(),gold=new GoldLoot({storage});gold.creditCumulative('bless',2000);
 const rolls=[];let asked=0;const economy=createTownEconomy(gold,{},{random:()=>{asked++;return rolls.length?rolls.shift():.5;}});
 economy.grant('wolf-fang',8);economy.grant('iron-scrap',20);economy.grant('moon-herb',4);
 rolls.push(.1);assert.deepEqual(economy.craftAll('smith',{'wolf-blade':1}),{blessed:[]},'0.1 is not under one in ten');
 assert.equal(economy.gear('wolf-blade').blessed,false);assert.equal(gearName('wolf-blade',economy.gear('wolf-blade').blessed),itemName('wolf-blade'));
 rolls.push(.0999);assert.deepEqual(economy.craftAll('smith',{'wolf-blade':1}),{blessed:['wolf-blade']});
 assert.equal(economy.state.bag['wolf-blade'],2);assert.equal(economy.gear('wolf-blade').blessed,true);
 assert.equal(gearName('wolf-blade',true),'축복받은 '+itemName('wolf-blade'));
 // Potions are never blessed and take no roll; a blessed kind is not rolled again.
 const before=asked;
 assert.deepEqual(economy.craftAll('herbalist',{potion:2}),{blessed:[]});assert.equal(asked,before,'no roll for a potion');
 assert.deepEqual(economy.craftAll('smith',{'wolf-blade':1}),{blessed:[]});assert.equal(asked,before,'no roll for a kind already blessed');
 const again=createTownEconomy(new GoldLoot({storage}),{},{random:()=>.3});
 assert.equal(again.state.condition['wolf-blade'].blessed,true);
 again.equip('wolf-blade');assert.equal(again.forge(.5,'wolf-blade'),'Perfect');assert.equal(again.gear('wolf-blade').bonus,4);
 assert.equal(again.forge(.36,'wolf-blade'),'Success');assert.equal(again.gear('wolf-blade').bonus,6);
 // The shop says so when it happens.
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');
 const lucky=new GoldLoot({storage:store()});lucky.creditCumulative('shop',500);
 const town=createTownEconomy(lucky,{},{random:()=>.01});town.grant('boar-tusk');town.grant('iron-scrap');
 const shop=createTownShop({root:document.getElementById('app'),economy:town,onChange(){},onPause(){}});
 const dialog=document.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 void shop.show('smith');
 [...dialog.querySelectorAll('.mf-shop-tabs button')][2].click();
 dialog.querySelector('[data-item="hunter-knife"] .mf-shop-step button:last-child').click();dialog.querySelector('.mf-shop-act').click();
 assert.equal(dialog.querySelector('.mf-shop-receipt').textContent,t('shop.madeItems',{items:itemName('hunter-knife')+' ×1'})+' '+t('shop.blessedMade',{name:'축복받은 '+itemName('hunter-knife')}));
 shop.dispose();
});
