import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {BossSelection,bossSelectionHelp,summonSelectedBoss} from '../src/boss-selection.js';
import {MonsterSelection,MONSTER_NAMES,monsterSelectionHelp,summonSelectedMonster} from '../src/monster-selection.js';

const bosses=['bear','wolf','elena','mourning-elena'],monsters=['goblin','gray-wolf','stylized-wolf','wolf-3','fox','boar'];
const html=await fs.readFile(new URL('../moonforest-0.2.html',import.meta.url),'utf8'),main=await fs.readFile(new URL('../src/main.js',import.meta.url),'utf8');
const controlsSource=main.slice(main.indexOf('function updateSummonControls('),main.indexOf('\nfunction leaveElenaReview('));

test('0.2 normal dropdown contains goblin plus all five animals; bosses keep only four boss entries',()=>{
 const {document}=parseHTML(html);
 assert.deepEqual([...document.querySelectorAll('#boss-kind option')].map(option=>option.value),bosses);
 assert.deepEqual([...document.querySelectorAll('#monster-kind option')].map(option=>option.value),monsters);
 for(const id of ['boss-kind','monster-kind','boss-count','goblin-count','summon-boss','summon-goblin'])assert.ok(document.getElementById(id).hasAttribute('disabled'));
 for(const id of ['boss-count','goblin-count'])assert.deepEqual([...document.getElementById(id).querySelectorAll('option')].map(option=>Number(option.value)),Array.from({length:20},(_,i)=>i+1));
 assert.equal(document.getElementById('monster-kind').getAttribute('aria-describedby'),'monster-selection-help');
});

test('each normal kind remembers its own quantity independently of bosses and maps',async()=>{
 const normal=new MonsterSelection(),boss=new BossSelection(),calls=[],player={},battle={summon:async(...args)=>{calls.push(args);return true;}};
 for(const [index,kind]of monsters.entries()){normal.choose(kind);normal.setCount(20-index);}
 boss.choose('wolf');boss.setCount(4);
 for(const map of ['village','great-plains','monster-forest','witch-cave'])for(const [index,kind]of monsters.entries()){
  assert.deepEqual(normal.choose(kind,map),{kind,count:20-index});assert.match(monsterSelectionHelp(normal.current()),/모든 맵.*1~20마리/);assert.equal(boss.current().count,4);
 }
 for(const kind of monsters){normal.choose(kind);await summonSelectedMonster(battle,player,normal.current());}
 assert.deepEqual(calls,monsters.map((kind,index)=>[player,20-index,kind]));
 assert.equal(boss.choose('boar').kind,'bear');assert.equal(normal.choose('wolf').kind,'goblin');
 normal.setCount(100);assert.equal(normal.current().count,20);normal.setCount(0);assert.equal(normal.current().count,1);
});

function controls({ready=true,v2=true,loading=false,encounters=[]}={}){
 const handlers={},nodes=Object.fromEntries(['boss-kind','boss-count','summon-boss','open-summon','boss-selection-help','monster-kind','goblin-count','summon-goblin','monster-selection-help','summon-dialog'].map(id=>['#'+id,{value:'',disabled:true,hidden:false,textContent:'',close(){},addEventListener(event,handler){handlers[id+':'+event]=handler;}}]));
 const bossSelection=new BossSelection(),monsterSelection=new MonsterSelection(),boss={loading,encounters},$=id=>nodes[id],text=(id,value)=>{$(id).textContent=value;};
 const deps={$,text,bossSelection,monsterSelection,bossSelectionHelp,monsterSelectionHelp,MONSTER_NAMES,ready,isV2:()=>v2,boss};
 const update=new Function('deps',`const {$,text,bossSelection,monsterSelection,bossSelectionHelp,monsterSelectionHelp,MONSTER_NAMES,ready,isV2,boss}=deps;${controlsSource};return updateSummonControls;`)(deps);update();
 const start=main.indexOf("  $('#boss-kind').addEventListener('change'"),end=main.indexOf('  for(const [selector,count,kind]',start);
 new Function('deps',`const {$,bossSelection,monsterSelection,updateSummonControls}=deps;${main.slice(start,end)}`)({...deps,updateSummonControls:update});
 return {...deps,nodes,handlers,update};
}

test('actual main UI changes normal labels/counts and preserves readiness guards',()=>{
 const api=controls({encounters:[{kind:'wolf',summonKind:'fox'}]});
 api.nodes['#monster-kind'].value='fox';api.handlers['monster-kind:change']();api.nodes['#goblin-count'].value='17';api.handlers['goblin-count:change']();
 assert.equal(api.nodes['#summon-goblin'].textContent,'여우 다시 소환');assert.equal(api.nodes['#boss-kind'].value,'bear');
 api.nodes['#monster-kind'].value='boar';api.handlers['monster-kind:change']();assert.equal(api.nodes['#goblin-count'].value,'1');
 api.nodes['#monster-kind'].value='fox';api.handlers['monster-kind:change']();assert.equal(api.nodes['#goblin-count'].value,'17');
 for(const state of [{ready:false},{v2:false},{loading:true}]){
  const {nodes}=controls(state);for(const id of ['boss-kind','boss-count','summon-boss','monster-kind','goblin-count','summon-goblin'])assert.equal(nodes['#'+id].disabled,true);
 }
});

test('actual summon button routes a selected normal animal separately from the boss selector',async()=>{
 const api=controls(),calls=[];api.monsterSelection.choose('boar');api.monsterSelection.setCount(12);api.bossSelection.choose('wolf');api.bossSelection.setCount(3);api.update();
 api.boss.summon=async(...args)=>{calls.push(args);return true;};
 const actor={},deps={...api,actor,summonSelectedBoss,summonSelectedMonster,input:{reset(){}},attackSources:{clear(){}},controller:{cancelAttack(){},staggerRemaining:0},leaveElenaReview(){},actionAudio:{reset(){}},audio:{play(){}},world:{camera:{radius:8}},canvas:{focus(){}},innerWidth:1000,updateButtons(){},toast(message){assert.fail(message);}};
 const start=main.indexOf('  for(const [selector,count,kind]'),end=main.indexOf('  for(const motion of BOSS_ACTIVE_MOTIONS)',start);
 new Function('deps',`const {$,bossSelection,monsterSelection,boss,actor,summonSelectedBoss,summonSelectedMonster,ready,isV2,input,attackSources,controller,leaveElenaReview,actionAudio,audio,world,canvas,innerWidth,updateButtons,toast}=deps;${main.slice(start,end)}`)(deps);
 await api.handlers['summon-goblin:click']();await api.handlers['summon-boss:click']();assert.deepEqual(calls,[[actor,12,'boar'],[actor,3,'wolf']]);
});
