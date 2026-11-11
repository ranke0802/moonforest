// Story visibility is separate from quest facts: restoring a resident must never
// clear completed objectives or award a quest twice.
export const STORY_NPC_STORAGE_KEY='moonforest-story-npc-visibility-v1';
export const STORY_NPCS=Object.freeze({elder:'노년 여성',smith:'대장장이',farmer:'농부',herbalist:'약초사',youth:'청년',merchant:'상인',guard:'자경단 전사'});
const valid=id=>Object.hasOwn(STORY_NPCS,id);
export function createStoryNpcSettings({world,storage}){
 let removed=new Set();
 try{const data=JSON.parse(storage?.getItem(STORY_NPC_STORAGE_KEY)??'null');if(data?.version===1&&Array.isArray(data.removed))removed=new Set(data.removed.filter(valid));}catch{}
 const getId=encounter=>encounter?.storyNpcId??encounter?.config?.npc?.interactionId;
 function syncEncounter(encounter){
  const actor=encounter?.actor,id=getId(encounter);if(!actor||actor.isDisposed?.()||!valid(id))return;
  const suppress=world.mapId==='village'&&removed.has(id);
  if(suppress&&!encounter.storyNpcSuppressed){encounter.storyNpcPreviousEnabled=actor.isEnabled(false);encounter.storyNpcSuppressed=true;actor.setEnabled(false);}
  else if(!suppress&&encounter.storyNpcSuppressed){actor.setEnabled(encounter.storyNpcPreviousEnabled!==false);delete encounter.storyNpcPreviousEnabled;delete encounter.storyNpcSuppressed;}
 }
 function sync(){
  const seen=new Set(),all=[...(world.battle?.encounters??[]),...(world.developmentActors?.population?.entries??[]).map(row=>row.adapter?.encounter)];
  for(const encounter of all)if(encounter&&!seen.has(encounter)){seen.add(encounter);syncEncounter(encounter);}
 }
 return {
  list:()=>Object.entries(STORY_NPCS).map(([id,name])=>({id,name,removed:removed.has(id)})),
  isRemoved:id=>valid(id)&&removed.has(id),
  syncEncounter,
  setRemoved(ids){if(!Array.isArray(ids)||ids.some(id=>!valid(id)))throw Error('스토리 NPC 목록을 확인하세요.');if(!storage)throw Error('NPC 변경을 저장할 공간이 없습니다.');const next=new Set(ids);storage.setItem(STORY_NPC_STORAGE_KEY,JSON.stringify({version:1,removed:[...next].sort()}));removed=next;sync();},
  sync,
 };
}
