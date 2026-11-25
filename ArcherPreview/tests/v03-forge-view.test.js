import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {FORGE_RULES,FORGE_MATERIALS,TOWN_ITEMS,forgeCursor,forgeSpeed,gradeLabel,itemName} from '../src/v03/town-items.js';
import {t} from '../src/v03/i18n.js';

// 2026-11-25, user: the smith's temper screen was bare; the hammer should speed
// up a little with each level, and a tap on the dialog (not a button) strikes.
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
function forge({level=0,materials={'wolf-fang':2,'iron-scrap':1}}={}){
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');
 let clock=1000,frames=0,cancelled=0;const timers=[];
 Object.defineProperty(window,'performance',{value:{now:()=>clock},configurable:true});
 window.requestAnimationFrame=()=>++frames;window.cancelAnimationFrame=()=>{cancelled++;};
 window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};window.clearTimeout=id=>{if(timers[id-1])timers[id-1].fn=null;};
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('forge-view',5000);
 const economy=createTownEconomy(gold);economy.grant('goblin-cleaver');economy.equip('goblin-cleaver');
 for(const [id,n] of Object.entries(materials))economy.grant(id,n);
 economy.state.condition['goblin-cleaver'].level=level;
 let changes=0;const shop=createTownShop({root:document.getElementById('app'),economy,onChange:()=>changes++,onPause(){}});
 const dialog=document.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 void shop.show('smith');
 const button=label=>[...dialog.querySelectorAll('button')].find(node=>node.textContent===label);
 button(t('shop.forge',{cost:economy.forgeCost('goblin-cleaver')})).click();
 return {document,window,dialog,economy,shop,button,timers,get changes(){return changes;},get frames(){return frames;},get cancelled(){return cancelled;},
  at(ms){clock=1000+ms;},tap(target=dialog.querySelector('.mf-forge')){target.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));}};
}

test('the hammer mark speeds up 5% per level, the same zones at every level',()=>{
 assert.equal(forgeSpeed(0),1);assert.equal(forgeSpeed(12),1+12*FORGE_RULES.speedGain);assert.equal(forgeSpeed(99),forgeSpeed(FORGE_RULES.maxLevel));
 assert.equal(forgeCursor(450),.5);assert.equal(forgeCursor(450),forgeCursor(450,0),'existing calls keep their position');
 for(const level of [1,6,12]){
  const sweep=900/forgeSpeed(level);
  assert.ok(Math.abs(forgeCursor(sweep/2,level)-.5)<1e-9,level+': centre at half a sweep');
  assert.ok(Math.abs(forgeCursor(sweep,level)-1)<1e-9,level+': edge at a full sweep');
 }
});

