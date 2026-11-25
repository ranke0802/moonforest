import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createStory} from '../src/v03/story.js';
import {createRunTrail} from '../src/v03/run-trail.js';
import {QUESTS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';

// Astra #211 (2026-11-25): an iPhone page died after the M05 youth's report talk
// (goblin raid done). Quest conversations now leave their stages in the run
// trail while frame diagnostics are on, so the next run's previousRun shows the
// last one reached. One small write per stage change; nothing per frame.
const memory=()=>{const values=new Map();let writes=0;return {getItem:k=>values.get(k)??null,setItem(k,v){writes++;values.set(k,String(v));},removeItem:k=>values.delete(k),get writes(){return writes;}};};
const settle=async(n=4)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};

function village(stageMark,metaSaved=true,step=1){
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const journey=memory(),log=[],player={position:{x:0,z:0}};
 const index=QUESTS.findIndex(quest=>quest.id==='M05');
 journey.setItem('v03-story-v1',JSON.stringify({quest:index,step,count:0,done:[]}));
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,
  creditGold:(source,n)=>{log.push('gold:'+source+':'+n);return n;},addPotions:n=>{log.push('potions:'+n);return n;},toast:m=>log.push('toast:'+m)};
 const save={journey,touch:meta=>{log.push('save:'+meta.titleKey);return metaSaved;}};
 const story=createStory({api,doc:document,save,content:{QUESTS,NPCS,DIALOGUES},stageMark,
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start();
 const frame=()=>story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
 frame();
 const youth=story.castVisual('youth');Object.assign(player.position,{x:youth.position.x,z:youth.position.z});frame();
 return {document,story,log,frame,api,player};
}

test('the raid overlaps the shared goblin source with its warning and only spawns after dismissal',async t=>{
 for(const exit of ['dismiss','stop','travel','map-data-changed','dispose','source-error']){
  await t.test(exit,async t=>{
   const {api,story,player,document,frame}=village(null,true,0);
   t.after(()=>story.dispose());
   const calls=[];
   let complete,preloadSignal;
   const pending=new Promise(resolve=>{complete=resolve;});
   api.battle.goblinModels={load(options){preloadSignal=options.preloadSignal;calls.push('source');return exit==='source-error'?Promise.reject(new Error('unavailable')):pending;}};
   api.battle.summon=async(_player,count,kind)=>{assert.equal(preloadSignal.aborted,false);calls.push([kind,count]);return true;};
   Object.assign(player.position,{x:0,z:-30});frame();
   assert.deepEqual(calls,[]);
   Object.assign(player.position,{x:0,z:28});frame();frame();
   assert.equal(story.dialogueOpen,true);assert.deepEqual(calls,['source']);
   if(exit==='stop')story.stop();
   if(exit==='travel')story.cancelRaidWarning(); // travel starts before the world switches map IDs
   if(exit==='map-data-changed')api.world.mapId='great-plains';
   if(exit==='dispose')story.dispose();
   if(['stop','travel','dispose'].includes(exit)){assert.equal(preloadSignal.aborted,true);assert.equal(story.dialogueOpen,false);}
   for(let i=0;i<12&&story.dialogueOpen;i++)document.querySelector('.v03-dialogue-next').click();
   await settle();
   assert.deepEqual(calls,exit==='dismiss'||exit==='source-error'?['source',['goblin',4]]:['source']);
   assert.equal(preloadSignal.aborted,true);
   complete();
  });
 }
});

test('the M05 youth report leaves asked, first line, closed, reward and saved stages once each',async()=>{
 const marks=[];const {document,story,log}=village(stage=>marks.push(stage));
 try{
  assert.equal(story.log.quest().id,'M05');assert.equal(story.log.step().id,'report');assert.equal(story.near,true);
  const before=log.length;
  document.querySelector('.v03-prompt').click();
  assert.equal(story.dialogueOpen,true);
  assert.deepEqual(marks,['talk:M05/report','talk:M05/report:line1']);
  // Tapping the prompt again while the youth talks starts nothing and writes nothing.
  for(let i=0;i<3;i++)document.querySelector('.v03-prompt')?.click();
  assert.equal(marks.length,2);
  for(let i=0;i<30&&story.dialogueOpen;i++)document.querySelector('.v03-dialogue-next').click();
  await settle();
  assert.equal(story.dialogueOpen,false);
  assert.deepEqual(marks,['talk:M05/report','talk:M05/report:line1','talk:M05/report:end','reward:M05','slot-meta-saved:M05','play']);
  assert.deepEqual(log.slice(before).filter(row=>/^(gold|potions|save):/.test(row)),['gold:v03-quest-M05:150','potions:2','save:M06']);
  assert.equal(story.log.quest().id,'M06');
 }finally{story.dispose();}
});

test('the run trail keeps the last talk stage when the page dies, and the stages of a finished talk',()=>{
 let clock=10000;const storage=memory();
 const first=createRunTrail({storage,now:()=>clock});
 clock+=5000;first.mark('play');
 const writes=storage.writes;
 clock+=1000;first.mark('talk:M05/report');first.mark('talk:M05/report');
 assert.equal(storage.writes,writes+1,'the same stage is written once');
 clock+=300;first.mark('talk:M05/report:line1');
 // The page dies here (no end()). The next run reads where it stopped.
 const second=createRunTrail({storage,now:()=>clock+60000});
 assert.equal(second.previous.startedAt,10000,'the run it reports is identified by its start');
 assert.equal(second.previous.stage,'talk:M05/report:line1');assert.equal(second.previous.ended,false);
 assert.deepEqual(second.previous.trail.slice(-3).map(([stage])=>stage),['play','talk:M05/report','talk:M05/report:line1']);
 // A talk that finishes normally: its stages and the return to play, then a normal leave.
 for(const stage of ['play','talk:M05/report','talk:M05/report:line1','talk:M05/report:end','reward:M05','slot-meta-saved:M05','play'])second.mark(stage);
 second.end();
 const third=createRunTrail({storage,now:()=>clock+120000});
 assert.equal(third.previous.ended,true);assert.equal(third.previous.stage,'play');
 assert.deepEqual(third.previous.trail.slice(-6).map(([stage])=>stage),['talk:M05/report','talk:M05/report:line1','talk:M05/report:end','reward:M05','slot-meta-saved:M05','play']);
 assert.equal(third.previous.carried?.startedAt,undefined,'only the run before is passed on');
});

test('an unavailable slot index is recorded separately from the reward',async()=>{
 const marks=[];const {document,story}=village(stage=>marks.push(stage),false);
 try{
  document.querySelector('.v03-prompt').click();
  for(let i=0;i<30&&story.dialogueOpen;i++)document.querySelector('.v03-dialogue-next').click();
  await settle();
  assert.ok(marks.includes('slot-meta-unavailable:M05'));assert.ok(!marks.includes('slot-meta-saved:M05'));
 }finally{story.dispose();}
});

test('without a stage reader (diagnostics off in boot) the story talks exactly as before',async()=>{
 const {document,story,log}=village(null);
 try{
  const before=log.length;document.querySelector('.v03-prompt').click();
  for(let i=0;i<30&&story.dialogueOpen;i++)document.querySelector('.v03-dialogue-next').click();
  await settle();
  assert.deepEqual(log.slice(before).filter(row=>/^(gold|potions|save):/.test(row)),['gold:v03-quest-M05:150','potions:2','save:M06']);
  assert.equal(story.log.quest().id,'M06');
 }finally{story.dispose();}
});

test('tearing down the scene during a conversation preserves the interruption',async()=>{
 const marks=[];const {document,story}=village(stage=>marks.push(stage));
 document.querySelector('.v03-prompt').click();
 story.dispose();await settle();
 assert.deepEqual(marks,['talk:M05/report','talk:M05/report:line1','talk:M05/report:cancel']);
});
