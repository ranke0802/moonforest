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
import {GoldLoot} from '../src/gold-loot.js';
import {POTION} from '../src/healing-potion.js';
import {createCharacterMenu} from '../src/v03/character-menu.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {TOWN_ITEMS,BOOSTS,FORGE_RULES,itemName,itemNote,gradeLabel,gradeStrike} from '../src/v03/town-items.js';

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
 assert.deepEqual([.5,.35,.24,0].map(gradeStrike).map(gradeLabel),['완벽','성공','아깝게 빗나감','실패']);
 setPack('en',en);assert.equal(itemName('cave-fang'),'Black Wolf Fangblade');assert.equal(gradeLabel('Near miss'),'Near miss');
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
  const economy=createTownEconomy(gold);for(const item of ['wolf-fang','iron-scrap','wolf-pelt','bear-hide'])economy.grant(item,2);
  economy.grant('moon-herb',2);economy.grant('iron-scrap',2);economy.grant('leather-coat');
  const shop=createTownShop({root,economy,onChange(){},onPause(){}}),dialog=root.querySelector('dialog');modal(dialog,window);
  for(const kind of ['smith','herbalist']){
   const closed=shop.show(kind);expectLanguage(id,readable(dialog),kind);
   [...dialog.querySelectorAll('button')].find(b=>/^\d+ G$/.test(b.textContent)).click();
   expectLanguage(id,readable(dialog),kind+' receipt');
   if(kind==='smith'){
    for(const gear of ['field-sword','leather-coat','field-shield']){
     const picker=dialog.querySelector('select');[...picker.options].find(o=>o.value===gear).selected=true;picker.dispatchEvent(new window.Event('change'));
     const bonus=gear==='field-sword'?t('shop.attack',{n:FORGE_RULES.attackGain}):t('shop.defense',{n:FORGE_RULES.defenseGain});
     const note=byText(dialog,'.mf-shop-row small',t('shop.temperNote',{...FORGE_RULES,bonus}));
     for(const value of [bonus,FORGE_RULES.minDurability,FORGE_RULES.maxLevel,FORGE_RULES.perfectGain,FORGE_RULES.durabilityCost,FORGE_RULES.failureLoss])assert.ok(note.textContent.includes(String(value)));
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
    assert.ok(zones[3].textContent.includes(String(FORGE_RULES.failureLoss)));
    assert.equal(dialog.querySelector('[role="img"]').getAttribute('aria-label'),PACKS[id].ui['shop.gauge']);
    assert.equal(dialog.querySelector('.mf-forge').getAttribute('aria-label'),PACKS[id].ui['shop.forgeTap']);
    // No strike button: a tap anywhere on the temper view strikes.
    assert.equal([...dialog.querySelectorAll('button')].some(b=>b.textContent===t('shop.strike')),false);
    dialog.querySelector('.mf-forge-gauge').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
    const grade=dialog.querySelector('.mf-forge-result strong').textContent;
    assert.ok(['Perfect','Success','Near miss','Failed'].some(value=>gradeLabel(value)===grade),id+' forge result: '+grade);
    expectLanguage(id,readable(dialog),'forge result');
    byText(dialog,'header button',t('panel.back')).click();
    assert.equal(dialog.querySelector('.mf-shop-receipt').textContent.split(' · ')[0],grade);
   }
   const made=kind==='smith'?'wolf-blade':'potion',before=economy.state.bag[made]??0,cost=kind==='smith'?22:2;
   const button=byText(dialog,'button',t('shop.make',{cost}));assert.equal(button.disabled,false);button.click();
   assert.equal(economy.state.bag[made],before+1);
   assert.equal(dialog.querySelector('.mf-shop-receipt').textContent,t('shop.made',{name:itemName(made)}));
   const sale=[...dialog.querySelectorAll('.mf-shop-row')].find(row=>row.querySelector('strong').textContent===itemName('wolf-pelt')&&row.querySelector('button')?.textContent===t('shop.sellFor',{price:TOWN_ITEMS['wolf-pelt'].sell}));
   assert.ok(sale);sale.querySelector('button').click();
   assert.equal(dialog.querySelector('.mf-shop-receipt').textContent,t('shop.sold',{name:itemName('wolf-pelt')}));
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
test('forge limits in shop copy match a real near-broken sword at the reinforcement cap',()=>{
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('forge-test',1000);
 const initial=createTownEconomy(gold);initial.grant('ritual-blade');initial.grant('iron-scrap',3);
 const saved=structuredClone(initial.state);saved.condition['ritual-blade']={level:11,hp:2};
 assert.equal(gold.tradeTown(0,saved),true);
 const economy=createTownEconomy(gold),id='ritual-blade';
 // At the floor a failure takes nothing more, and a perfect strike restores nothing (11:14, user).
 assert.equal(economy.gear(id).max,32);assert.equal(economy.forge(0,id),'Failed');assert.equal(economy.gear(id).hp,2);assert.equal(economy.gear(id).max,32);
 assert.equal(economy.forge(.5,id),'Perfect');assert.equal(economy.gear(id).level,12);assert.equal(economy.gear(id).max,32);assert.equal(economy.gear(id).hp,2);
 assert.equal(economy.canForge(id),false);assert.equal(economy.forge(.5,id),null);
});
