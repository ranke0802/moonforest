import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAPTER_CAMPS,chapterQuestFamily,createChapterWildlife} from '../src/v03/chapter-wildlife.js';
import {createChapterResidentVisits} from '../src/v03/chapter-resident-visits.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {mapNavigation} from '../src/world.js';

test('all homes are clear on the real forest and cave navigation, including the larger bear',()=>{
  for(const [map,rows] of Object.entries(CHAPTER_CAMPS)){
    const cave=map==='witch-cave';setWorldCharacter(cave?'warrior-v5':'warrior-v4');
    const nav=mapNavigation({cave,forest:!cave,village:true,gameplayV03:true});
    assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
    for(const row of rows)assert.ok(nav.free(row,row.kind==='corrupted-bear'?1.2:.68),row.id+' is blocked');
  }
  assert.equal(chapterQuestFamily('goblin-shaman'),'goblin');
  assert.equal(chapterQuestFamily('ghoul-warrior'),'ghoul-warrior');
});
test('only nearby actors prepare serially, give one reward per life and dispose on map change',async()=>{
  const world={scene:{isDisposed:false},mapId:'monster-forest'},player={position:{x:0,z:45}};
  const rewards=[],handles=[],started=[];
  let resolveFirst,report;
  function makeEnemies({onDefeat}){
    report=onDefeat;
    return {create:async row=>{started.push(row);if(started.length===1)await new Promise(r=>{resolveFirst=r;});
      const handle={encounter:{active:true,actor:{position:row}},retired:0,dispose(){this.retired++;}};
      handles.push(handle);return handle;},dispose(){}};
  }
  const pop=createChapterWildlife({world,battle:{},getPlayer:()=>player,makeEnemies,
    makeBeasts:()=>{throw new Error('forest loaded a cave beast');},onDefeat:e=>rewards.push(e)});
  const first=pop.update(0);await Promise.resolve();pop.update(1);assert.equal(started.length,1);
  resolveFirst();await first;await pop.update(.26);
  assert.equal(started.length,2);
  for(let i=0;i<2;i++)report({id:started[0].id,kind:started[0].kind,position:player.position});
  assert.equal(rewards.length,1);assert.equal(rewards[0].family,'goblin');
  pop.dispose();assert.ok(handles.every(h=>h.retired===1));
});
test('opening the title, visiting the plains and a late village import never attach scene actors',async()=>{
  const world={scene:{isDisposed:false},mapId:'great-plains'};let opened=0,activated=0,finish;
  const visits=createChapterResidentVisits({world,battle:{},getPlayer:()=>({position:{x:0,z:0}}),
    loadVillage:()=>{opened++;return new Promise(r=>{finish=r;});},
    loadCamp:()=>{throw Error('unexpected forest import');}});
  visits.update(.1,false);visits.update(.1,true);assert.equal(opened,0);
  world.mapId='village';const p=visits.enter('village');assert.equal(opened,1);
  visits.update(.1,false);finish({createVillagePets(){activated++;}});await p;assert.equal(activated,0);
});

test('chapterCamps=0 skips both chapter libraries while still updating village residents', async t => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('https://moonforest.test/?chapterCamps=0')});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;});
  const world={scene:{isDisposed:false},mapId:'monster-forest'};
  const counts={camp:0,beast:0,pets:0,reads:0,ticks:0};
  const visits=createChapterResidentVisits({
    world,battle:{},
    getPlayer:()=>{counts.reads++;return {position:{x:0,z:0}};},
    loadCamp:async()=>{counts.camp++;return [];},
    loadBeasts:async()=>{counts.beast++;},
    loadVillage:async()=>({createVillagePets(){
      counts.pets++;return {update(){counts.ticks++;},dispose(){}};
    }}),
  });
  for(const map of ['monster-forest','witch-cave','great-plains']){
    world.mapId=map;await visits.enter(map);
    for(let i=0;i<600;i++)visits.update(1/60,true);
  }
  assert.deepEqual(counts,{camp:0,beast:0,pets:0,reads:0,ticks:0});
  world.mapId='village';await visits.enter('village');visits.update(1/60,true);
  assert.deepEqual(counts,{camp:0,beast:0,pets:1,reads:2,ticks:2});
  visits.dispose();
});

test('leaving a cave while the camp module is pending does not import cave beasts',async()=>{
  const world={scene:{isDisposed:false},mapId:'witch-cave'};
  let resolveCamp,beasts=0,admitted=0;
  const visits=createChapterResidentVisits({
    world,battle:{},getPlayer:()=>({position:{x:0,z:0}}),
    loadCamp:()=>new Promise(resolve=>{resolveCamp=resolve;}),
    loadBeasts:async()=>{beasts++;return {};},
  });
  const pending=visits.enter('witch-cave');
  world.mapId='great-plains';visits.update(.016,true);
  resolveCamp([{createChapterWildlife(){admitted++;}},{}]);
  await pending;
  assert.equal(beasts,0);assert.equal(admitted,0);
  visits.dispose();
});
