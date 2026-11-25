import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {GoldLoot} from '../src/gold-loot.js';
import {LANGUAGES,t,useLanguage} from '../src/v03/i18n.js';
import {createPickupNotice} from '../src/v03/pickup-notice.js';
import {createTownEconomy,MAX_GROUND_DROPS} from '../src/v03/town-economy.js';
import {itemName} from '../src/v03/town-items.js';
import {createTownTreasure} from '../src/v03/town-treasure.js';

test('a last-moment pickup stays readable and repeated pickups yield to queued mobile rows',ctx=>{
 const {document,window}=parseHTML('<main></main>'),root=document.querySelector('main');
 ctx.mock.timers.enable({apis:['Date','setTimeout']});
 const original=window.matchMedia;window.matchMedia=()=>({matches:true});
 const feed=createPickupNotice(root);
 const row=id=>root.querySelector('[data-item-icon="'+id+'"]')?.closest('.acquisition-row');
 try{
  feed.show({potion:1,'wolf-fang':1,'bear-hide':1});ctx.mock.timers.tick(4799);
  feed.show({potion:1,'wolf-fang':1});ctx.mock.timers.tick(300);
  feed.show({potion:1,'wolf-fang':1});ctx.mock.timers.tick(899);
  assert.match(row('potion').textContent,/× 2/);assert.match(row('wolf-fang').textContent,/× 2/);
  ctx.mock.timers.tick(1);
  assert.ok(row('bear-hide'),'an earlier waiting item gets the next vacant row');
  assert.equal(row('potion').querySelector('strong').textContent,itemName('potion'),'the next pickup is shown once');
 }finally{feed.dispose();if(original===undefined)delete window.matchMedia;else window.matchMedia=original;}
});

test('short screens queue every pickup, aggregate repeated items and release waiting rows on clear',async ctx=>{
 const {document,window}=parseHTML('<main></main>'),root=document.querySelector('main');
 ctx.mock.timers.enable({apis:['setTimeout']});
 const original=window.matchMedia;window.matchMedia=()=>({matches:true});
 const feed=createPickupNotice(root);
 try{
  for(const {id} of LANGUAGES){
   await useLanguage(id);feed.show({potion:1,'wolf-fang':1,'wolf-blade':1,gold:10});
   feed.show({potion:2,'wolf-blade':1,gold:15});
   const rows=()=>[...root.querySelectorAll('.acquisition-row')];
   assert.equal(rows().length,2);
   assert.equal(rows()[0].querySelector('[data-item-icon]').dataset.itemIcon,'potion');
   assert.equal(rows()[0].textContent,t('pickup.received',{item:itemName('potion')+' × 3'}));
   ctx.mock.timers.tick(4800);
   assert.equal(rows().length,2);
   assert.equal(rows()[0].querySelector('strong').textContent,itemName('wolf-blade')+' × 2');
   assert.ok(rows()[1].querySelector('.acquisition-gold'));
   assert.equal(rows()[1].querySelector('strong').textContent,t('reward.gold',{n:25}));
   feed.show({'bear-hide':1});feed.clear();ctx.mock.timers.tick(10000);
   assert.equal(rows().length,0);
  }
 }finally{feed.dispose();if(original===undefined)delete window.matchMedia;else window.matchMedia=original;await useLanguage('ko');}
 assert.equal(root.children.length,0);
});

