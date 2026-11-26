import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import postcss from 'postcss';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {FORGE_RULES,FORGE_MATERIALS,FORGE_WEAR_RANGE,TOWN_ITEMS,forgeCursor,forgeSweepMs,forgeZones,forgeGain,forgeWear,gradeStrike,gradeLabel,gearName,itemName} from '../src/v03/town-items.js';
import {t} from '../src/v03/i18n.js';

// 2026-11-25, user: the smith's temper screen was bare; a tap on the dialog (not a
// button) strikes. 2026-11-26, user: "+N" counts attempts up to 20 and every attempt is
// saved; the grade decides the gain (failed 0, fair 1, success 2, great 3; 4 on blessed
// gear; shields and armour half); an attempt wears the maximum by 3..6, 4 most often;
// the zones keep their size and the hammer speeds up with the attempts already made.
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
// wear: what the economy's random() returns (.3 wears 4, see forgeWear).
function forge({id='goblin-cleaver',level=0,bonus=null,max=null,hp=null,blessed=false,materials={'wolf-fang':2,'iron-scrap':1},wear=.3}={}){
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');
 let clock=1000,frames=0,cancelled=0,draw=null;const timers=[];
 Object.defineProperty(window,'performance',{value:{now:()=>clock},configurable:true});
 window.requestAnimationFrame=fn=>{draw=fn;return ++frames;};window.cancelAnimationFrame=()=>{draw=null;cancelled++;};
 window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};window.clearTimeout=id=>{if(timers[id-1])timers[id-1].fn=null;};
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('forge-view',5000);
 const economy=createTownEconomy(gold,{},{random:()=>wear});economy.grant(id);economy.equip(id);
 for(const [key,n] of Object.entries(materials))economy.grant(key,n);
 const piece=economy.state.condition[id],sword=TOWN_ITEMS[id].slot==='sword';
 piece.level=level;piece.bonus=bonus??level*(sword?2:1);piece.max=max??TOWN_ITEMS[id].max-level*4;piece.hp=hp??piece.max;if(blessed)piece.blessed=true;
 let changes=0;const shop=createTownShop({root:document.getElementById('app'),economy,onChange:()=>changes++,onPause(){}});
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
 return {document,window,dialog,economy,shop,button,timers,id,get changes(){return changes;},get frames(){return frames;},get cancelled(){return cancelled;},
  at(ms){clock=1000+ms;},frameAt(ms){clock=1000+ms;draw(clock);},
  tap(target=dialog.querySelector('.mf-forge')){target.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));}};
}
const gain=(id,n)=>t('shop.gradeGain',{stat:t(TOWN_ITEMS[id].slot==='sword'?'char.attack':'char.defense'),n});

test('the hammer travels between both gauge edges without adding its track width to the scrolling dialog',()=>{
 const css=postcss.parse(readFileSync(new URL('../src/v03/town-shop.css',import.meta.url),'utf8'));
 function property(selector,name){
  let value;
  css.walkRules(selector,rule=>rule.walkDecls(name,decl=>{value=decl.value;}));
  return value;
 }
 const h=forge();
 try{
  const rail=h.dialog.querySelector('.mf-forge-track > .mf-forge-gauge > .mf-forge-rail');
  assert.equal(property('.mf-forge-rail','width'),'0');
  assert.equal(property('.mf-forge-gauge','container-type'),'inline-size');
  assert.equal(property('.mf-forge-track','overflow'),'hidden');
  assert.equal(property('.mf-town-shop.is-forging','overflow-x'),'hidden');
  assert.equal(property('.mf-town-shop.is-forging','overflow-y'),'auto');
  for(const [ms,position] of [[0,0],[450,50],[900,100],[1800,0]]) {
   h.frameAt(ms);assert.equal(rail.style.transform,`translateX(${position.toFixed(2)}cqw)`);
  }
  h.at(2700);h.tap();
  assert.equal(rail.style.transform,'translateX(100.00cqw)');
  assert.equal(h.dialog.querySelector('.mf-forge').dataset.grade,'failed');
  assert.equal(h.dialog.querySelector('.mf-forge-result').hidden,false);
 }finally{h.shop.dispose();}
});

