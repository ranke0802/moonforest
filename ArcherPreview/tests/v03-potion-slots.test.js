import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {GoldLoot,GOLD_LEDGER_KEY} from '../src/gold-loot.js';
import {HealingPotion} from '../src/healing-potion.js';
import {createTownEconomy,normalizeTown} from '../src/v03/town-economy.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {slotStorage} from '../src/v03/save-slots.js';

function storage(){
 const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
test('legacy choice migrates into slot 1, empty or invalid slots never refill from healing supplies',()=>{
 const old={bag:{potion:6,'stamina-tonic':3},quick:'stamina-tonic'};
 assert.deepEqual(normalizeTown(old).quickSlots,['stamina-tonic',null,null,null]);
 const empty=Array(4).fill(null);
 assert.deepEqual(normalizeTown({...old,quickSlots:empty}).quickSlots,empty);
 assert.deepEqual(normalizeTown({...old,quickSlots:null}).quickSlots,empty);
 assert.deepEqual(normalizeTown({...old,quick:'moon-herb'}).quickSlots,empty);
 assert.deepEqual(normalizeTown({bag:{}}).quickSlots,empty);
 const bad=normalizeTown({...old,quickSlots:['potion','potion',['stamina-tonic'],'bear-bile','moon-herb'],selectedQuickSlot:2});
 assert.deepEqual(bad.quickSlots,['potion',null,null,'bear-bile']);assert.equal(bad.selectedQuickSlot,0);
});

test('moving, swapping, selecting and clearing survive reload in their own journey',()=>{
 const raw=storage(),one=slotStorage(raw,'moonforest-0.3',1),two=slotStorage(raw,'moonforest-0.3',2);
 one.setItem(GOLD_LEDGER_KEY,JSON.stringify({version:1,balance:10,town:{bag:{potion:2,'bear-bile':1},quick:'bear-bile'}}));
 const open=storage=>createTownEconomy(new GoldLoot({storage}));let town=open(one);
 assert.ok(town.register('potion',3));assert.ok(town.register('bear-bile',3));
 assert.deepEqual(town.state.quickSlots,['potion',null,null,'bear-bile']);assert.ok(town.selectQuickSlot(3));
 assert.equal(JSON.parse(one.getItem(GOLD_LEDGER_KEY)).town.quick,'potion');
 town=open(one);assert.equal(town.state.selectedQuickSlot,3);assert.deepEqual(open(two).state.quickSlots,['potion',null,null,null]);
 assert.equal(town.drink(1),false);assert.equal(town.drink(4),false);assert.equal(town.register('stamina-tonic',2),false);
 assert.ok(town.drink());assert.equal(town.state.bag['bear-bile'],undefined);assert.equal(town.state.bag.potion,2);
 assert.ok(town.unregister(3));assert.ok(town.unregister(0));town=open(one);
 assert.deepEqual(town.state.quickSlots,[null,null,null,null]);assert.equal(town.drink(),false);assert.equal(town.state.bag.potion,2);
});

test('a touch tap commits one carried dose, a hold selects without drinking and a cancelled gesture has no effect',ctx=>{
 ctx.mock.timers.enable({apis:['setTimeout','Date']});
 const {document,window}=parseHTML('<html><body><main><nav><button id="potion-button"><b id="potion-count"></b></button></nav></main></body></html>');
 const root=document.querySelector('main'),button=root.querySelector('button'),store=storage(),wallet=new GoldLoot({storage:store});
 const battle={playerAlive:true,playerHp:300,playerMaxHp:500,potions:new HealingPotion(),combat:{}};
 let town,uses=0,suspended=false;
 town=setupTownServices({root,world:{},wallet,legacy:()=>({}),player:()=>({}),battle:()=>battle,controls:()=>null,appearance:()=>null,
  canOpenPotionPicker:()=>!suspended&&!root.querySelector('dialog[open]'),usePotion:slot=>{if(town.drink(slot))uses++;},notify(){},onPause(){}});
 ctx.after(()=>town.dispose());
 const dialog=root.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;dialog.setAttribute('open','');};
 dialog.close=()=>{dialog.open=false;dialog.removeAttribute('open');dialog.dispatchEvent(new window.Event('close'));};
 const fire=(type,extra={})=>button.dispatchEvent(Object.assign(new window.Event(type,{cancelable:true}),{pointerId:5,pointerType:'touch',button:0,clientX:25,clientY:30,...extra}));
 town.economy.grant('stamina-tonic',2);town.register('stamina-tonic',3);town.updatePotionHud(true,true);
 assert.equal(root.querySelectorAll('.mf-potion-bar button').length,4);assert.equal(root.querySelectorAll('.mf-potion-bar button')[1].disabled,true);
 fire('pointerdown');ctx.mock.timers.tick(100);assert.equal(uses,0);fire('pointerup');fire('click',{detail:0,pointerType:''});
 assert.equal(uses,1);assert.equal(town.economy.state.bag.potion,2);assert.equal(battle.potions.active,true);
 assert.equal(town.drink(0),false);assert.equal(town.economy.state.bag.potion,2);
 battle.playerHp=battle.playerMaxHp;town.updatePotionHud(true,true);assert.equal(button.disabled,false,'can switch at full health while healing');
 fire('pointerdown');ctx.mock.timers.tick(450);assert.equal(dialog.open,true);assert.equal(dialog.querySelectorAll('[data-potion-choice]').length,2);
 fire('pointerup');dialog.querySelector('[data-potion-choice="3"]').click();fire('click',{detail:0,pointerType:''});
 assert.equal(uses,1);assert.equal(town.economy.state.selectedQuickSlot,3);assert.equal(town.economy.state.bag['stamina-tonic'],2);
 assert.equal(button.querySelector('.mf-potion-current [data-item-icon]').dataset.itemIcon,'stamina-tonic');
 for(const event of ['pointercancel','lostpointercapture','pointermove']){
  fire('pointerdown');fire(event,{clientX:70});ctx.mock.timers.tick(600);fire('pointerup');assert.equal(uses,1);assert.equal(dialog.open,false);
 }
 suspended=true;fire('pointerdown');ctx.mock.timers.tick(600);fire('pointerup');root.querySelectorAll('.mf-potion-bar button')[3].click();
 assert.equal(uses,1);assert.equal(dialog.open,false,'dialogue blocks touch and desktop button actions');
 suspended=false;fire('pointerdown');fire('pointerup');assert.equal(uses,2);assert.equal(town.economy.state.boost,45);assert.equal(town.economy.state.bag['stamina-tonic'],1);
 assert.equal(town.drink(3),false);assert.equal(town.economy.state.bag['stamina-tonic'],1);
 battle.potions.cancel();battle.playerHp=0;assert.equal(town.drink(0),false,'the encounter may report alive outside combat at zero HP');
 battle.playerHp=350;town.updatePotionHud(true,true);
 store.setItem(GOLD_LEDGER_KEY,JSON.stringify({version:1,balance:20})); // A newer tab owns the ledger.
 root.querySelector('.mf-potion-bar button').click();assert.equal(uses,2);assert.equal(battle.potions.active,false);assert.equal(town.economy.state.bag.potion,2);
});
