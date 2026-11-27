import {MONSTER_NAMES} from '../monster-selection.js';
import {GOLD_LEDGER_KEY} from '../gold-loot.js';
import {CHAPTER_SAVE} from '../chapter-quest-state.js';
import {CHAPTER_COMBAT} from './chapter-enemy-brain.js';
import {questKey} from './chapter-progress.js';
import {createQuestLog} from './quests.js';
import {createErrandLog} from './errands.js';
import {INTRO,DREAM_BEATS} from './opening.js';
import {t,tr} from './i18n.js';

const monsters={
 ...MONSTER_NAMES,bear:'수호 곰',wolf:'우두머리 늑대',elena:'타락한 성녀 엘레나','mourning-elena':'비탄의 마녀 엘레나',
 ...Object.fromEntries(Object.entries(CHAPTER_COMBAT).map(([id,row])=>[id,row.name])),
 'corrupted-wolf':'검은 늑대','corrupted-bear':'마물화된 검은곰',
};
const aliases={'alpha-wolf':'wolf','guardian-bear':'bear','wild-boar':'boar','wolf-2':'stylized-wolf','hooded-goblin':'goblin',hobgoblin:'hobgoblin-boss','black-wolf':'corrupted-wolf','black-bear':'corrupted-bear'};
const monsterKeys=Object.fromEntries(Object.keys(monsters).map(id=>[id,'foe:'+id]));
function monsterId(kind,phase){
 const id=kind==='elena'&&phase===2?'mourning-elena':(Object.hasOwn(aliases,kind)?aliases[kind]:kind);
 return Object.hasOwn(monsters,id)?id:null;
}
const journalScene=step=>step.reading??(step.dialogues&&Object.values(step.dialogues)[0]);
const prefix='v03-gallery-v1:';

