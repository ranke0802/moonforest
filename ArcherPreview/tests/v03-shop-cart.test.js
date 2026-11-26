// 2026-11-26, user: every shop works the same way. Beside each item's name and price
// the player picks a quantity; one button, always at the bottom, buys (or sells, or
// makes) what was picked. On a keyboard W/S move between items and A/D change the quantity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {parseHTML} from 'linkedom';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {createTownShop} from '../src/v03/town-shop.js';
import {STOCK,RECIPES,TOWN_ITEMS,itemName} from '../src/v03/town-items.js';
import {setPack,t} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';

const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
function open(kind='herbalist',{gold:amount=200,grant={},view}={}){
 setPack('ko',ko);
 const {document,window}=parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');
 // Linkedom dispatches focus events but supplies neither activeElement nor native
 // dialog autofocus and button activation. Model those keyboard contracts here.
 let focused=document.body;
 const create=document.createElement.bind(document);
 document.createElement=(...args)=>{
  const node=create(...args);node.addEventListener('focus',()=>{focused=node;});return node;
 };
 Object.defineProperty(document,'activeElement',{get:()=>document.contains(focused)?focused:document.body});
 const storage=store(),gold=new GoldLoot({storage});gold.creditCumulative('cart',amount);
 const economy=createTownEconomy(gold,{},{random:()=>.5});for(const [id,n] of Object.entries(grant))economy.grant(id,n);
 let changes=0,pauses=0;
 const shop=createTownShop({root:document.getElementById('app'),economy,onChange:()=>changes++,onPause:()=>pauses++});
 const dialog=document.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;dialog.querySelector('button').focus();};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 const closed=shop.show(kind,view);
 const line=id=>dialog.querySelector('.mf-shop-row[data-item="'+id+'"]');
 const press=(code,target=document.activeElement)=>{
  const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'code',{value:code});target.dispatchEvent(event);
  if(!event.defaultPrevented&&code==='Enter'&&target.localName==='button'&&!target.disabled)target.click();
  return event;
 };
 return {document,window,dialog,economy,shop,storage,closed,line,press,
  get changes(){return changes;},
  rows:()=>[...dialog.querySelectorAll('.mf-shop-row[data-item]')],
  count:id=>line(id).querySelector('.mf-shop-step output').textContent,
  less:id=>line(id).querySelector('.mf-shop-step button:first-child'),
  more:id=>line(id).querySelector('.mf-shop-step button:last-child'),
  tabs:()=>[...dialog.querySelectorAll('.mf-shop-tabs button')],
  act:()=>dialog.querySelector('.mf-shop-act'),
  sum:()=>dialog.querySelector('.mf-shop-bar strong').textContent,
  receipt:()=>dialog.querySelector('.mf-shop-receipt').textContent,
  selected:()=>[...dialog.querySelectorAll('.mf-shop-row[data-item]')].findIndex(node=>node.classList.contains('is-selected'))};
}

