// 0.3 languages: every locale covers every ui key and every story id, and the
// runtime lays translations over the Korean source without losing structure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,t,tr,setPack,useLanguage,language,cloneChapter,localizeChapter,speaker,readLanguage,writeLanguage,LANG_KEY} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';
import * as chapter1 from '../src/v03/data/chapter1.js';

const others=LANGUAGES.filter(row=>row.id!=='ko').map(row=>row.id);
for(const id of others)test(`locale ${id} is complete`,async()=>{
 const pack=(await import(`../src/v03/locales/${id}.js`)).default,missing=[];
 for(const key of Object.keys(ko.ui))if(!(key in pack.ui))missing.push('ui:'+key);
 for(const key of Object.keys(pack.ui))if(!(key in ko.ui))missing.push('unknown ui:'+key);
 for(const [dialogue,lines] of Object.entries(chapter1.DIALOGUES)){const out=pack.story.dialogues[dialogue];if(out?.length!==lines.length)missing.push(`dialogue:${dialogue} (${out?.length}/${lines.length})`);}
 for(const quest of chapter1.QUESTS){
  const out=pack.story.quests[quest.id];if(!out?.title)missing.push('quest:'+quest.id);
  for(const step of quest.steps){if(!out?.steps?.[step.id])missing.push(`step:${quest.id}/${step.id}`);if(step.arrival&&!out?.arrivals?.[step.id])missing.push(`arrival:${quest.id}/${step.id}`);}
 }
 for(const hint of chapter1.COMBAT_HINTS)for(const key of ['text','keys','touch'])if(!pack.story.hints[hint.id]?.[key])missing.push(`hint:${hint.id}.${key}`);
 for(const tip of chapter1.TIPS)for(const key of ['title','keys','touch','text'])if(!pack.story.tips[tip.id]?.[key])missing.push(`tip:${tip.id}.${key}`);
 const speakers=new Set(Object.values(chapter1.DIALOGUES).flat().map(line=>line.who));
 for(const name of speakers)if(!pack.story.speakers[name])missing.push('speaker:'+name);
 if(!pack.story.endNote)missing.push('endNote');
 assert.deepEqual(missing,[]);
});
test('Korean is the source: params, particles, fallbacks',()=>{
 setPack('ko',ko);
 assert.equal(t('confirm.overwrite',{slot:2}),'2번 기록을 지우고 새로 시작합니다. 되돌릴 수 없습니다.');
 assert.equal(t('prompt.talkQuest',{name:'여관 주인'}),'여관 주인과 이야기하기');assert.equal(t('prompt.talkQuest',{name:'마부'}),'마부와 이야기하기');
 assert.equal(t('no.such.key'),'no.such.key');assert.equal(tr('검 공격'),'검 공격');assert.equal(speaker('마부'),'마부');
});
test('a language pack translates story, ui and shared-game text in place',async()=>{
 const pack=(await import('../src/v03/locales/en.js')).default;setPack('en',pack);
 const content=cloneChapter(chapter1),quests=content.QUESTS;
 localizeChapter(content,chapter1);
 assert.equal(content.QUESTS,quests,'same objects: the quest log keeps its references');
 assert.equal(content.QUESTS[0].title,'The Wolf and the Wagon');assert.equal(content.DIALOGUES['driver-idle'][0].who,'마부','speaker keys stay Korean (portraits)');
 assert.equal(speaker('마부'),'Driver');assert.equal(t('prompt.talkQuest',{name:'Driver'}),'Talk to Driver');
 assert.equal(tr('검 공격'),'Sword');assert.equal(tr('회복 2/4'),'Healing 2/4');assert.equal(tr('처음 보는 문장'),'처음 보는 문장');
 assert.equal(chapter1.QUESTS[0].title,'늑대와 마차','the Korean source is untouched');
 setPack('ko',ko);localizeChapter(content,chapter1);assert.equal(content.QUESTS[0].title,'늑대와 마차','switching back restores Korean');
});
test('the chosen language is stored and validated',async()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 assert.equal(readLanguage(storage),null);assert.equal(writeLanguage(storage,'xx'),false);
 assert.equal(writeLanguage(storage,'ja'),true);assert.equal(store.get(LANG_KEY),'ja');assert.equal(readLanguage(storage),'ja');
 assert.equal(await useLanguage('vi'),'vi');assert.equal(language(),'vi');assert.equal(t('menu.new'),'Chơi mới');
 assert.equal(await useLanguage('nope'),'ko');assert.equal(t('menu.new'),'새로하기');
});
