import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createGallery} from '../src/v03/gallery.js';
import {createOpening} from '../src/v03/opening.js';
import {createTitleScreen} from '../src/v03/title-screen.js';
import {createSaveSession} from '../src/v03/save-slots.js';
import {questKey} from '../src/v03/chapter-progress.js';
import {elenaJournal} from '../src/v03/data/chapter2.js';
import * as chapter from '../src/v03/data/chapter1.js';
import {useLanguage,t,tr,cloneChapter,localizeChapter} from '../src/v03/i18n.js';
import {CHAPTER_SAVE} from '../src/chapter-quest-state.js';
import {GOLD_LEDGER_KEY} from '../src/gold-loot.js';

function fixture(){
 const values=new Map();let writes=0;
 const storage={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:key=>values.get(key)??null,
  setItem(key,value){writes++;values.set(key,String(value));},removeItem:key=>values.delete(key)};
 const save=createSaveSession({local:storage,edition:'moonforest-0.3'}),gallery=createGallery(save);
 const sections=()=>gallery.sections(chapter,elenaJournal('ko'));
 return {save,gallery,sections,get writes(){return writes;}};
}
test('the title combines discoveries in used slots, separates borrowed rigs and preserves deletion/replay boundaries',async()=>{
 await useLanguage('ko');const f=fixture();f.save.commit({title:'퀘스트 이름'});
 f.gallery.encounter({kind:'wolf',summonKind:'gray-wolf',questFamily:'corrupted-wolf'});
 f.gallery.encounter({kind:'elena',phase:2});f.gallery.encounter({kind:'goblin-archer',questFamily:'goblin'});
 const uniqueWrites=f.writes;
 for(let i=0;i<100;i++)f.gallery.encounter({kind:'wolf',regularWolfId:'gray-wolf',questFamily:'corrupted-wolf'});
 f.gallery.encounter({kind:'unreleased-monster'});assert.equal(f.writes,uniqueWrites);
 f.gallery.scene('warm');
 assert.ok(f.save.restartIn(2));f.save.commit({});f.gallery.reset();
 f.gallery.encounter({kind:'elena',phase:1});f.gallery.scene('warm');f.gallery.scene('wagon');
 const before=f.writes,[scenes,bestiary,titles]=f.sections();
 assert.equal(scenes.entries.length,2);assert.equal(scenes.total,11);assert.equal(bestiary.total,18);
 assert.deepEqual(new Set(bestiary.entries.map(row=>row.label)),new Set(['검은 늑대','비탄의 마녀 엘레나','타락한 성녀 엘레나','고블린 궁수']));
 assert.equal(titles.entries,undefined);assert.match(titles.note,/현재 획득할 수 있는 칭호가 없습니다/);
 assert.equal(f.writes,before,'opening the title never rewrites the saves');
 f.save.wipe(1);
 assert.deepEqual(f.sections()[1].entries.map(row=>row.label),['타락한 성녀 엘레나']);
 f.save.restartIn(2);f.save.commit({});f.gallery.reset();
 assert.equal(f.sections()[0].entries.length,0);assert.equal(f.sections()[1].entries.length,0);
});
test('legacy checkpoints, optional hunts and named kills restore only directly evidenced discoveries',()=>{
 const f=fixture();f.save.commit({title:'남겨진 방'});const s=f.save.journey;
 const put=(key,value)=>s.setItem(key,JSON.stringify(value));
 put(questKey(1),{quest:7,step:2,done:[],count:0});
 put(questKey(2,true),{quest:1,step:0,done:[],count:0});
 put(questKey(1)+':errands',{active:{S05:{step:0,count:1}},finished:[]});
 put(CHAPTER_SAVE,{version:1,facts:{'kill:zombie':2,'kill:fox':0,'kill:unknown':1,'kill:boar':'2','inspect:corrupted-bear':1}});
 put(GOLD_LEDGER_KEY,{version:1,balance:0,town:{progression:{quests:['E02']}}});
 const [scenes,bestiary]=f.sections();
 assert.equal(scenes.entries.length,4);assert.ok(scenes.entries.every(row=>/일지|목책|실험/.test(row.label)));
 assert.deepEqual(new Set(bestiary.entries.map(row=>row.label)),new Set(['우두머리 늑대','수호 곰','비탄의 마녀 엘레나','고블린 궁수','좀비']));
 put(questKey(1),{quest:chapter.QUESTS.length,step:9,done:[]});put(questKey(2,true),{});
 s.setItem(CHAPTER_SAVE,'syntax error');put(GOLD_LEDGER_KEY,{version:2,balance:0,town:{progression:{quests:['E02']}}});
 assert.deepEqual(f.sections()[1].entries.map(row=>row.label),['고블린 궁수']);
 assert.equal(f.sections()[0].entries.length,0);
});
test('skipping a running dream records the displayed painting only; translations name the discovered entries',async()=>{
 const f=fixture();f.save.commit({});const {document}=parseHTML('<html><body></body></html>');
 const opening=createOpening({doc:document,onCut:f.gallery.scene,typing:()=>false,wait:async()=>{
  if(document.querySelector('.v03-opening-plane.is-in'))document.querySelector('.v03-opening-skip').click();
 }});
 assert.equal(await opening.play(),'skipped');opening.dispose();
 f.gallery.encounter({kind:'ghoul-warrior'});
 for(const lang of ['ko','en','ja','zh','vi']){
  await useLanguage(lang);
  const localized=localizeChapter(cloneChapter(chapter),chapter);
  const title=createTitleScreen({doc:document,wait:async()=>{}});title.show();
  const done=title.showGallery({sections:f.gallery.sections(localized,elenaJournal(lang))});
  const scenes=title.element.querySelector('[data-category=scenes]'),bestiary=title.element.querySelector('[data-category=bestiary]');
  assert.equal(scenes.querySelectorAll('li').length,1);assert.match(scenes.querySelector('img').src,/00\.webp/);
  assert.equal(scenes.querySelector('li').textContent,t('meta.dream'));
  assert.equal(bestiary.querySelector('li').textContent,tr('구울 전사'));
  if(lang!=='ko')assert.doesNotMatch(title.element.querySelector('.v03-gallery').textContent,/[가-힣]/);
  title.closePanel();await done;title.dispose();
 }
 await useLanguage('ko');
});