test('each row shows its price and a quantity; nothing is bought until the bottom button, which bills the whole cart once',()=>{
 const s=open('herbalist');
 try{
  assert.deepEqual(s.rows().map(node=>node.dataset.item),Object.keys(STOCK.herbalist));
  for(const [id,cost] of Object.entries(STOCK.herbalist)){
   assert.equal(s.line(id).querySelector('strong').textContent,itemName(id));
   assert.equal(s.line(id).querySelector('.mf-shop-price').textContent,cost+' G');
   assert.equal(s.count(id),'0');assert.equal(s.less(id).disabled,true);assert.equal(s.more(id).disabled,false);
   assert.equal(s.less(id).getAttribute('aria-label'),t('shop.less',{name:itemName(id)}));
   assert.equal(s.more(id).getAttribute('aria-label'),t('shop.more',{name:itemName(id)}));
   assert.equal(s.line(id).querySelectorAll('button').length,2,'no per-row buy button');
  }
  // The bar is the dialog's last child and holds the only buy button.
  assert.equal(s.dialog.lastElementChild.className,'mf-shop-bar');
  assert.equal(s.act().textContent,'구매');assert.equal(s.act().disabled,true);assert.equal(s.sum(),'합계 0 G');
  const before=s.economy.state.bag.potion??0;
  for(let i=0;i<3;i++)s.more('potion').click();s.more('moon-herb').click();s.more('moon-herb').click();s.less('potion').click();
  assert.equal(s.count('potion'),'2');assert.equal(s.count('moon-herb'),'2');
  assert.ok(s.line('potion').classList.contains('is-picked'));assert.equal(s.line('stamina-tonic').classList.contains('is-picked'),false);
  assert.equal(s.sum(),'합계 '+(STOCK.herbalist.potion*2+STOCK.herbalist['moon-herb']*2)+' G');
  assert.equal(s.economy.gold,200);assert.equal(s.economy.state.bag.potion??0,before);assert.equal(s.changes,0);
  assert.equal(s.act().disabled,false);s.act().click();
  assert.equal(s.economy.gold,200-38);assert.equal(s.economy.state.bag.potion,before+2);assert.equal(s.economy.state.bag['moon-herb'],2);
  assert.equal(s.changes,1,'one change for the whole cart');
  assert.equal(s.receipt(),'구매했습니다 · '+itemName('potion')+' ×2, '+itemName('moon-herb')+' ×2');
  assert.equal(s.count('potion'),'0');assert.equal(s.act().disabled,true);assert.equal(s.sum(),'합계 0 G');
  assert.equal(s.dialog.querySelector('header strong').textContent,'162 G','the purse in the header follows');
  // Saved: another reader of the same storage sees the purchase.
  assert.equal(createTownEconomy(new GoldLoot({storage:s.storage})).state.bag['moon-herb'],2);
 }finally{s.shop.dispose();}
});

test('the quantity cannot pass what the purse covers; gear is one per trade and goods stop at 99',()=>{
 const s=open('herbalist',{gold:40});
 try{
  // 40 G: two potions (30) leave room for two herbs (8), not a third potion or a tonic.
  s.more('potion').click();s.more('potion').click();
  assert.equal(s.more('potion').disabled,true);assert.equal(s.more('stamina-tonic').disabled,true);assert.equal(s.more('moon-herb').disabled,false);
  s.more('potion').click();assert.equal(s.count('potion'),'2','a press on a full cart adds nothing');
  s.more('moon-herb').click();s.more('moon-herb').click();assert.equal(s.more('moon-herb').disabled,true);assert.equal(s.sum(),'합계 38 G');
  s.less('potion').click();assert.equal(s.more('stamina-tonic').disabled,true,'17 G left of 40 is not 29');assert.equal(s.more('potion').disabled,false);
 }finally{s.shop.dispose();}
 const rich=open('herbalist',{gold:5000});
 try{
  for(let i=0;i<120;i++)rich.more('moon-herb').click();
  assert.equal(rich.count('moon-herb'),'99');assert.equal(rich.more('moon-herb').disabled,true);
  rich.act().click();assert.equal(rich.economy.state.bag['moon-herb'],99);assert.equal(rich.economy.gold,5000-99*STOCK.herbalist['moon-herb']);
 }finally{rich.shop.dispose();}
 const smith=open('smith',{gold:5000});
 try{
  smith.more('oathblade').click();assert.equal(smith.count('oathblade'),'1');assert.equal(smith.more('oathblade').disabled,true);
  smith.more('oak-shield').click();smith.more('iron-scrap').click();smith.more('iron-scrap').click();
  assert.equal(smith.sum(),'합계 '+(STOCK.smith.oathblade+STOCK.smith['oak-shield']+STOCK.smith['iron-scrap']*2)+' G');
  smith.act().click();
  assert.deepEqual(['oathblade','oak-shield','iron-scrap'].map(id=>smith.economy.state.bag[id]),[1,1,2]);
 }finally{smith.shop.dispose();}
 // The economy refuses a cart it cannot pay for, whole: nothing is given, nothing is charged.
 const poor=open('herbalist',{gold:20});
 try{
  const bag=structuredClone(poor.economy.state.bag);
  assert.equal(poor.economy.buyAll('herbalist',{potion:1,'moon-herb':2}),false);
  assert.equal(poor.economy.buyAll('herbalist',{potion:0}),false);assert.equal(poor.economy.buyAll('herbalist',{'oathblade':1}),false,'not this shop\'s stock');
  assert.equal(poor.economy.buyAll('herbalist',{potion:1.5}),false);assert.equal(poor.economy.buyAll('nobody',{potion:1}),false);
  assert.deepEqual(poor.economy.state.bag,bag);assert.equal(poor.economy.gold,20);
  assert.equal(poor.economy.buy('herbalist','moon-herb',5),true);assert.equal(poor.economy.gold,0);assert.equal(poor.economy.state.bag['moon-herb'],5);
 }finally{poor.shop.dispose();}
});

