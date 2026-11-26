// 2026-11-24 (user report 19:19): with Korean chosen, the status, inventory and
// skills pages were English (the menu forced lang=en and wrote English words,
// and item names lived in town-items.js as English). The pages, the village
// shops and every item now read ui keys in the chosen language.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {COMBAT_HINTS,TIPS} from '../src/v03/data/chapter1.js';
import {setPack,t} from '../src/v03/i18n.js';
import {GOLD_LEDGER_KEY,GoldLoot} from '../src/gold-loot.js';
import {slotStorage} from '../src/v03/save-slots.js';
import {createTownTreasure} from '../src/v03/town-treasure.js';
import {POTION} from '../src/healing-potion.js';
import {createCharacterMenu} from '../src/v03/character-menu.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {TOWN_ITEMS,STOCK,BOOSTS,FORGE_RULES,FORGE_WEAR_RANGE,itemName,itemNote,gradeLabel,gradeStrike} from '../src/v03/town-items.js';

const PACKS={ko,en,ja,vi,zh};
const byText=(parent,selector,label)=>{const node=[...parent.querySelectorAll(selector)].find(el=>el.textContent===label);assert.ok(node,'control: '+label);return node;};
const latinWord=/[A-Za-z]{3,}/,hangul=/[가-힣]/;
// Key caps are printed as on the keyboard in every language (the Korean lessons say Space too).
const keyCaps=/\bSpace\b/g;
// Everything a player can read or hear: text, labels and tooltips.
function readable(node){
 const parts=[node.textContent];
 for(const element of node.querySelectorAll('*'))for(const name of ['aria-label','title'])if(element.getAttribute(name))parts.push(element.getAttribute(name));
 if(node.getAttribute('aria-label'))parts.push(node.getAttribute('aria-label'));
 return parts.join('\n');
}
function page(){
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');
 window.ResizeObserver=class{observe(){}disconnect(){}};window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
 return {document,window,root:document.getElementById('app')};
}
function modal(dialog,window){dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};}
function expectLanguage(id,text,where){
 assert.doesNotMatch(text,/\{\w+\}|\b(?:char|shop|item)\.[\w-]+|\b(?:undefined|NaN)\b/,where+' contains a raw key or value');
 if(id==='ko'){const words=text.replace(keyCaps,'');assert.ok(!latinWord.test(words),`${where}: English left in Korean: ${words.match(latinWord)?.[0]}`);}
 else assert.ok(!hangul.test(text),`${where}: Korean left in ${id}: ${text.match(/[가-힣][^\n]{0,20}/)?.[0]}`);
}
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};

test('every village item, use and supply note has a name in all five languages',async()=>{
 for(const id of Object.keys(TOWN_ITEMS)){
  for(const [lang,pack] of Object.entries(PACKS))assert.ok(pack.ui['item.'+id],lang+': item.'+id);assert.equal(TOWN_ITEMS[id].name,undefined,id+' keeps no hardcoded name');
  if(TOWN_ITEMS[id].usage)for(const [lang,pack] of Object.entries(PACKS))assert.ok(pack.ui['item.usage.'+id],lang+': item.usage.'+id);
 }
 // #51 trophies and materials asked for by name.
 for(const id of ['raider-dagger','field-bow','crooked-staff','spiked-club','cave-claw','cave-fang','arrow-fletching','ward-cord','iron-stud','burial-clasp','ghoul-mail'])assert.ok(TOWN_ITEMS[id]&&ko.ui['item.'+id],id);
 assert.ok(TOWN_ITEMS['field-bow'].usage&&TOWN_ITEMS['crooked-staff'].usage);
 // The numbers in the notes come from the same data the game runs on.
 setPack('ko',ko);
 assert.equal(itemNote('potion'),`${POTION.pulses*POTION.interval}초 동안 체력을 최대 ${POTION.amount*POTION.pulses} 회복합니다.`);
 assert.equal(itemNote('bear-bile'),`${BOOSTS['bear-bile'].seconds}초 동안 스태미나 회복이 75% 빨라집니다.`);
 assert.equal(itemNote('wolf-fang'),null);
 const economy=createTownEconomy(new GoldLoot({storage:store()}));economy.grant('stamina-tonic');economy.register('stamina-tonic');
 assert.ok(economy.drink());assert.equal(economy.state.boost,BOOSTS['stamina-tonic'].seconds);assert.equal(economy.regen,BOOSTS['stamina-tonic'].rate);
 assert.deepEqual([.5,.35,.24,0].map(gradeStrike).map(gradeLabel),['대성공','성공','보통','실패']);
 setPack('en',en);assert.equal(itemName('cave-fang'),'Black Wolf Fangblade');assert.equal(gradeLabel('Near miss'),'Fair');assert.equal(gradeLabel('Perfect'),'Great success');
 setPack('ko',ko);
});