// The title combines the three existing slots. A separate, additive fact per
// discovery lets two tabs discover different entries without replacing either.
export function createGallery(save){
 const observed=new Set(),unwritten=new Set();
 let slot=save.slot;
 function reset(){slot=save.slot;observed.clear();unwritten.clear();}
 function mark(key){
  if(slot!==save.slot)reset();
  if(observed.has(key))return;
  observed.add(key);
  try{if(save.journey.getItem(prefix+key)!=='1')save.journey.setItem(prefix+key,'1');}
  catch{unwritten.add(key);}
 }
 return {
  reset,
  scene(id){mark('scene:'+id);},
  encounter(foe){
   // Tinted cave beasts borrow a regular encounter/rig and keep their true kind in questFamily.
   const kind=foe?.questFamily?.startsWith('corrupted-')?foe.questFamily:(foe?.regularWolfId??foe?.summonKind??foe?.kind);
   const id=monsterId(kind,foe?.phase);
   if(id)mark(monsterKeys[id]);
  },
  sections(chapter,journal){
   const sceneRows=new Map([['intro',{label:t('meta.dream'),image:INTRO.image}],
    ...DREAM_BEATS.map(beat=>[beat.tone,{label:t(beat.key).split('\n')[0],image:beat.image}]),
    ['wagon',{label:chapter.QUESTS.find(row=>row.id==='M00')?.title??t('meta.dream')}],
   ]);
   for(const quest of journal.QUESTS)for(const step of quest.steps){
    const id=journalScene(step);
    if(id)sceneRows.set(id,{label:step.text,image:journal.DIALOGUES[id]?.[0]?.illustration});
   }
   const found=new Set();
   for(const meta of save.index()){
    if(!meta.used)continue;
    const storage=save.inspectSlot(meta.slot);
    if(meta.slot===slot)for(const key of unwritten)found.add(key);
    for(const key of sceneRows.keys())if(storage.getItem(prefix+'scene:'+key)==='1')found.add('scene:'+key);
    for(const id of Object.keys(monsters))if(storage.getItem(prefix+'foe:'+id)==='1')found.add('foe:'+id);
    restoreDiscoveries(storage,chapter,journal,found);
   }
   return [
    {id:'scenes',label:t('gallery.scenes'),total:sceneRows.size,entries:[...sceneRows].filter(([id])=>found.has('scene:'+id)).map(([,row])=>row)},
    {id:'bestiary',label:t('gallery.bestiary'),total:Object.keys(monsters).length,entries:Object.entries(monsters).filter(([id])=>found.has('foe:'+id)).map(([,label])=>({label:tr(label)}))},
    {id:'titles',label:t('gallery.titles'),note:t('gallery.noTitles')},
   ];
  },
 };
}
function read(storage,key){try{return JSON.parse(storage.getItem(key));}catch{return null;}}
function restoreDiscoveries(storage,chapter,journal,found){
 const addFoe=(kind,phase)=>{const id=monsterId(kind,phase);if(id)found.add('foe:'+id);};
 const facts=read(storage,CHAPTER_SAVE);
 if(facts?.version===1)for(const [key,count] of Object.entries(facts.facts??{})){
  if(key.startsWith('kill:')&&Number.isSafeInteger(count)&&count>0)addFoe(key.slice(5));
 }
 // A current or finished step proves its explicitly required species. Generic
 // hunts, a goblin family match and an unspecified Elena phase cannot identify one.
 function credit(step,id,complete){
  if(id===2&&complete&&journalScene(step))found.add('scene:'+journalScene(step));
  if(step.type==='defeat'&&step.kind&&step.kind!=='goblin'&&(step.kind!=='elena'||step.phase))addFoe(step.kind,step.phase);
 }
 for(const [id,episode] of [[1,chapter],[2,journal]])for(const replay of [false,true]){
  const key=questKey(id,replay),log=createQuestLog({storage,key,quests:episode.QUESTS});
  if(!log.load())continue;
  const cursor=log.snapshot();
  if(log.finished&&cursor.step!==0)continue;
  // An old chapter 1 record (quest-migration.js) also stands for the errand that took over a main quest.
  const moved=id===1?log.migration?.errand:null,taken=moved&&(chapter.ERRANDS??[]).find(row=>row.id===moved.id);
  if(taken)taken.steps.forEach((step,i)=>{if(moved.state==='finished'||moved.state.step>i||moved.state.step===i&&moved.state.count>0)credit(step,1,true);});
  for(let q=0;q<=cursor.quest&&q<episode.QUESTS.length;q++){
   episode.QUESTS[q].steps.forEach((step,i)=>{
    if(q<cursor.quest||i<cursor.step)credit(step,id,true);
    else if(q===cursor.quest&&i===cursor.step&&cursor.count>0&&step.type==='defeat')credit(step,id,false);
   });
  }
 }
 const errands=chapter.ERRANDS??[];
 for(const key of ['v03-errands-v1',questKey(1)+':errands',questKey(1,true)+':errands']){
  const log=createErrandLog({storage,key,errands});if(!log.load())continue;
  const {active,finished}=log.snapshot();
  for(const errand of errands)errand.steps.forEach((step,i)=>{
   const row=active[errand.id];
   if(finished.includes(errand.id)||(row&&(row.step>i||(row.step===i&&row.count>0))))credit(step,1,false);
  });
 }
 // Quest XP is awarded once after completion, independently of the story checkpoint.
 const ledger=read(storage,GOLD_LEDGER_KEY);
 if(ledger?.version===1&&Number.isSafeInteger(ledger.balance)&&ledger.balance>=0&&Array.isArray(ledger.town?.progression?.quests)){
  const earned=new Set(ledger.town.progression.quests);
  for(const [id,quests] of [[1,[...chapter.QUESTS,...errands]],[2,journal.QUESTS]]){
   for(const quest of quests)if(earned.has(quest.id))for(const step of quest.steps)credit(step,id,true);
  }
 }
}
