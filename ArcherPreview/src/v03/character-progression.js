import {questKey} from './chapter-progress.js';
import {readCursor} from './quests.js';

export const CHAPTER_LEVEL_CAP=20;
export const SKILL_REFUND_GOLD=100;
export const PASSIVE_LIMITS=Object.freeze({weaponCare:5,guardTraining:10,endurance:10,greatAttack:5});
export const weaponWearInterval=rank=>10+5*rank;

const QUEST_XP=Object.freeze({
  M00:60,M01:40,M02:70,M03:100,M04:160,M05:180,M06:220,M07:240,M08:300,M09:180,
  // 2026-11-27 homecoming line: M02 and M05 left it (kept for saves that earned them); M06 is the driver's errand.
  M10:40,M11:120,M12:60,
  S01:55,S02:50,S03:65,S04:75,S05:95,S06:100,E01:80,E02:180,
});
const MONSTER_XP=Object.freeze({
  fox:10,boar:16,'wild-boar':16,'gray-wolf':18,'stylized-wolf':18,'wolf-2':18,'wolf-3':18,
  wolf:100,'alpha-wolf':100,bear:110,'guardian-bear':110,goblin:18,'hooded-goblin':18,
  'goblin-warrior':24,'goblin-archer':26,'goblin-shaman':34,hobgoblin:72,'hobgoblin-boss':72,
  zombie:28,'ghoul-warrior':42,'corrupted-wolf':45,'black-wolf':45,'corrupted-bear':80,'black-bear':80,
  elena:180,'mourning-elena':180,
});
export const monsterExperience=kind=>Object.hasOwn(MONSTER_XP,kind)?MONSTER_XP[kind]:0;
export const questExperience=id=>Object.hasOwn(QUEST_XP,id)?QUEST_XP[id]:0;

// The first level takes 40 XP. Each subsequent level takes 10 more.
const threshold=level=>(level-1)*(40+5*(level-2));
export const MAX_TOTAL_XP=threshold(CHAPTER_LEVEL_CAP);
const integer=(n,max)=>Number.isSafeInteger(n)?Math.max(0,Math.min(n,max)):0;
function levelAt(xp){
  let level=1;
  while(level<CHAPTER_LEVEL_CAP&&xp>=threshold(level+1))level++;
  return level;
}
export function normalizeProgression(raw){
  const totalXp=integer(raw?.totalXp,MAX_TOTAL_XP),skills={};
  let available=levelAt(totalXp);
  for(const [id,max] of Object.entries(PASSIVE_LIMITS)){
    skills[id]=integer(raw?.skills?.[id],Math.min(max,available));
    available-=skills[id];
  }
  const known=new Set(Array.isArray(raw?.quests)?raw.quests:[]);
  return {totalXp,skills,quests:Object.keys(QUEST_XP).filter(id=>known.has(id))};
}
export function progressionStatus(state){
  const level=levelAt(state.totalXp),spent=Object.values(state.skills).reduce((a,b)=>a+b,0);
  return {level,cap:CHAPTER_LEVEL_CAP,totalXp:state.totalXp,xp:state.totalXp-threshold(level),
    nextXp:level===CHAPTER_LEVEL_CAP?0:threshold(level+1)-threshold(level),points:level-spent,spent,skills:{...state.skills}};
}
// Uses only normal chapter logs of the current slot. This also repairs a quest saved
// immediately before its XP transaction was interrupted. Replay logs are separate.
export function recordedQuestIds(storage,questSets){
  function read(key){try{return JSON.parse(storage?.getItem(key)??'null');}catch{return null;}}
  const ids=[];
  for(const [chapter,quests] of Object.entries(questSets)){
    if(!Array.isArray(quests))continue;
    const key=questKey(Number(chapter)),log=read(key);
    // Read as the quest log reads it (format 2, or an old index moved by quest-migration.js).
    const cursor=readCursor(log,quests);
    if(cursor)for(const row of quests.slice(0,cursor.quest))ids.push(typeof row==='string'?row:row.id);
    const errands=read(key+':errands');
    if(Array.isArray(errands?.finished))ids.push(...errands.finished.filter(id=>questExperience(id)));
  }
  const legacy=read('v03-errands-v1');
  if(Array.isArray(legacy?.finished))ids.push(...legacy.finished.filter(id=>questExperience(id)));
  return [...new Set(ids)];
}