for(const id of Object.keys(PACKS))test(`character menu status, inventory and skills read ${id}`,()=>{
 setPack(id,PACKS[id]);
 try{
  const {window,root}=page();root.ownerDocument.documentElement.lang=id;
  const state={equipment:{sword:'original',shield:'teal-bronze'},hp:320,maxHp:500,stamina:80,maxStamina:100,attackBonus:5,defense:4,armorDefense:2,
   potions:2,gold:1234,canUsePotion:true,touch:true,allows:kind=>kind!=='attack'};
  const menu=createCharacterMenu({root,read:()=>state,subject:()=>null,onPause(){},usePotion(){},equip(){}});
  const dialog=root.querySelector('dialog');modal(dialog,window);
  assert.equal(dialog.getAttribute('lang'),null,'the menu follows the page language');
  for(const name of ['Status','Inventory','Skills']){
   menu.show(name);assert.equal(dialog.dataset.page,name,'page ids stay');
   expectLanguage(id,readable(dialog),name);
  }
  // Each item's detail panel, and every filter of the bag.
  for(const filter of ['char.type.Gear','char.type.Supplies','char.filter.All']){
   menu.show('Inventory');[...dialog.querySelectorAll('.mf-menu-filters button')].find(b=>b.textContent===t(filter)).click();
   for(const tile of [...dialog.querySelectorAll('.mf-menu-grid button')]){tile.click();expectLanguage(id,readable(dialog),`${filter} ${tile.title}`);}
  }
  menu.show('Skills');const skills=[...dialog.querySelectorAll('.mf-skill-node:not(.is-open)')];assert.equal(skills.length,7);
  assert.ok(dialog.querySelector('.mf-skill-node.is-locked'),'locked lessons are marked');
  for(const node of skills){node.click();expectLanguage(id,readable(dialog),'skill '+node.querySelector('b').textContent);}
  menu.dispose();
 }finally{setPack('ko',ko);}
});

