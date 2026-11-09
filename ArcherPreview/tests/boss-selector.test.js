import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {BossSelection,bossSelectionHelp,summonSelectedBoss} from '../src/boss-selection.js';
import {MAX_SUMMON_PER_KIND} from '../src/summon-limits.js';

const kinds=['bear','elena','mourning-elena'];
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const main=await fs.readFile(new URL('../src/main.js',import.meta.url),'utf8');
const controlsSource=main.slice(main.indexOf('function updateSummonControls('),main.indexOf('\nfunction leaveElenaReview('));

test('each boss kind keeps its quantity across selecting other kinds and maps', () => {
  const selection=new BossSelection();
  for(const [kind,count]of [['bear',20],['elena',17],['mourning-elena',12]]){selection.choose(kind);selection.setCount(count);}
  for(const cave of [true,false,true,false]){
    assert.deepEqual(selection.choose('elena',cave),{kind:'elena',count:17,phase:1});
    assert.deepEqual(selection.choose('mourning-elena',cave),{kind:'mourning-elena',count:12,phase:2});
    assert.deepEqual(selection.choose('bear',cave),{kind:'bear',count:20,phase:null});
  }
  assert.deepEqual(selection.choose('unknown'),{kind:'bear',count:20,phase:null});
});

test('every boss kind clamps quantity to the shared one to twenty range', () => {
  assert.equal(MAX_SUMMON_PER_KIND,20);
  const selection=new BossSelection();
  for(const kind of kinds){
    selection.choose(kind);
    for(const [input,expected]of [[0,1],[100,20],['20',20],['7',7],[2.9,2],[NaN,1],[Infinity,1]]){selection.setCount(input);assert.equal(selection.current().count,expected,kind+' '+input);}
  }
});

test('all boss kinds dispatch their selected quantity through generic summon', async () => {
  const calls=[],player={id:'player'},battle={summon:async(...args)=>{calls.push(args);return true;},summonResident(){assert.fail('Manual selectors must not use story resident summon');}};
  const selection=new BossSelection();
  for(const [index,kind]of kinds.entries()){selection.choose(kind);selection.setCount(20-index);assert.equal(await summonSelectedBoss(battle,player,selection.current()),true);}
  assert.deepEqual(calls,[[player,20,'bear'],[player,19,'elena'],[player,18,'mourning-elena']]);
});

test('accessible help describes all-map twenty-per-kind availability for both Elena phases', () => {
  const selection=new BossSelection();
  for(const kind of kinds){const help=bossSelectionHelp(selection.choose(kind));assert.match(help,/모든 맵/);assert.match(help,/종류별로 1~20마리/);assert.doesNotMatch(help,/한 마리만|동굴에서/);}
});

test('HTML exposes 1..20 for goblins and every selected boss, initially guarded by readiness',()=>{
  const {document}=parseHTML(html);
  for(const id of ['boss-count','goblin-count']){
    const select=document.getElementById(id);assert.ok(select.hasAttribute('disabled'));
    assert.deepEqual([...select.querySelectorAll('option')].map(option=>Number(option.value)),Array.from({length:20},(_,index)=>index+1));
  }
  assert.deepEqual([...document.querySelectorAll('#boss-kind option')].map(option=>option.value),kinds);
  for(const option of document.querySelectorAll('#boss-kind option'))assert.equal(option.hasAttribute('disabled'),false);
});

function controls({ready=true,v2=true,loading=false,kind='elena',count=20,map='village',encounters=[]}={}){
  const selection=new BossSelection();selection.choose(kind);selection.setCount(count);
  const ids=['boss-kind','boss-count','summon-boss','open-summon','boss-selection-help'];
  const nodes=Object.fromEntries(ids.map(id=>['#'+id,{value:'',disabled:true,hidden:false,textContent:''}]));
  nodes['#boss-kind'].options=kinds.map(value=>({value,disabled:false}));
  const boss={loading,encounters},$=selector=>nodes[selector],text=(selector,value)=>{$(selector).textContent=value;};
  const update=new Function('deps',`const {$,text,bossSelection,bossSelectionHelp,ready,isV2,isCave,boss}=deps;${controlsSource};return updateSummonControls;`)({$,text,bossSelection:selection,bossSelectionHelp,ready,isV2:()=>v2,isCave:()=>map==='cave',boss});
  update();return {nodes,selection,update};
}

test('actual main controls keep either Elena phase and quantity enabled on every map',()=>{
  for(const map of ['village','plains','forest','cave'])for(const kind of kinds){
    const {nodes,selection}=controls({map,kind,count:20});
    assert.equal(nodes['#boss-kind'].value,kind);assert.equal(nodes['#boss-count'].value,'20');assert.equal(selection.current().kind,kind);
    for(const id of ['boss-kind','boss-count','summon-boss','open-summon'])assert.equal(nodes['#'+id].disabled,false,map+' '+kind+' '+id);
    for(const option of nodes['#boss-kind'].options)assert.equal(option.disabled,false);
  }
});

test('actual main controls preserve unloaded, character and in-flight summon guards',()=>{
  for(const state of [{ready:false},{v2:false},{loading:true}])for(const kind of kinds){
    const {nodes}=controls({...state,kind});for(const id of ['boss-kind','boss-count','summon-boss','open-summon'])assert.equal(nodes['#'+id].disabled,true,kind+' '+id);
    if(state.v2===false)assert.equal(nodes['#open-summon'].hidden,true);
  }
});

test('resummon label distinguishes the selected Elena phase',()=>{
  for(const [kind,phase]of [['elena',1],['mourning-elena',2]]){
    assert.equal(controls({kind,encounters:[{kind:'elena',phase}]}).nodes['#summon-boss'].textContent,'보스 다시 소환');
    assert.equal(controls({kind,encounters:[{kind:'elena',phase:3-phase}]}).nodes['#summon-boss'].textContent,'보스 소환');
  }
});

test('actual selector wiring retains each boss count and the separate goblin quantity',()=>{
  const {nodes,selection,update}=controls({kind:'bear',count:20}),handlers={};
  nodes['#goblin-count']={value:'19'};
  for(const id of ['boss-kind','boss-count'])nodes['#'+id].addEventListener=(event,handler)=>{handlers[id+':'+event]=handler;};
  const start=main.indexOf("  $('#boss-kind').addEventListener('change'"),end=main.indexOf('  for(const [selector,count,kind]',start),source=main.slice(start,end);
  new Function('deps',`const {$,bossSelection,updateSummonControls}=deps;${source}`)({$:id=>nodes[id],bossSelection:selection,updateSummonControls:update});
  const choose=kind=>{nodes['#boss-kind'].value=kind;handlers['boss-kind:change']();};
  const count=value=>{nodes['#boss-count'].value=String(value);handlers['boss-count:change']();};
  choose('elena');count(17);choose('mourning-elena');count(12);
  for(const [kind,expected]of [['bear',20],['elena',17],['mourning-elena',12]]){choose(kind);assert.equal(nodes['#boss-count'].value,String(expected));}
  assert.equal(nodes['#goblin-count'].value,'19');
});