test('an alpha fang and its XP reach the bag together when the field is full',ctx=>{
 const {document}=parseHTML('<main></main>'),root=document.querySelector('main'),values=new Map();
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const economy=createTownEconomy(new GoldLoot({storage})),origin={x:0,y:0,z:0},noop=()=>{};
 const piles=Array.from({length:MAX_GROUND_DROPS},(_,i)=>({id:'foe:test:'+i,mapId:'village',origin,position:origin,model:'clue-satchel',rewards:{'iron-scrap':1}}));
 assert.ok(economy.scatter(piles));
 const treasure=createTownTreasure({root,world:{mapId:'great-plains',v03:{playing:true}},economy,player:()=>origin,canInteract:()=>true,sound:noop,
  props:{stats:{modelFailures:0},release:noop,dispose:noop},fieldChestsEnabled:false});
 ctx.after(()=>treasure.dispose());
 assert.ok(treasure.defeat({kind:'wolf',position:origin},20));
 const saved=createTownEconomy(new GoldLoot({storage}));
 assert.equal(saved.state.drops.length,MAX_GROUND_DROPS);assert.equal(saved.state.bag['alpha-wolf-fang'],1);
 assert.equal(saved.state.progression.totalXp,20);
 assert.equal(root.querySelector('.acquisition-row strong').textContent,itemName('alpha-wolf-fang'));
});
test('chest and monster pickups announce committed bag changes once, including capped stacks and retries',ctx=>{
 const {document}=parseHTML('<main></main>'),root=document.querySelector('main'),values=new Map();
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const wallet=new GoldLoot({storage,onPickup:amount=>treasure.collectGold(amount)}),economy=createTownEconomy(wallet);
 const origin={x:0,y:0,z:0},noop=()=>{};let pos=origin,ready=false,write=true;
 const save=wallet.tradeTown.bind(wallet);wallet.tradeTown=(...args)=>write&&save(...args);
 const world={mapId:'village',v03:{playing:true},authoredPlacements:{
  records:new Map([['chest',{chestOpening:{},instance:{assetId:'chest-common',chest:{tier:1}},root:{isEnabled:()=>true,getAbsolutePosition:()=>origin}}]]),
  openChest:noop,setLootedChests:noop,
 }};
 const treasure=createTownTreasure({root,world,economy,player:()=>pos,canInteract:()=>true,sound:noop,fieldChestsEnabled:false,
  props:{stats:{modelFailures:0},release:noop,dispose:noop},makeDrops:()=>({ready:()=>ready,sync:noop,clear:noop,dispose:noop})});
 ctx.after(()=>treasure.dispose());
 const rows=()=>[...root.querySelectorAll('.acquisition-row')];
 const roll=ctx.mock.method(Math,'random',()=>.99);
 assert.ok(economy.grant('potion',99995));
 treasure.tick(.3);assert.ok(world.openAuthoredChest('chest'));
 assert.equal(rows().length,0,'opening only scatters prizes');
 pos=economy.state.drops[0].position;treasure.tick(.3);
 assert.equal(rows().length,0,'still in flight');
 ready=true;write=false;treasure.tick(.3);
 assert.equal(rows().length,0,'failed write did not collect the drop');
 assert.equal(economy.state.drops.length,1);
 write=true;treasure.tick(.3);treasure.tick(.3);
 assert.equal(rows().length,1);assert.equal(economy.state.bag.potion,99999);
 assert.equal(rows()[0].querySelector('strong').textContent,itemName('potion'),'only one of two fit');
 assert.equal(world.openAuthoredChest('chest'),false);
 world.mapId='great-plains';treasure.tick(.3);assert.equal(rows().length,0);
 roll.mock.mockImplementation(()=>0);
 assert.ok(treasure.defeat({kind:'goblin-warrior',position:origin}));
 assert.equal(rows().length,0,'defeat alone does not grant inventory');
 pos=economy.state.drops[0].position;treasure.tick(.3);treasure.tick(.3);
 assert.deepEqual(rows().map(row=>row.querySelector('[data-item-icon]').dataset.itemIcon),['iron-scrap','raider-dagger']);
 const restored=createTownEconomy(new GoldLoot({storage}));
 assert.equal(restored.state.bag['iron-scrap'],1);assert.equal(restored.state.bag['raider-dagger'],1);assert.equal(restored.state.drops.length,0);
 assert.equal(restored.state.bag.potion,99999);
 world.v03.playing=false;treasure.tick(.3);treasure.collectGold(10);assert.equal(rows().length,0);
 world.v03.playing=true;treasure.tick(.3);
 wallet.creditCumulative('quest',Number.MAX_SAFE_INTEGER-5);wallet.reload();
 assert.equal(rows().length,0,'restoring a balance or crediting quest gold is not a ground pickup');
 wallet.drop('goblin',origin);wallet.drop('bear',origin);
 wallet.update(.3,origin);assert.equal(rows().length,0,'coins are still flying');
 wallet.update(.3,origin);wallet.update(1,origin);
 assert.equal(wallet.balance,Number.MAX_SAFE_INTEGER);assert.equal(rows().length,1);
 assert.ok(rows()[0].querySelector('.acquisition-gold'));assert.equal(rows()[0].querySelector('strong').textContent,t('reward.gold',{n:5}));
 treasure.clear();assert.equal(rows().length,0);
});
