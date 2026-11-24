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