test('the zones keep their size at every count and the hammer sweeps faster with each attempt made',()=>{
 assert.deepEqual(['.5','.35','.24','0'].map(Number).map(p=>gradeStrike(p)),['Perfect','Success','Near miss','Failed']);
 const zone=forgeZones();
 assert.deepEqual([zone.perfect,zone.success,zone.near,zone.scale],[.12,.39,.69,1]);
 for(const level of [0,7,19,20,99])assert.equal(forgeZones(level),zone,'one size for every count');
 // Just inside the perfect edge is a great success whatever the count (2026-11-25 narrowed it by level).
 const edge=.5+.11/2;
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('zones',5000);
 const economy=createTownEconomy(gold,{},{random:()=>.3});economy.grant('goblin-cleaver');economy.equip('goblin-cleaver');economy.grant('iron-scrap',2);
 economy.state.condition['goblin-cleaver'].level=FORGE_RULES.maxLevel-1;
 assert.equal(economy.forge(edge),'Perfect');
 // 900 ms across at +0, about 460 ms at +19, faster at every step; the cap adds nothing more.
 assert.equal(forgeSweepMs(0),900);assert.equal(forgeCursor(450),.5);assert.equal(forgeCursor(900),1);
 assert.ok(Math.abs(forgeSweepMs(19)-900/1.95)<1e-9);assert.ok(forgeSweepMs(19)>450&&forgeSweepMs(19)<470);
 for(let level=0;level<FORGE_RULES.maxLevel;level++){
  assert.ok(forgeSweepMs(level+1)<forgeSweepMs(level),level+': faster');
  const sweep=forgeSweepMs(level);
  assert.ok(Math.abs(forgeCursor(sweep/2,level)-.5)<1e-9);assert.ok(Math.abs(forgeCursor(sweep,level)-1)<1e-9);assert.ok(Math.abs(forgeCursor(sweep*2,level))<1e-9);
 }
 assert.equal(forgeSweepMs(99),forgeSweepMs(FORGE_RULES.maxLevel));
 // The view: the same mark position needs less time at a higher count, and the hint says the speed.
 const slow=forge({level:0}),fast=forge({level:10}),late=forge({level:15});
 try{
  slow.frameAt(300);fast.frameAt(300);
  assert.equal(slow.dialog.querySelector('.mf-forge-rail').style.transform,'translateX(33.33cqw)');
  assert.equal(fast.dialog.querySelector('.mf-forge-rail').style.transform,'translateX(50.00cqw)','+10 sweeps in 600 ms');
  assert.ok(slow.dialog.querySelector('.mf-forge-hint').textContent.endsWith(t('shop.forgeSpeed',{n:100})));
  assert.ok(fast.dialog.querySelector('.mf-forge-hint').textContent.endsWith(t('shop.forgeSpeed',{n:150})));
  const art=h=>h.dialog.querySelector('.mf-forge-gauge').style.getPropertyValue('--mf-forge-art');
  assert.equal(art(slow),art(late),'the gauge picture does not change with the count');
 }finally{slow.shop.dispose();fast.shop.dispose();late.shop.dispose();}
});