test('the three tabs share the pattern: selling pays for the picked stacks, making takes the materials for each piece',()=>{
 const s=open('smith',{gold:100,grant:{'wolf-pelt':3,'wolf-fang':4,'iron-scrap':5,'boar-tusk':1}});
 try{
  assert.deepEqual(s.tabs().map(tab=>tab.textContent),['구매','판매','장비 제작']);
  assert.deepEqual(s.tabs().map(tab=>tab.getAttribute('aria-selected')),['true','false','false']);
  s.more('iron-scrap').click();
  // Changing tab drops the cart and the receipt.
  s.tabs()[1].click();assert.deepEqual(s.tabs().map(tab=>tab.getAttribute('aria-selected')),['false','true','false']);
  assert.equal(s.act().textContent,'판매');assert.equal(s.act().disabled,true);assert.equal(s.sum(),'받을 돈 0 G');
  assert.ok(s.rows().every(node=>(s.economy.state.bag[node.dataset.item]??0)>0&&TOWN_ITEMS[node.dataset.item].sell>0),'only what the bag holds and the shop pays for');
  assert.equal(s.line('wolf-pelt').querySelector('.mf-shop-price').textContent,TOWN_ITEMS['wolf-pelt'].sell+' G');
  for(let i=0;i<5;i++)s.more('wolf-pelt').click();
  assert.equal(s.count('wolf-pelt'),'3','no more than the bag holds');assert.equal(s.more('wolf-pelt').disabled,true);
  s.less('wolf-pelt').click();assert.equal(s.sum(),'받을 돈 '+TOWN_ITEMS['wolf-pelt'].sell*2+' G');
  s.act().click();
  assert.equal(s.economy.state.bag['wolf-pelt'],1);assert.equal(s.economy.gold,100+TOWN_ITEMS['wolf-pelt'].sell*2);
  assert.equal(s.receipt(),'판매했습니다 · '+itemName('wolf-pelt')+' ×2');
  // Making: the row lists what the piece needs and what the bag has.
  s.tabs()[2].click();assert.equal(s.act().textContent,'제작');assert.equal(s.receipt(),'');
  assert.deepEqual(s.rows().map(node=>node.dataset.item),Object.keys(RECIPES.smith));
  const recipe=RECIPES.smith['wolf-blade'];
  assert.equal(s.line('wolf-blade').querySelector('.mf-shop-price').textContent,recipe.gold+' G');
  assert.match(s.line('wolf-blade').querySelector('small').textContent,new RegExp(itemName('wolf-fang')+' 4/2'));
  assert.equal(s.more('alpha-fang-blade').disabled,true,'no alpha fang in the bag');
  s.more('wolf-blade').click();s.more('hunter-knife').click();
  assert.equal(s.sum(),'합계 '+(recipe.gold+RECIPES.smith['hunter-knife'].gold)+' G');
  const gold=s.economy.gold;s.act().click();
  assert.equal(s.economy.gold,gold-recipe.gold-RECIPES.smith['hunter-knife'].gold);
  assert.deepEqual(['wolf-blade','hunter-knife','wolf-fang','iron-scrap','boar-tusk'].map(id=>s.economy.state.bag[id]??0),[1,1,2,2,0]);
  assert.equal(s.receipt(),'만들었습니다 · '+itemName('wolf-blade')+' ×1, '+itemName('hunter-knife')+' ×1');
  // The economy makes a cart whole or not at all.
  assert.equal(s.economy.craftAll('smith',{'wolf-blade':1,'hunter-knife':1}),null,'no tusk left for the knife');
  assert.equal(s.economy.state.bag['wolf-fang'],2,'the blade\'s fangs were not taken');
  assert.equal(s.economy.sellAll('smith',{'wolf-pelt':2}),false);assert.equal(s.economy.state.bag['wolf-pelt'],1);
 }finally{s.shop.dispose();}
 const herbalist=open('herbalist',{grant:{'moon-herb':6}});
 try{
  assert.deepEqual(herbalist.tabs().map(tab=>tab.textContent),['구매','판매','조제']);
  herbalist.tabs()[2].click();assert.equal(herbalist.act().textContent,'조제');
  const before=herbalist.economy.state.bag.potion??0;
  herbalist.more('potion').click();herbalist.more('potion').click();herbalist.act().click();
  assert.equal(herbalist.economy.state.bag.potion,before+2);
  assert.equal(herbalist.receipt(),'만들었습니다 · '+itemName('potion')+' ×2');
  // With nothing to sell the tab says so and the button stays off.
  const empty=open('herbalist',{gold:10});
  try{
   for(const id of Object.keys(empty.economy.state.bag))empty.economy.state.bag[id]=0;
   empty.tabs()[1].click();assert.equal(empty.rows().length,0);assert.equal(empty.dialog.querySelector('.mf-shop-scroll p').textContent,'팔 수 있는 물건이 없습니다.');
   assert.equal(empty.act().disabled,true);
  }finally{empty.shop.dispose();}
 }finally{herbalist.shop.dispose();}
});

