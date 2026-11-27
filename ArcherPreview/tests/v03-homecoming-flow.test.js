// 2026-11-27 homecoming line in play: reunions once per save, the forest clues that stand
// only while their step waits on them, and a camp boss felled before its step.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {QUESTS,ERRANDS,NPCS,DIALOGUES,REUNIONS} from '../src/v03/data/chapter1.js';
import {createStory} from '../src/v03/story.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const settle=async(n=3)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};
function play(questId,stepId,{map='village',greeted=null}={}){
 setPack('ko',ko);
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>'),journey=memory(),player={position:{x:0,z:0}},made=[];
 const quest=QUESTS.findIndex(q=>q.id===questId),step=QUESTS[quest].steps.findIndex(s=>s.id===stepId);
 journey.setItem('v03-story-v1',JSON.stringify({v:2,id:questId,quest,step,count:0,done:[]}));
 if(greeted)journey.setItem('v03-greeted-v1',JSON.stringify(greeted));
 const world={scene:{isDisposed:false},mapId:map,terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,creditGold:(_s,n)=>n,addPotions:n=>n,toast(){},rest(){}};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,ERRANDS,NPCS,DIALOGUES,REUNIONS},
  createVisual:(_scene,key,{id})=>{const v={id,key,disposed:false,place(x,y,z){this.position={x,y,z};},dispose(){this.disposed=true;}};made.push(v);return v;}});
 story.start();
 const frame=()=>story.update(1/60,{ready:true,mapId:map,character:'x'});frame();
 const castIds=()=>story.inspect().cast.map(row=>row.id);
 async function talk(id){
  const at=story.castVisual(id).position;Object.assign(player.position,{x:at.x,z:at.z});frame();
  const label=document.querySelector('.v03-prompt')?.getAttribute('aria-label');
  document.querySelector('.v03-prompt').click();const said=[];
  for(let i=0;i<40&&story.dialogueOpen;i++){const text=document.querySelector('.v03-dialogue-text').textContent;if(text!==said.at(-1))said.push(text);document.querySelector('.v03-dialogue-next').click();await settle(1);}
  await settle();frame();return {said,label};
 }
 return {story,frame,castIds,talk,made,journey,player};
}

test('the father: a reunion once before the quest talk, then plain talk',async()=>{
 const h=play('M10','father');
 try{
  const first=await h.talk('foster-father');
  assert.equal(first.said[0],DIALOGUES['instructor-greet'][0].text);
  assert.equal(first.said.length,DIALOGUES['instructor-greet'].length+DIALOGUES['instructor-call'].length);
  assert.equal(h.story.log.quest().id,'M03');
  const second=await h.talk('foster-father');
  assert.deepEqual(second.said,[DIALOGUES['instructor-idle'][0].text],'no second reunion');
  assert.deepEqual(JSON.parse(h.journey.getItem('v03-greeted-v1')),['foster-father']);
 }finally{h.story.dispose();}
});

test('Jeffrey is named, and his first meeting can come before or inside a quest talk',async()=>{
 const h=play('M04','ask');
 try{
  const {said,label}=await h.talk('youth');
  assert.equal(label,'제프리와 이야기하기');
  assert.equal(said.length,DIALOGUES['youth-greet'].length+DIALOGUES['jeffrey-bear'].length);
  assert.equal(h.story.log.step().id,'bear');
 }finally{h.story.dispose();}
});

test('forest clues stand only while their step waits on them; a boss felled early still counts',async()=>{
 const h=play('M07','goblins',{map:'monster-forest'});
 try{
  assert.deepEqual(h.castIds(),[],'no clue during the camp fight');
  // The hobgoblin falls during the camp fight (it is a goblin too).
  h.story.defeat({kind:'hobgoblin-boss',family:'goblin'});
  for(let i=0;i<4;i++)h.story.defeat({kind:'goblin-warrior',family:'goblin'});
  h.frame();assert.equal(h.story.log.step().id,'clues');
  assert.deepEqual(h.castIds().sort(),['clue-armor','clue-poison','clue-sword']);
  assert.ok(h.made.filter(v=>v.key.startsWith('clue-')).every(v=>!v.disposed));
  const sword=await h.talk('clue-sword');
  assert.equal(sword.label,'할리안의 검 살펴보기');assert.deepEqual(sword.said,DIALOGUES['clue-sword'].map(l=>l.text));
  assert.ok(!h.castIds().includes('clue-sword'),'looked at: it goes');
  assert.equal(h.story.log.objective(),'야영지 주변 살펴보기 (1/3)');
  await h.talk('clue-poison');await h.talk('clue-armor');
  // The hobgoblin already fell on this visit: the step passes at once, and the trace appears.
  h.frame();h.frame();assert.equal(h.story.log.step().id,'trace');assert.deepEqual(h.castIds(),['clue-cave']);
  // 1127-chapter: Jeffrey has followed to the cave mouth for the report (NPCS during).
  await h.talk('clue-cave');assert.equal(h.story.log.step().id,'report');assert.deepEqual(h.castIds(),['youth']);
  assert.equal(JSON.parse(h.journey.getItem('v03-greeted-v1')??'[]').length,0,'clues are not people');
 }finally{h.story.dispose();}
});

test('arriving home plays one line before the road step ends',async()=>{
 const h=play('M00','road',{map:'village',greeted:[]});
 try{
  assert.equal(h.story.dialogueOpen,true);assert.equal(h.story.log.quest().id,'M00','the step waits for the line');
 }finally{h.story.dispose();}
});
