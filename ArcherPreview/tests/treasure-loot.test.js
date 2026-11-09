import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {ChapterJourney} from '../src/chapter-quest-state.js';
import {LOOT_RARITIES,lootRarity,lootItem,itemRarity} from '../src/loot-rarity.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {setupChapterQuests} from '../src/chapter-quest.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {villageObstacles} from '../src/village-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';

const storage=()=>{const values=new Map();let writes=0;return {getItem:k=>values.get(k),setItem:(k,v)=>{writes++;values.set(k,v);},get writes(){return writes;}};};
test('five colours give useful increasingly strong items, atomically and exactly once across map trips/reloads',()=>{
 const saved=storage();let j=new ChapterJourney(saved);
 for(const grade of LOOT_RARITIES){
  const point={id:'test-'+grade.tier,key:'chest:test-'+grade.tier,tier:grade.tier,map:'village'},pose={origin:{x:0,y:0,z:0},position:{x:0,y:0,z:0}};
  const count=saved.writes,drop=j.openChest(point,pose);
  assert.equal(saved.writes,count+1);assert.equal(drop.rewards[grade.item],1);assert.equal(drop.rewards.gold,grade.gold);
  j=new ChapterJourney(saved);assert.equal(j.openChest(point,pose),null);assert.equal(j.value.bag[grade.item],undefined);j.collectDrop(drop.id);assert.equal(j.value.bag[grade.item],1);
  assert.equal(itemRarity(grade.item).color,grade.color);
  if(grade.tier>1){assert.ok(grade.heal>lootRarity(grade.tier-1).heal);assert.ok(grade.gold>lootRarity(grade.tier-1).gold);}
 }
 const snapshot=JSON.stringify(j.value);assert.equal(j.openChest({id:'bad',key:'bad',tier:9,map:'village'},{origin:{x:0,y:0,z:0},position:{x:0,y:0,z:0}}),null);assert.equal(JSON.stringify(j.value),snapshot);
 assert.equal(j.use(LOOT_RARITIES[4].item,()=>false),false);assert.equal(j.value.bag[LOOT_RARITIES[4].item],1);
 assert.ok(j.use(LOOT_RARITIES[4].item,()=>true));assert.equal(new ChapterJourney(saved).value.bag[LOOT_RARITIES[4].item],0);
});
test('treasures across every map have close safe placement and a reachable interaction side',()=>{
 const maps=[['village',new VillageNavigation(villageObstacles()),48],['great-plains',new VillageNavigation(plainsObstacles()),105],['monster-forest',new VillageNavigation(forestObstacles()),55],['witch-cave',new CaveNavigation(caveObstacles()),64]];
 const ids=new Set();
 for(const [map,nav,limit]of maps){const points=CHAPTER_POINTS.filter(p=>p.map===map&&p.tier);assert.ok(points.length>=6&&points.length<=10);
  const positions=[];
  for(const p of points){
   assert.ok(!ids.has(p.id));ids.add(p.id);assert.equal(p.model,'chest-common');
   const placed=nav.findFree(p,.65,limit);assert.ok(Math.hypot(p.x-placed.x,p.z-placed.z)<4.1,p.id+' was displaced too far');
   assert.ok(nav.free(placed,.65,limit));assert.ok(positions.every(v=>Math.hypot(v.x-placed.x,v.z-placed.z)>3),p.id+' duplicates another chest');positions.push(placed);
   const approach=Array.from({length:16},(_,i)=>({x:placed.x+Math.sin(i*Math.PI/8)*1.4,z:placed.z+Math.cos(i*Math.PI/8)*1.4}));
   assert.ok(approach.some(a=>nav.free(a,.29,limit)&&nav.segmentClear(a,placed,.05)),p.id+' cannot be opened without crossing a wall');
  }
 }
});
test('actual chapter UI opens chest once, shows matching coloured item border, heals and retains loot on re-entry',t=>{
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><div class="top-actions"></div></main></body></html>');
 const create=document.createElement.bind(document);document.createElement=(name,...args)=>{const n=create(name,...args);if(name==='dialog'){Object.defineProperty(n,'open',{get(){return this.hasAttribute('open');}});n.showModal=()=>n.setAttribute('open','');n.close=()=>{n.removeAttribute('open');n.dispatchEvent(new window.Event('close'));};}return n;};
 const root=document.getElementById('app'),saved=storage(),chest=CHAPTER_POINTS.find(p=>p.tier===5),state={ready:true,map:chest.map,position:{x:chest.x,z:chest.z}},nav={findFree:p=>p,segmentClear:()=>true};let hp=1;
 const api=setupChapterQuests({root,world:{navigation:nav,cave:true,scene:{onDisposeObservable:{addOnce(){}}}},storage:saved,getState:()=>state,createDropView:()=>({sync(){},ready:()=>true,clear(){},dispose(){}}),heal:n=>{const gained=Math.min(n,500-hp);hp+=gained;return gained;},createProps:()=>({load:async()=>true,update(){},release(){},dispose(){},inspect:()=>({active:0})})});t.after(()=>api.dispose());
 const click=(action,id)=>{const b=root.querySelector(`[data-chapter="${action}"]${id?`[data-id="${id}"]`:''}`);assert.ok(b,action);b.dispatchEvent(new window.Event('click',{bubbles:true}));};
 api.update(1);click('interact');api.update(2);click('interact');assert.equal(api.journey.value.bag[lootRarity(5).item],1);
 state.map='village';state.position={x:0,z:0};api.update(3);state.map=chest.map;state.position=chest;api.update(4);assert.equal(api.journey.value.bag[lootRarity(5).item],1);
 click('bag');const use=root.querySelector('[data-id="restoration-water"][data-chapter="use"]');assert.equal(use.closest('article').style.getPropertyValue('--rarity-color'),lootRarity(5).color);click('use','restoration-water');assert.equal(hp,500);assert.equal(new ChapterJourney(saved).value.bag[lootItem('restoration-water').item],0);
});
