import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuilder,NullEngine,PBRMaterial,Scene,Texture} from '@babylonjs/core';
import {GoldLoot} from '../src/gold-loot.js';
import {WarriorEquipment} from '../src/equipment.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {forgeCursor,gradeStrike,monsterRewards,treasureRewards,TOWN_ITEMS} from '../src/v03/town-items.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {CAST_MODELS} from '../src/v03/cast-models.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {parseHTML} from 'linkedom';
import {createTownShop} from '../src/v03/town-shop.js';

const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
function wallet(storage=store(),amount=200){const gold=new GoldLoot({storage});gold.creditCumulative('test-grant',amount);return gold;}
test('smith trades are atomic with gold and all four grades have distinct consequences',()=>{
 const storage=store(),gold=wallet(storage),town=createTownEconomy(gold);
 assert.equal(town.gear().max,180);assert.equal(town.attack,3);assert.equal(town.buy('smith','iron-scrap'),true);
 assert.equal(town.forge(forgeCursor(450)),'Perfect');assert.deepEqual(town.gear(),{hp:166,max:166,level:2,attack:7,defense:0});
 for(const grade of ['Success','Near miss','Failed']){town.grant('wolf-fang');assert.equal(town.forge({Success:.36,'Near miss':.24,Failed:0}[grade]),grade);}
 assert.equal(town.gear().level,3);assert.equal(town.gear().hp,town.gear().max-5);
 for(let action=0;action<10;action++){town.damageWeapon(action);town.damageWeapon(action);}
 assert.equal(town.gear().hp,town.gear().max-6);
 assert.equal(town.repair(),true);assert.equal(town.gear().hp,town.gear().max);
 assert.equal(createTownEconomy(new GoldLoot({storage})).attack,9);
 const rival=new GoldLoot({storage}),other=createTownEconomy(rival);assert.ok(town.buy('herbalist','potion'));
 const old=other.state.bag.potion;assert.equal(other.buy('herbalist','potion'),false);assert.equal(other.state.bag.potion,old);
 assert.deepEqual([.5,.35,.24,.0].map(gradeStrike),['Perfect','Success','Near miss','Failed']);
});
test('craft, wear, repair armor; register and persist stamina consumables',()=>{
 const storage=store(),w=wallet(storage),a=createTownEconomy(w);
 assert.equal(a.craft('herbalist','potion'),false);
 a.buy('herbalist','moon-herb');a.buy('herbalist','moon-herb');assert.ok(a.craft('herbalist','potion'));
 assert.equal(a.state.bag.potion,4);assert.equal(a.state.bag['moon-herb'],undefined);
 a.grant('fox-pelt');a.grant('wolf-pelt',2);assert.ok(a.craft('smith','hunter-coat'));a.equip('hunter-coat');
 a.grant('iron-scrap');assert.equal(a.forge(.5,'hunter-coat'),'Perfect');assert.equal(a.defense,8);
 a.wearDefense(false);assert.equal(a.gear('hunter-coat').hp,105);assert.ok(a.repair('hunter-coat'));
 a.grant('bear-bile');assert.ok(a.register('bear-bile'));assert.ok(a.drink());assert.equal(a.regen,1.75);
 a.tick(15);const again=createTownEconomy(new GoldLoot({storage}));assert.equal(again.state.boost,75);again.tick(75);assert.equal(again.regen,1);
});
test('existing saves retain selected gear, new games have a sturdy low-strike sword, and inventories stay independent',()=>{
 const a=createTownEconomy(wallet(store()),{sword:'teal-bronze',armor:'leather'});assert.equal(a.attack,9);assert.equal(a.defense,4);
 const b=createTownEconomy(wallet(store()));assert.equal(b.attack,3);assert.equal(b.state.bag['bronze-blade'],undefined);
 assert.equal(b.equip('ghoul-blade'),false);assert.equal(b.register('bear-bile'),false);
});
test('animal trophies roll independently, themed monster weapons can be equipped, and chest rewards survive reopening',()=>{
 for(const kind of ['boar','bear','wolf','gray-wolf','fox','goblin-warrior','goblin-archer','goblin-shaman','hobgoblin','zombie','ghoul-warrior','black-bear','black-wolf']){
  for(const id of Object.keys(monsterRewards(kind,()=>0)))assert.ok(TOWN_ITEMS[id],kind+' '+id);
  assert.ok(Object.keys(monsterRewards(kind,()=>0)).length);assert.deepEqual(monsterRewards(kind,()=>.9999),{});
 }
 assert.deepEqual(monsterRewards('boar',()=>.5),{'boar-meat':1});assert.equal(Object.keys(monsterRewards('bear',()=>0)).length,4);
 const storage=store(),a=createTownEconomy(wallet(storage)),point={x:0,y:0,z:0},sample={id:'chest:one',mapId:'village',model:'clue-satchel',origin:point,position:point,rewards:treasureRewards(5,()=>0)};
 assert.ok(a.scatter([sample],'one'));assert.equal(a.scatter([sample],'one'),false);
 const b=createTownEconomy(new GoldLoot({storage}));assert.ok(b.collect(['chest:one']));assert.equal(b.collect(['chest:one']),null);
 assert.ok(b.equip('ghoul-blade'));assert.equal(b.attack,16);
 const points=CHAPTER_POINTS.filter(p=>p.treasure);assert.equal(points.length,24);assert.equal(new Set(points.map(p=>p.map)).size,4);assert.equal(new Set(points.map(p=>p.tier)).size,5);
});
test('equipping different blade profiles changes geometry below the guard and preserves hand mount and tip reach',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),sword=MeshBuilder.CreateBox('Golden_Oathblade',{height:2},scene);
 sword.material=new PBRMaterial('iron',scene);sword.material.emissiveTexture=new Texture(null,scene);
 const shield=MeshBuilder.CreateBox('Bunnyguard_Shield',{},scene);shield.material=sword.material;const source=sword.geometry;const eq=new WarriorEquipment({meshes:[sword,shield]});
 eq.selectTrophy('teal-bronze','cleaver');const first=sword.geometry;assert.notEqual(first,source);
 eq.selectTrophy('violet-silver','fang');assert.notEqual(sword.geometry,first);
 const orig=source.getVerticesData('position'),variant=first.getVerticesData('position');
 for(let i=0;i<orig.length;i+=3){assert.equal(orig[i+1],variant[i+1]);if(orig[i+1]>.52)assert.equal(orig[i],variant[i]);}
 eq.selectTrophy('teal-bronze','cleaver');assert.equal(sword.geometry,first);
 eq.dispose();assert.equal(sword.geometry,source);scene.dispose();engine.dispose();
});
test('herbalist shop opens from play, bills the visible button once and resumes on close',async()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main');
 const town=createTownEconomy(wallet()),shop=createTownShop({root,economy:town,onChange(){},onPause(){}});
 const dialog=root.querySelector('dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new document.defaultView.Event('close'));};
 const opened=shop.show('herbalist');assert.equal(shop.open,true);const buttons=[...dialog.querySelectorAll('button')];
 buttons.find(b=>b.textContent==='15 G').click();assert.equal(town.state.bag.potion,4);assert.equal(town.gold,185);
 shop.close();await opened;assert.equal(shop.open,false);shop.dispose();
});
test('the blacksmith lives in the village with a real catalog model and reachable dialogue',()=>{
 const npc=NPCS.find(n=>n.id==='smith');assert.equal(npc.map,'village');assert.ok(DIALOGUES[npc.idle]?.length);
 assert.ok(ASSET_CATALOG.entries.some(a=>a.assetId===CAST_MODELS[npc.visual]));
});