test('keyboard: W/S or the arrows move between items, A/D change the quantity, Enter presses the bottom button',()=>{
 const s=open('herbalist');
 try{
  const ids=Object.keys(STOCK.herbalist);
  assert.equal(s.selected(),0);
  assert.equal(s.press('KeyW').defaultPrevented,true);assert.equal(s.selected(),0,'stays on the first row');
  s.press('KeyS');assert.equal(s.selected(),1);s.press('ArrowDown');assert.equal(s.selected(),2);
  s.press('KeyS');assert.equal(s.selected(),2,'stays on the last row');
  s.press('ArrowUp');assert.equal(s.selected(),1);s.press('KeyW');assert.equal(s.selected(),0);
  s.press('KeyD');s.press('ArrowRight');s.press('KeyD');assert.equal(s.count(ids[0]),'3');
  s.press('KeyA');s.press('ArrowLeft');assert.equal(s.count(ids[0]),'1');
  s.press('KeyA');s.press('KeyA');assert.equal(s.count(ids[0]),'0','never below nothing');
  s.press('KeyS');s.press('KeyS');s.press('KeyD');s.press('KeyD');assert.equal(s.count(ids[2]),'2');
  // A click on a row's stepper moves the selection there too.
  s.more(ids[1]).click();assert.equal(s.selected(),1);s.less(ids[1]).click();
  assert.equal(s.press('KeyQ').defaultPrevented,false,'other keys pass');
  const before=s.economy.state.bag[ids[2]]??0;
  assert.equal(s.press('Enter').defaultPrevented,true);
  assert.equal(s.economy.state.bag[ids[2]],before+2);assert.equal(s.receipt(),'구매했습니다 · '+itemName(ids[2])+' ×2');
  // Enter on a focused button is that button's own press, not a second purchase.
  s.press('KeyD');const gold=s.economy.gold;
  assert.equal(s.press('Enter',s.tabs()[0]).defaultPrevented,false);assert.equal(s.economy.gold,gold);
  // With an empty cart Enter does nothing.
  s.press('KeyA');s.press('Enter');assert.equal(s.economy.gold,gold);
 }finally{s.shop.dispose();}
});

