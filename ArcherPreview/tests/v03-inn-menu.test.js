// 2026-11-27, user: "여관 주인과 대화할 때도 바로 숙박하는게 아니라 숙박할지 말지 선택하게
// 다른 npc 상점창처럼 구현해줘." The innkeeper greets in one line over [대화하기 / 숙박 /
// 대화 종료]; only 숙박 rests (health, potions, the journey written down).
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {CHOICE_ARM_MS} from '../src/v03/dialogue.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';
import {serviceMenu,STORY_SERVICES} from '../src/v03/service-menu.js';
import {createStory} from '../src/v03/story.js';
import {QUESTS,NPCS,DIALOGUES,TIPS} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';

// Whole lines at once: one Next per line (typing is covered by v03-typewriter).
setTypewriterEnabled(false);
const tick=async(n=4)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};
const armed=()=>new Promise(resolve=>setTimeout(resolve,CHOICE_ARM_MS+30));
function inn({quest='M05',step=1,shop=true}={}){
 setPack('ko',ko);
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 journey.setItem('v03-story-v1',JSON.stringify({quest:QUESTS.findIndex(row=>row.id===quest),step,count:0,done:[]}));
 const player={position:{x:0,z:0}},rests=[],touches=[];
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,creditGold:(_s,n)=>n,addPotions:n=>n,toast(){},
  rest:()=>{rests.push(1);return true;},...(shop?{openTownShop:async()=>{}}:{})};
 const story=createStory({api,doc:document,save:{journey,touch:patch=>{touches.push(patch);return true;}},content:{QUESTS,NPCS,DIALOGUES,TIPS},createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start();
 const frame=()=>story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
 frame();const at=story.castVisual('innkeeper').position;player.position.x=at.x;player.position.z=at.z;frame();
 const $=selector=>document.querySelector(selector),entries=()=>[...document.querySelectorAll('.v03-dialogue-choice')];
 const menuUp=()=>!$('.v03-dialogue-choices').hidden;
 // Reads n lines, one Next each, then lets the window settle.
 async function lines(n){const said=[];for(let i=0;i<n;i++){said.push($('.v03-dialogue-text').textContent);$('.v03-dialogue-next').click();await tick(2);}await tick();return said;}
 return {document,story,rests,touches,values,$,entries,menuUp,lines,frame,open:async()=>{$('.v03-prompt').click();await tick();}};
}

test('the innkeeper asks first: one greeting over talk / rest / leave; opening the menu does not rest',async()=>{
 const v=inn();
 try{
  await v.open();
  assert.equal(v.story.dialogueOpen,true);assert.equal(v.menuUp(),true);
  assert.deepEqual(v.entries().map(node=>node.textContent),['대화하기','숙박','대화 종료']);
  assert.equal(v.$('.v03-dialogue-who').textContent,'여관 주인');
  assert.equal(v.$('.v03-sr-only').textContent,'어서 와. 쉬어 갈 텐가, 얘기나 할 텐가?');
  assert.deepEqual(v.rests,[]);
  // 대화하기: his idle line (which used to rest) only talks, then the choices again.
  await armed();v.entries()[0].click();await tick();
  assert.deepEqual(await v.lines(DIALOGUES['inn-idle'].length),DIALOGUES['inn-idle'].map(line=>line.text));
  assert.ok(DIALOGUES['inn-idle'].some(line=>line.effects?.includes('rest')),'the line still carries the effect for menu-less callers');
  assert.equal(v.menuUp(),true,'back at the choices');assert.deepEqual(v.rests,[],'talking does not rest');
  // 숙박: rests once, writes the journey, says so, and the talk ends.
  await armed();v.entries()[1].click();await tick();
  assert.deepEqual(v.rests,[1]);assert.ok(v.touches.length>=1);assert.equal(v.story.dialogueOpen,false);
  assert.equal(v.$('.v03-banner').textContent,ko.ui['hud.rested']);
 }finally{v.story.dispose();}
});

test('ending the talk or Escape never rests',async()=>{
 const v=inn();
 try{
  await v.open();await armed();v.entries()[2].click();await tick();
  assert.equal(v.story.dialogueOpen,false);assert.deepEqual(v.rests,[]);
  v.frame();await v.open();await armed();
  const event=new (v.document.defaultView.Event)('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'code',{value:'Escape'});v.document.dispatchEvent(event);await tick();
  assert.equal(v.story.dialogueOpen,false);assert.deepEqual(v.rests,[]);
 }finally{v.story.dispose();}
});

test('a quest line with him comes first under 대화하기 (marked), as with the smith; the quest completes without resting',async()=>{
 for(const [quest,step,dialogue,next] of [['M01',0,'inn-arrive','M02'],['M02',1,'inn-report','M03']]){
  const v=inn({quest,step});
  try{
   await v.open();
   assert.deepEqual(v.entries().map(node=>'mark' in node.dataset),[true,false,false],quest+': the talk entry is marked');
   await armed();v.entries()[0].click();await tick();
   assert.deepEqual(await v.lines(DIALOGUES[dialogue].length),DIALOGUES[dialogue].map(line=>line.text),quest);
   assert.equal(v.story.log.quest().id,next,quest+' done');assert.deepEqual(v.rests,[],quest+': no rest from the quest line');
   assert.deepEqual(v.entries().map(node=>'mark' in node.dataset),[false,false,false],'nothing waits any more');
   await armed();v.entries()[1].click();await tick();assert.deepEqual(v.rests,[1]);
  }finally{v.story.dispose();}
 }
});

test('without the town shops (the shell) the inn menu still stands: resting needs no shop window',async()=>{
 const v=inn({shop:false});
 try{await v.open();assert.equal(v.menuUp(),true);assert.deepEqual(v.entries().map(node=>node.textContent),['대화하기','숙박','대화 종료']);}finally{v.story.dispose();}
});

test('the menu and the greeting in every language',()=>{
 assert.deepEqual([...STORY_SERVICES],['rest']);
 try{
  for(const [lang,pack] of Object.entries({ko,en,ja,vi,zh})){
   setPack(lang,pack);
   assert.deepEqual(serviceMenu('innkeeper').map(entry=>entry.label),['talk','rest','leave'].map(id=>pack.ui['talk.menu.'+id]),lang);
   const hello=lang==='ko'?DIALOGUES['inn-menu'][0].text:pack.story.dialogues['inn-menu']?.[0];
   assert.ok(hello&&hello.length<=48,lang);
  }
 }finally{setPack('ko',ko);}
 assert.equal(NPCS.find(npc=>npc.id==='innkeeper').menu,'inn-menu');
});
