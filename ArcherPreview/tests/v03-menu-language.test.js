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
import {setPack,t} from '../src/v03/i18n.js';
import {GoldLoot} from '../src/gold-loot.js';
import {POTION} from '../src/healing-potion.js';
import {createCharacterMenu} from '../src/v03/character-menu.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {TOWN_ITEMS,BOOSTS,itemName,itemNote,gradeLabel,gradeStrike} from '../src/v03/town-items.js';

const PACKS={ko,en,ja};
const latinWord=/[A-Za-z]{3,}/,hangul=/[가-힣]/;
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
 if(id==='ko')assert.ok(!latinWord.test(text),`${where}: English left in Korean: ${text.match(latinWord)?.[0]}`);
 else assert.ok(!hangul.test(text),`${where}: Korean left in ${id}: ${text.match(/[가-힣][^\n]{0,20}/)?.[0]}`);
}
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};

test('every village item, use and supply note has a name in all five languages',async()=>{
 for(const id of Object.keys(TOWN_ITEMS)){
  assert.ok(ko.ui['item.'+id],'item.'+id);assert.equal(TOWN_ITEMS[id].name,undefined,id+' keeps no hardcoded name');
  if(TOWN_ITEMS[id].usage)assert.ok(ko.ui['item.usage.'+id],'item.usage.'+id);
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

for(const id of ['ko','en','ja'])test(`character menu status, inventory and skills read ${id}`,()=>{
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
  menu.show('Skills');assert.equal(dialog.querySelectorAll('.mf-menu-skills dt').length,7);
  assert.ok(dialog.querySelector('.mf-menu-skills small'),'locked lessons are marked');
  menu.dispose();
 }finally{setPack('ko',ko);}
});

for(const id of ['ko','en'])test(`village shops and the forge read ${id}`,async()=>{
 setPack(id,PACKS[id]);
 try{
  const {window,root}=page();root.ownerDocument.documentElement.lang=id;
  const gold=new GoldLoot({storage:store()});gold.creditCumulative('test-grant',500);
  const economy=createTownEconomy(gold);for(const item of ['wolf-fang','iron-scrap','wolf-pelt','bear-hide'])economy.grant(item,2);
  const shop=createTownShop({root,economy,onChange(){},onPause(){}}),dialog=root.querySelector('dialog');modal(dialog,window);
  for(const kind of ['smith','herbalist']){
   const closed=shop.show(kind);expectLanguage(id,readable(dialog),kind);
   [...dialog.querySelectorAll('button')].find(b=>/^\d+ G$/.test(b.textContent)).click();
   expectLanguage(id,readable(dialog),kind+' receipt');
   if(kind==='smith'){
    const forge=[...dialog.querySelectorAll('button')].find(b=>b.textContent===t('shop.forge',{cost:economy.forgeCost(economy.state.equipped.sword)}));
    assert.ok(forge&&!forge.disabled,'forge is offered');forge.click();expectLanguage(id,readable(dialog),'forge');
   }
   shop.close();await closed;
  }
  shop.dispose();
 }finally{setPack('ko',ko);}
});
