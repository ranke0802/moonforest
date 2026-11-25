import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {FORGE_RULES,FORGE_MATERIALS,TOWN_ITEMS,forgeCursor,forgeZones,gradeStrike,gradeLabel,itemName} from '../src/v03/town-items.js';
import {t} from '../src/v03/i18n.js';

// 2026-11-25, user: the smith's temper screen was bare; a tap on the dialog (not a
// button) strikes; the zones narrow a little per level, the hammer keeps its speed.
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

test('the zones narrow 3% per level and the economy grades with the level before the strike; the hammer keeps its speed',()=>{
 assert.deepEqual(['.5','.35','.24','0'].map(Number).map(p=>gradeStrike(p)),['Perfect','Success','Near miss','Failed'],'+0 unchanged');
 assert.equal(forgeCursor(450),.5);assert.equal(forgeCursor(900),1);
 const top=forgeZones(FORGE_RULES.maxLevel);
 assert.ok(Math.abs(top.scale-(1-12*FORGE_RULES.zoneShrink))<1e-12);assert.ok(Math.abs(top.perfect-.12*top.scale)<1e-12);
 assert.deepEqual(forgeZones(99),forgeZones(FORGE_RULES.maxLevel));
 // A strike just inside the +0 perfect edge is a success at +12.
 const edge=.5+.11/2;
 assert.equal(gradeStrike(edge,0),'Perfect');assert.equal(gradeStrike(edge,12),'Success');
 for(let level=0;level<FORGE_RULES.maxLevel;level++){
  const a=forgeZones(level),b=forgeZones(level+1);
  assert.ok(b.perfect<a.perfect&&b.success<a.success&&b.near<a.near,level+': every zone narrows');
 }
 // The economy uses the item's level before the strike.
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('zones',5000);
 const economy=createTownEconomy(gold);economy.grant('goblin-cleaver');economy.equip('goblin-cleaver');economy.grant('iron-scrap',2);
 economy.state.condition['goblin-cleaver'].level=12-1;
 const z11=forgeZones(11);assert.ok(z11.perfect/2+.002<.12/2,'inside the +0 perfect zone');
 assert.equal(economy.forge(.5+z11.perfect/2+.002),'Success','just outside the +11 perfect zone (inside the +0 one)');
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
  const zone=forgeZones(4);
  assert.ok(h.dialog.querySelector('.mf-forge-hint').textContent.endsWith(t('shop.forgeZone',{n:Math.round(zone.scale*100)})));
  const art=h.dialog.querySelector('.mf-forge-gauge').style.getPropertyValue('--mf-forge-art');
  assert.match(art,/^linear-gradient\(to right,#000 0 /,'failed is plain black');
  assert.ok(art.includes((50-zone.perfect*50).toFixed(2)+'%')&&art.includes((50+zone.near*50).toFixed(2)+'%'),'stops follow this level\'s zones');
  assert.equal(h.dialog.querySelector('.mf-forge-glow').style.width,(zone.perfect*100).toFixed(2)+'%','the glow covers the perfect zone');
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
  h.at(450);h.tap(h.dialog);
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
  again.click();assert.ok(h.dialog.querySelector('.mf-forge-hint').textContent.endsWith(t('shop.forgeZone',{n:Math.round(forgeZones(6).scale*100)})),'narrower at +6');
  h.at(450+10000);
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
  h.at(450);h.tap();
  assert.equal(h.economy.gear().level,FORGE_RULES.maxLevel);
  h.timers.find(timer=>timer.ms===450).fn();
  const maxed=h.button(t('shop.forgeMaxed',FORGE_RULES));
  assert.ok(maxed);assert.equal(maxed.disabled,true);
 }finally{h.shop.dispose();}
});