test('the temper view shows the item, what changes, the cost, the material and the four zones; no strike button',()=>{
 const h=forge({level:4});
 try{
  const card=h.dialog.querySelector('.mf-forge-item'),item=TOWN_ITEMS['goblin-cleaver'];
  assert.equal(card.querySelector('.mf-forge-icon b').textContent,'+4');
  assert.equal(card.querySelector('strong').textContent,itemName('goblin-cleaver')+' +4');
  const [attack,durability]=[...card.querySelectorAll('dl>div')];
  assert.equal(attack.querySelector('dt').textContent,t('char.attack'));
  assert.equal(attack.querySelector('dd').textContent,'+'+(item.attack+4*2)+' → +'+(item.attack+5*2)+' '+t('shop.forgeOnPerfect',{value:'+'+(item.attack+6*2)}));
  const max=level=>Math.max(FORGE_RULES.minDurability,item.max-level*FORGE_RULES.durabilityCost);
  assert.equal(durability.querySelector('dd').textContent,max(4)+' → '+max(5));
  const material=FORGE_MATERIALS.find(id=>h.economy.state.bag[id]);
  assert.equal(material,'iron-scrap');
  assert.equal(card.querySelector('.mf-forge-cost').textContent,t('shop.forgeCost',{cost:h.economy.forgeCost('goblin-cleaver'),material:itemName(material),n:1}));
  assert.equal(h.dialog.querySelectorAll('.mf-forge-legend li').length,4);
  assert.equal(h.button(t('shop.strike')),undefined);
  assert.match(h.dialog.querySelector('.mf-forge-hint').textContent,new RegExp('×'+forgeSpeed(4).toFixed(2).replace('.','\\.')));
  assert.match(h.dialog.querySelector('.mf-forge-rail').style.transform,/^translateX\(/);
  assert.equal(h.dialog.querySelector('.mf-forge-rail').style.left||'','','the mark moves by transform only');
 }finally{h.shop.dispose();}
});

test('a tap on the dialog strikes once at the mark position; the result stays, its buttons wait, the hammer stops',()=>{
 const h=forge({level:4});
 try{
  const before=h.economy.state.bag['iron-scrap'];
  // A tap on the header's Back button does not strike.
  h.tap(h.dialog.querySelector('header button'));assert.equal(h.dialog.querySelector('.mf-forge').classList.contains('is-struck'),false);
  h.at(450/forgeSpeed(4));h.tap(h.dialog);
  const area=h.dialog.querySelector('.mf-forge');
  assert.equal(area.dataset.grade,'perfect');assert.equal(h.dialog.querySelector('.mf-forge-result strong').textContent,gradeLabel('Perfect'));
  assert.equal(h.economy.gear().level,6);assert.equal(h.economy.state.bag['iron-scrap']??0,before-1,'the shown material is the one used');
  assert.equal(h.economy.gear().max,Math.max(FORGE_RULES.minDurability,TOWN_ITEMS['goblin-cleaver'].max-6*FORGE_RULES.durabilityCost),'the previewed durability');
  assert.equal(h.changes,1);assert.ok(h.cancelled>=1,'the hammer animation stopped');
  assert.equal(h.dialog.querySelector('.mf-forge-icon b').textContent,'+6','the card shows the new level');
  assert.equal(area.querySelectorAll('.mf-forge-spark').length,10);
  // Further taps and keys do nothing; the buttons are held for a moment.
  const gold=h.economy.gold;h.tap(h.dialog);h.dialog.dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true}),{code:'Space'}));
  assert.equal(h.economy.gold,gold);assert.equal(h.economy.gear().level,6);
  const again=h.button(t('shop.forgeAgain',{cost:h.economy.forgeCost('goblin-cleaver')}));
  assert.equal(again.disabled,true);
  const arm=h.timers.find(timer=>timer.ms===450);arm.fn();
  assert.equal(again.disabled,false);
  // Again: a fresh sweep at the new speed; a key press strikes too.
  again.click();assert.match(h.dialog.querySelector('.mf-forge-hint').textContent,new RegExp('×'+forgeSpeed(6).toFixed(2).replace('.','\\.')));
  h.at(450/forgeSpeed(4)+10000);
  h.dialog.querySelector('.mf-forge').dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true}),{code:'Enter'}));
  assert.equal(h.dialog.querySelector('.mf-forge').classList.contains('is-struck'),true);
  // Back to the shop: the receipt names the last grade.
  h.button(t('panel.back')).click();
  assert.equal(h.dialog.querySelector('.mf-forge'),null);
  assert.match(h.dialog.querySelector('.mf-shop-receipt').textContent,new RegExp(itemName('goblin-cleaver')));
 }finally{h.shop.dispose();}
});

test('at the cap the result says so and offers no further temper',()=>{
 const h=forge({level:FORGE_RULES.maxLevel-1,materials:{'iron-scrap':3}});
 try{
  h.at(450/forgeSpeed(FORGE_RULES.maxLevel-1));h.tap();
  assert.equal(h.economy.gear().level,FORGE_RULES.maxLevel);
  h.timers.find(timer=>timer.ms===450).fn();
  const maxed=h.button(t('shop.forgeMaxed',FORGE_RULES));
  assert.ok(maxed);assert.equal(maxed.disabled,true);
 }finally{h.shop.dispose();}
});