test('keyboard checkout keeps focus in the list after opening, changing tab and buying or selling',()=>{
 const s=open('herbalist',{gold:40});
 try{
  const active=()=>s.document.activeElement;
  assert.ok(active()===s.line('potion'),'the initial row receives focus instead of Close');
  s.press('KeyS');s.press('KeyS');s.press('KeyD');s.press('Enter');
  assert.equal(s.shop.open,true);assert.equal(s.economy.gold,36);assert.equal(s.economy.state.bag['moon-herb'],1);
  assert.ok(active()===s.line('moon-herb'),'checkout replaced the row');
  const plus=s.more('moon-herb');
  plus.focus();s.press('Enter');
  assert.equal(s.count('moon-herb'),'1','Enter on the stepper still activates the button');
  s.press('KeyD');s.press('Enter');
  assert.equal(s.economy.gold,28);assert.equal(s.economy.state.bag['moon-herb'],3,'keyboard quantity change resumes list checkout');
  s.tabs()[1].focus();s.press('Enter');
  assert.ok(active()===s.line('moon-herb'),'arrive on the sale list');
  for(let i=0;i<3;i++)s.press('KeyD');
  s.press('Enter');
  assert.equal(s.economy.gold,34);assert.equal(s.economy.state.bag['moon-herb'],undefined);
  assert.ok(active()===s.tabs()[1],'an empty sale list returns focus to its tab');
  s.dialog.querySelector('header button').focus();s.press('Enter');
  assert.equal(s.shop.open,false,'the close button keeps native Enter activation');
 }finally{s.shop.dispose();}
});

test('the smith\'s shop and bench are separate views; the shop reopens on the buying tab with an empty cart',async()=>{
 const s=open('smith',{gold:300});
 assert.equal(s.dialog.dataset.mode,'shop');assert.equal(s.dialog.querySelector('select'),null);
 assert.equal(s.dialog.querySelector('h2').textContent,'대장장이');
 s.tabs()[1].click();s.shop.close();await s.closed;assert.equal(s.shop.open,false);
 const bench=s.shop.show('smith','forge');
 assert.equal(s.dialog.dataset.mode,'forge');assert.equal(s.dialog.querySelector('h2').textContent,'작업대');
 assert.ok(s.dialog.querySelector('select'));assert.equal(s.dialog.querySelector('.mf-shop-tabs'),null);assert.equal(s.dialog.querySelector('.mf-shop-bar'),null);
 assert.equal(s.press('KeyS').defaultPrevented,false,'the list keys belong to the shop');
 s.shop.close();await bench;
 const again=s.shop.show('smith');
 assert.deepEqual(s.tabs().map(tab=>tab.getAttribute('aria-selected')),['true','false','false']);assert.equal(s.act().disabled,true);
 s.shop.close();await again;
 // The herbalist has no bench: asking for it opens her shop.
 const herbs=s.shop.show('herbalist','forge');assert.equal(s.dialog.dataset.mode,'shop');assert.equal(s.dialog.querySelector('h2').textContent,'약초사');
 s.shop.close();await herbs;s.shop.dispose();
});

test('the list scrolls inside the dialog and the bottom bar stays in view; the temper view keeps its own layout',()=>{
 const css=postcss.parse(readFileSync(new URL('../src/v03/town-shop.css',import.meta.url),'utf8'));
 const value=(selector,name)=>{let found;css.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(name,decl=>{found=decl.value;});});return found;};
 const frame='.mf-town-shop[open]:not(.is-forging)';
 assert.equal(value(frame,'display'),'flex');assert.equal(value(frame,'flex-direction'),'column');assert.equal(value(frame,'overflow'),'hidden');
 assert.equal(value(frame+'>.mf-shop-scroll','flex'),'1 1 auto');assert.equal(value(frame+'>.mf-shop-scroll','min-height'),'0');
 assert.equal(value('.mf-shop-scroll','overflow'),'auto');
 assert.equal(value('.mf-shop-bar','flex'),'none');
 assert.equal(value('.mf-town-shop.is-forging','overflow-y'),'auto');
 // Thumb-sized steppers: at least 2.65rem tall (every shop button) and 2.75rem wide.
 assert.equal(value('.mf-town-shop .mf-shop-step button','min-width'),'2.75rem');
 assert.equal(value('.mf-town-shop button,.mf-treasure-prompt','min-height'),'2.65rem');
});