test('the temper view shows the item, the count, what each grade adds, the cost, the material and the save notice; no strike button',()=>{
 const h=forge({level:4});
 try{
  const card=h.dialog.querySelector('.mf-forge-item'),item=TOWN_ITEMS['goblin-cleaver'];
  assert.equal(card.querySelector('.mf-forge-icon b').textContent,'+4');
  assert.equal(card.querySelector('strong').textContent,itemName('goblin-cleaver')+' +4');
  const [attack,durability,count]=[...card.querySelectorAll('dl>div')];
  assert.equal(attack.querySelector('dt').textContent,t('char.attack'));
  assert.equal(attack.querySelector('dd').textContent,'+'+(item.attack+8)+' → +'+(item.attack+10)+' '+t('shop.forgeOnPerfect',{value:'+'+(item.attack+11)}));
  assert.equal(durability.querySelector('dt').textContent,t('shop.forgeDurability'));
  assert.equal(durability.querySelector('dd').textContent,(item.max-16)+'/'+(item.max-16)+' · '+t('shop.forgeWear',{min:3,max:6}));
  assert.deepEqual(FORGE_WEAR_RANGE,{min:3,max:6});
  assert.equal(count.querySelector('dt').textContent,t('shop.forgeCount'));assert.equal(count.querySelector('dd').textContent,'4 / 20');
  const material=FORGE_MATERIALS.find(id=>h.economy.state.bag[id]);
  assert.equal(material,'iron-scrap');
  assert.equal(card.querySelector('.mf-forge-stock').textContent,t('shop.forgeStock',{items:itemName('iron-scrap')+' ×1 · '+itemName('wolf-fang')+' ×2'}));
  assert.equal(card.querySelector('.mf-forge-cost').textContent,t('shop.forgeCost',{cost:h.economy.forgeCost('goblin-cleaver'),material:itemName(material),n:1}));
  assert.deepEqual([...h.dialog.querySelectorAll('.mf-forge-legend li b')].map(node=>node.textContent),['대성공','성공','보통','실패']);
  assert.deepEqual([...h.dialog.querySelectorAll('.mf-forge-legend li span')].map(node=>node.textContent),[3,2,1,0].map(n=>gain('goblin-cleaver',n)));
  assert.equal(gain('goblin-cleaver',3),'공격력 +3');
  assert.equal(h.dialog.querySelector('.mf-forge-play .mf-forge-saved').textContent,'단련은 시도할 때마다 바로 저장됩니다. 되돌릴 수 없습니다.');
  assert.equal(h.button(t('shop.strike')),undefined);
  assert.ok(h.dialog.querySelector('.mf-forge-hint').textContent.endsWith(t('shop.forgeSpeed',{n:120})));
  const zone=forgeZones(),art=h.dialog.querySelector('.mf-forge-gauge').style.getPropertyValue('--mf-forge-art');
  assert.match(art,/^linear-gradient\(to right,#000 0 /,'failed is plain black');
  assert.ok(art.includes((50-zone.perfect*50).toFixed(2)+'%')&&art.includes((50+zone.near*50).toFixed(2)+'%'));
  assert.equal(h.dialog.querySelector('.mf-forge-glow').style.width,(zone.perfect*100).toFixed(2)+'%','the glow covers the great-success zone');
  assert.match(h.dialog.querySelector('.mf-forge-rail').style.transform,/^translateX\(/);
  assert.equal(h.dialog.querySelector('.mf-forge-rail').style.left||'','','the mark moves by transform only');
 }finally{h.shop.dispose();}
 // A shield reads defence and grows at half the blade's rate; a blessed blade's great success is +4.
 const shield=forge({id:'oak-shield',level:2}),blessed=forge({level:1,blessed:true});
 try{
  assert.deepEqual([...shield.dialog.querySelectorAll('.mf-forge-legend li span')].map(node=>node.textContent),[2,1,0,0].map(n=>gain('oak-shield',n)));
  assert.equal(gain('oak-shield',2),'방어력 +2');
  assert.equal(shield.dialog.querySelector('.mf-forge-item dd').textContent,'+6 → +7 '+t('shop.forgeOnPerfect',{value:'+8'}));
  assert.deepEqual([...blessed.dialog.querySelectorAll('.mf-forge-legend li span')].map(node=>node.textContent),[4,2,1,0].map(n=>gain('goblin-cleaver',n)));
  assert.equal(blessed.dialog.querySelector('.mf-forge-item strong').textContent,'축복받은 '+itemName('goblin-cleaver')+' +1');
  assert.equal(blessed.dialog.querySelector('header h2').textContent,t('shop.temperTitle',{name:gearName('goblin-cleaver',true)}));
 }finally{shield.shop.dispose();blessed.shop.dispose();}
});

test('a tap on the dialog strikes once at the mark position; the result stays, its buttons wait, the hammer stops',()=>{
 const h=forge({level:4});
 try{
  const before=h.economy.state.bag['iron-scrap'],item=TOWN_ITEMS['goblin-cleaver'];
  // A tap on the header's Back button does not strike.
  h.tap(h.dialog.querySelector('header button'));assert.equal(h.dialog.querySelector('.mf-forge').classList.contains('is-struck'),false);
  h.at(forgeSweepMs(4)/2);h.tap(h.dialog);
  const area=h.dialog.querySelector('.mf-forge');
  assert.equal(area.dataset.grade,'perfect');assert.equal(h.dialog.querySelector('.mf-forge-result strong').textContent,gradeLabel('Perfect'));
  assert.deepEqual(h.economy.gear(),{level:5,bonus:11,blessed:false,hp:item.max-20,max:item.max-20,attack:item.attack+11,defense:0},'one attempt, +3, 4 off the maximum');
  assert.equal(h.economy.state.bag['iron-scrap']??0,before-1,'the shown material is the one used');
  assert.equal(h.dialog.querySelector('.mf-forge-result span').textContent,
   gain('goblin-cleaver',3)+' · '+t('shop.forgeWore',{d:4})+' · '+itemName('goblin-cleaver')+' +5 · '+(item.max-20)+'/'+(item.max-20));
  assert.equal(h.dialog.querySelector('.mf-forge-stock').textContent,t('shop.forgeStock',{items:itemName('iron-scrap')+' ×0 · '+itemName('wolf-fang')+' ×2'}));
  assert.equal(h.changes,1);assert.ok(h.cancelled>=1,'the hammer animation stopped');
  assert.equal(h.dialog.querySelector('.mf-forge-icon b').textContent,'+5','the card shows the new count');
  assert.equal(area.querySelectorAll('.mf-forge-spark').length,10);
  // Further taps and keys do nothing; the buttons are held for a moment.
  const gold=h.economy.gold;h.tap(h.dialog);h.dialog.dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true}),{code:'Space'}));
  assert.equal(h.economy.gold,gold);assert.equal(h.economy.gear().level,5);
  const again=h.button(t('shop.forgeAgain',{cost:h.economy.forgeCost('goblin-cleaver')}));
  assert.equal(again.disabled,true);
  const arm=h.timers.find(timer=>timer.ms===450);arm.fn();
  assert.equal(again.disabled,false);
  // Again: a fresh sweep at the new speed; a key press strikes too, wherever the mark is.
  again.click();assert.ok(h.dialog.querySelector('.mf-forge-hint').textContent.endsWith(t('shop.forgeSpeed',{n:125})),'faster at +5');
  h.at(forgeSweepMs(5)/2+10000);
  h.dialog.querySelector('.mf-forge').dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true}),{code:'Enter'}));
  assert.equal(h.dialog.querySelector('.mf-forge').classList.contains('is-struck'),true);
  assert.equal(h.economy.gear().level,6,'that attempt counted whatever its grade');
  // Back to the bench: the receipt names the last grade.
  h.button(t('panel.back')).click();
  assert.equal(h.dialog.querySelector('.mf-forge'),null);assert.equal(h.dialog.dataset.mode,'forge');
  assert.match(h.dialog.querySelector('.mf-shop-receipt').textContent,new RegExp(itemName('goblin-cleaver')));
 }finally{h.shop.dispose();}
});