for(const id of Object.keys(PACKS))test(`village shops and the forge read ${id}`,async()=>{
 setPack(id,PACKS[id]);
 try{
  const {window,root}=page();root.ownerDocument.documentElement.lang=id;
  const gold=new GoldLoot({storage:store()});gold.creditCumulative('test-grant',500);
  const economy=createTownEconomy(gold,{},{random:()=>.3});for(const item of ['wolf-fang','iron-scrap','wolf-pelt','bear-hide'])economy.grant(item,2);
  economy.grant('moon-herb',2);economy.grant('iron-scrap',2);economy.grant('leather-coat');
  const shop=createTownShop({root,economy,onChange(){},onPause(){}}),dialog=root.querySelector('dialog');modal(dialog,window);
  const receipt=()=>dialog.querySelector('.mf-shop-receipt').textContent;
  {
   // The smith's bench is its own view (2026-11-26: reached from "temper equipment" in the talk menu).
   const closed=shop.show('smith','forge');expectLanguage(id,readable(dialog),'bench');
   assert.equal(dialog.dataset.mode,'forge');assert.equal(dialog.querySelector('.mf-shop-tabs'),null);assert.equal(dialog.querySelector('.mf-shop-act'),null);
   const limits={maxLevel:FORGE_RULES.maxLevel,minDurability:FORGE_RULES.minDurability,...FORGE_WEAR_RANGE};
   for(const gear of ['field-sword','leather-coat','field-shield']){
    const picker=dialog.querySelector('select');[...picker.options].find(o=>o.value===gear).selected=true;picker.dispatchEvent(new window.Event('change'));
    const note=byText(dialog,'.mf-shop-row small',t('shop.temperNote',limits));
    for(const value of Object.values(limits))assert.ok(note.textContent.includes(String(value)),id+' temper note: '+value);
    assert.equal(dialog.querySelector('.mf-shop-row .mf-forge-saved').textContent,PACKS[id].ui['shop.forgeSaved']);
   }
   const select=dialog.querySelector('select');
   const target=economy.state.equipped.shield;
   [...select.options].find(option=>option.value===target).selected=true;
   select.dispatchEvent(new window.Event('change'));
   assert.equal(dialog.querySelector('select').value,target);
   const forge=byText(dialog,'button',t('shop.forge',{cost:economy.forgeCost(target)}));
   assert.ok(forge&&!forge.disabled,'forge is offered');forge.click();expectLanguage(id,readable(dialog),'forge');
   assert.equal(dialog.querySelector('h2').textContent,t('shop.temperTitle',{name:itemName(target)}));
   const zones=[...dialog.querySelectorAll('.mf-forge-legend li')];
   assert.deepEqual(zones.map(zone=>zone.querySelector('b').textContent),['Perfect','Success','Near miss','Failed'].map(gradeLabel));
   // A shield grows at half the blade's rate: 2, 1, 0, 0.
   assert.deepEqual(zones.map(zone=>zone.querySelector('span').textContent),[2,1,0,0].map(n=>t('shop.gradeGain',{stat:t('char.defense'),n})));
   assert.equal(dialog.querySelector('[role="img"]').getAttribute('aria-label'),PACKS[id].ui['shop.gauge']);
   assert.equal(dialog.querySelector('.mf-forge').getAttribute('aria-label'),PACKS[id].ui['shop.forgeTap']);
   assert.equal(dialog.querySelector('.mf-forge-play .mf-forge-saved').textContent,PACKS[id].ui['shop.forgeSaved']);
   // No strike button: a tap anywhere on the temper view strikes.
   assert.equal([...dialog.querySelectorAll('button')].some(b=>b.textContent===t('shop.strike')),false);
   dialog.querySelector('.mf-forge-gauge').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
   const grade=dialog.querySelector('.mf-forge-result strong').textContent;
   assert.ok(['Perfect','Success','Near miss','Failed'].some(value=>gradeLabel(value)===grade),id+' forge result: '+grade);
   assert.equal(economy.gear(target).level,1,'the attempt counted');
   expectLanguage(id,readable(dialog),'forge result');
   byText(dialog,'header button',t('panel.back')).click();
   assert.equal(receipt().split(' · ')[0],grade);
   shop.close();await closed;
  }
  for(const kind of ['smith','herbalist']){
   // 2026-11-26, user: a quantity beside each price and one button, always at the bottom.
   const closed=shop.show(kind);expectLanguage(id,readable(dialog),kind);
   const tabs=()=>[...dialog.querySelectorAll('.mf-shop-tabs button')],act=()=>dialog.querySelector('.mf-shop-act');
   const more=item=>dialog.querySelector('[data-item="'+item+'"] .mf-shop-step button:last-child');
   assert.deepEqual(tabs().map(tab=>tab.textContent),[t('shop.buy'),t('shop.sell'),t(kind==='smith'?'shop.makeGear':'shop.brew')]);
   assert.equal(dialog.dataset.mode,'shop');assert.equal(dialog.querySelector('select'),null,'no bench in the shop');
   const bought=kind==='smith'?'iron-scrap':'potion',had=economy.state.bag[bought]??0;
   for(const line of dialog.querySelectorAll('.mf-shop-row[data-item]'))assert.match(line.querySelector('.mf-shop-price').textContent,/^\d+ G$/);
   assert.equal(act().textContent,t('shop.buy'));assert.equal(act().disabled,true);
   more(bought).click();more(bought).click();assert.equal(economy.state.bag[bought]??0,had,'nothing is bought until the button');
   assert.equal(dialog.querySelector('.mf-shop-bar strong').textContent,t('shop.total',{n:STOCK[kind][bought]*2}));
   expectLanguage(id,readable(dialog),kind+' cart');
   act().click();assert.equal(economy.state.bag[bought],had+2);
   assert.equal(receipt(),t('shop.boughtItems',{items:itemName(bought)+' ×2'}));
   expectLanguage(id,readable(dialog),kind+' receipt');
   tabs()[2].click();expectLanguage(id,readable(dialog),kind+' making');
   const made=kind==='smith'?'wolf-blade':'potion',before=economy.state.bag[made]??0;
   assert.equal(act().textContent,t(kind==='smith'?'shop.makeAction':'shop.brew'));
   assert.equal(more(made).disabled,false);more(made).click();act().click();
   assert.equal(economy.state.bag[made],before+1);
   assert.equal(receipt(),t('shop.madeItems',{items:itemName(made)+' ×1'}));
   tabs()[1].click();expectLanguage(id,readable(dialog),kind+' selling');
   assert.equal(dialog.querySelector('[data-item="wolf-pelt"] .mf-shop-price').textContent,TOWN_ITEMS['wolf-pelt'].sell+' G');
   more('wolf-pelt').click();
   assert.equal(dialog.querySelector('.mf-shop-bar strong').textContent,t('shop.totalGain',{n:TOWN_ITEMS['wolf-pelt'].sell}));
   assert.equal(act().textContent,t('shop.sell'));act().click();
   assert.equal(receipt(),t('shop.soldItems',{items:itemName('wolf-pelt')+' ×1'}));
   shop.close();await closed;
  }
  shop.dispose();
 }finally{setPack('ko',ko);}
});
// Extra coverage for the town-owned inventory used by the 0.3 runtime.
for(const [id,pack] of Object.entries(PACKS))test(`owned equipment, quick-bar registration and both skill input modes in ${id}`,()=>{
 const {document,window,root}=page();setPack(id,pack);document.documentElement.lang=id;
 const wallet=new GoldLoot({storage:store()});
 const services=setupTownServices({root,wallet,world:{},legacy:()=>({}),battle:()=>null,appearance:()=>null,controls:()=>null,onPause(){},sound(){}});
 const economy=services.economy;for(const item of ['field-bow','bear-bile','wolf-fang'])economy.grant(item,1);
 let touch=true;
 const menu=createCharacterMenu({root,read:()=>({hp:340,maxHp:500,stamina:74,maxStamina:100,attackBonus:economy.attack,defense:economy.defense,
  gold:wallet.balance,tradeBag:services.bag(),touch,allows:kind=>kind!=='attack'}),
  subject:()=>null,onPause(){},equipItem:services.equip,registerItem:services.register,usePotion(){}});
 const dialog=root.querySelector('dialog');modal(dialog,window);
 const tab=name=>byText(dialog,'nav button',pack.ui['char.tab.'+name]).click();
 const tile=item=>{const name=pack.ui['item.'+item],node=[...dialog.querySelectorAll('.mf-menu-grid button')].find(b=>b.title===name);assert.ok(node,id+' tile '+name);node.click();};
 try{
  menu.show('Status');tab('Inventory');
  tile('field-bow');const note=dialog.querySelector('.mf-menu-item p').textContent;
  assert.ok(note.includes(pack.ui['item.usage.field-bow']),id+' contextual weapon description');
  byText(dialog,'.mf-menu-item button',pack.ui['char.equip']).click();assert.equal(economy.state.equipped.sword,'field-bow');
  assert.equal(dialog.querySelector('.mf-menu-equipped').textContent,pack.ui['char.equipped']);
  tab('Status');const worn=[...dialog.querySelectorAll('.mf-menu-slots button')].find(el=>el.title===pack.ui['item.field-bow']);assert.ok(worn);worn.click();
  assert.equal(dialog.dataset.page,'Inventory');assert.equal(dialog.querySelector('.mf-menu-item h2').textContent,pack.ui['item.field-bow']);
  byText(dialog,'.mf-menu-filters button',pack.ui['char.type.Supplies']).click();tile('bear-bile');
  byText(dialog,'.mf-menu-item button',pack.ui['char.quickAssign']).click();assert.equal(economy.state.quick,'bear-bile');
  assert.equal(dialog.querySelector('.mf-menu-equipped').textContent,pack.ui['char.quickSet']);
  byText(dialog,'.mf-menu-filters button',pack.ui['char.type.Materials']).click();tile('wolf-fang');
  assert.equal(dialog.querySelector('.mf-menu-item p').textContent,pack.ui['char.materialNote']);
  for(touch of [true,false]){
   tab('Skills');const nodes=[...dialog.querySelectorAll('.mf-skill-node:not(.is-open)')];
   const mode=touch?'touch':'keys';
   const hints=id==='ko'?Object.fromEntries(COMBAT_HINTS.map(h=>[h.id,h])):pack.story.hints;
   const sprint=id==='ko'?TIPS.find(x=>x.id==='sprint'):pack.story.tips.sprint;
   const controls=[hints.attack[mode],hints.heavy[mode],hints.guard[mode],pack.ui['char.skill.justGuard'+(touch?'Touch':'Keys')],hints.push[mode],hints.dodge[mode],sprint[mode]];
   assert.deepEqual(nodes.map(node=>{node.click();return dialog.querySelector('.mf-skill-keys dd').textContent;}),controls);
   assert.deepEqual(nodes.map(node=>node.querySelector('b').textContent),['combo','heavy','guard','justGuard','push','dodge','sprint'].map(k=>pack.ui['char.skill.'+k]));
   assert.deepEqual(nodes.filter(node=>node.classList.contains('is-locked')).map(node=>node.querySelector('em').textContent),[pack.ui['char.skill.lockedShort'],pack.ui['char.skill.lockedShort']]);
  }
 }finally{menu.dispose();services.dispose();setPack('ko',ko);}
});
test('forge limits in shop copy match a real near-broken sword at the attempt cap',()=>{
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('forge-test',1000);
 const initial=createTownEconomy(gold);initial.grant('ritual-blade');initial.grant('iron-scrap',3);
 const saved=structuredClone(initial.state);saved.condition['ritual-blade']={level:FORGE_RULES.maxLevel-1,bonus:30,max:FORGE_RULES.minDurability,hp:2};
 assert.equal(gold.tradeTown(0,saved),true);
 const economy=createTownEconomy(gold,{},{random:()=>.95}),id='ritual-blade',base=TOWN_ITEMS[id].attack;
 // At the durability floor an attempt wears nothing more and restores nothing; it still counts (2026-11-26, user).
 assert.deepEqual(economy.gear(id),{level:19,bonus:30,blessed:false,hp:2,max:32,attack:base+30,defense:0});
 assert.equal(economy.forge(0,id),'Failed');
 assert.deepEqual(economy.gear(id),{level:20,bonus:30,blessed:false,hp:2,max:32,attack:base+30,defense:0});
 assert.equal(economy.canForge(id),false);assert.equal(economy.forge(.5,id),null);
 for(const [lang,pack] of Object.entries(PACKS)){
  setPack(lang,pack);
  const note=t('shop.temperNote',{maxLevel:FORGE_RULES.maxLevel,minDurability:FORGE_RULES.minDurability,...FORGE_WEAR_RANGE});
  for(const value of ['+20','32','3','6'])assert.ok(note.includes(value),lang+': '+value);
  assert.equal(t('shop.forgeMaxed',FORGE_RULES).includes('+20'),true,lang);
 }
 setPack('ko',ko);
});
test('reopening the bag after a goblin pickup shows the saved material stack even after inspecting worn gear',ctx=>{
 const {window,root}=page(),storage=slotStorage(store(),'0.3',1);
 storage.setItem(GOLD_LEDGER_KEY,JSON.stringify({version:1,balance:0,credits:{},town:{version:1,bag:{'iron-scrap':2,'wolf-pelt':1}}}));
 const wallet=new GoldLoot({storage}),world={mapId:'monster-forest',v03:{playing:true}};
 const services=setupTownServices({root,world,wallet,legacy:()=>({}),battle:()=>null,appearance:()=>null,controls:()=>null});
 const origin={x:0,y:0,z:0},noop=()=>{};
 let pos=origin;
 const treasure=createTownTreasure({root,world,economy:services.economy,player:()=>pos,canInteract:()=>true,sound:noop,fieldChestsEnabled:false,
  props:{stats:{modelFailures:0},release:noop,dispose:noop},makeDrops:()=>({ready:()=>true,sync:noop,clear:noop,dispose:noop})});
 const menu=createCharacterMenu({root,read:()=>({gold:wallet.balance,tradeBag:services.bag(),hp:100,maxHp:100,stamina:100,maxStamina:100}),
  subject:()=>null,onPause:noop});
 ctx.after(()=>{menu.dispose();treasure.dispose();services.dispose();});
 const dialog=root.querySelector('.mf-character-menu');modal(dialog,window);
 menu.show('Status');
 dialog.querySelector('.mf-menu-slots button').click();
 const activeFilter=()=>dialog.querySelector('.mf-menu-filters button[aria-pressed=true]').textContent;
 assert.equal(activeFilter(),t('char.type.Gear'));
 menu.close();

 ctx.mock.method(Math,'random',()=>.4); // The warrior drops one scrap and no dagger.
 treasure.tick(.3);
 assert.ok(treasure.defeat({kind:'goblin-warrior',position:origin}));
 assert.equal(services.economy.state.bag['iron-scrap'],2);
 pos=services.economy.state.drops[0].position;
 treasure.tick(.3);treasure.tick(.3);
 assert.equal(root.querySelector('.acquisition-row strong').textContent,itemName('iron-scrap'));

 for(const reload of [false,true]){
  if(reload){wallet.reload();services.reset(true);}
  menu.show('Inventory');
  assert.equal(activeFilter(),t('char.filter.All'));
  const count=id=>dialog.querySelector('.mf-menu-grid [data-item-icon="'+id+'"]')?.closest('button').querySelector('.mf-menu-count').textContent;
  assert.equal(count('iron-scrap'),'3');
  byText(dialog,'.mf-menu-filters button',t('char.type.Materials')).click();
  assert.equal(count('iron-scrap'),'3');
  assert.equal(count('wolf-pelt'),'1');
  byText(dialog,'.mf-menu-filters button',t('char.type.Supplies')).click();
  menu.close();
 }
});