test('the twentieth attempt is the last: the result and the bench say so and offer no further temper',()=>{
 const h=forge({level:FORGE_RULES.maxLevel-1,max:40,materials:{'iron-scrap':3}});
 try{
  assert.equal(FORGE_RULES.maxLevel,20);
  h.at(forgeSweepMs(19)/2);h.tap();
  assert.equal(h.economy.gear().level,FORGE_RULES.maxLevel);assert.equal(h.economy.canForge(h.id),false);
  h.timers.find(timer=>timer.ms===450).fn();
  const maxed=h.button(t('shop.forgeMaxed',FORGE_RULES));
  assert.ok(maxed);assert.equal(maxed.disabled,true);assert.equal(maxed.textContent,'최대 강화 +20');
  h.button(t('panel.back')).click();
  const bench=h.button(t('shop.forgeMaxed',FORGE_RULES));assert.ok(bench&&bench.disabled,'the bench shows the cap too');
  assert.equal(h.economy.forge(.5,h.id),null);assert.equal(h.economy.gear().level,20);
 }finally{h.shop.dispose();}
});

test('every attempt counts and is saved at once; it wears the maximum by 3 to 6 and never restores durability',()=>{
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
 {const {economy}=seeded(45);assert.equal(economy.forge(.5,'oathblade'),'Perfect');assert.deepEqual(read(economy),[10,21,45,53],'a great success is still one attempt');}
 {const {economy}=seeded(45);assert.equal(economy.forge(.3,'oathblade'),'Near miss');assert.deepEqual(read(economy),[10,19,45,53]);}
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
  assert.deepEqual([economy.gear('field-sword').level,economy.gear('field-sword').attack,economy.gear('field-sword').max],[20,63,120]);
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
  assert.deepEqual(restored.state.condition.oathblade,{level:4,bonus:9,max:83,hp:61,wearUnits:210});
  assert.deepEqual(restored.state.condition['oak-shield'],{level:13,bonus:14,max:57,hp:50});
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
