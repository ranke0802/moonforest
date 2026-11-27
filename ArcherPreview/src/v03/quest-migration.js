// Chapter 1 main-line saves (v03-story-v1) written before 2026-11-27 kept the
// cursor as an index into the old order M00…M09. The 11/27 homecoming flow
// (Docs: .cache/handoff/opus-wip/1127-story) reorders the line, so an old
// cursor is moved to the nearest point of the new one when it is read.
// Pure data and logic: no DOM, no storage.
export const LEGACY_ORDER=Object.freeze(['M00','M01','M02','M03','M04','M05','M06','M07','M08','M09']);
// The alpha-wolf hunt (old main quest M06) became the driver's errand with the same id.
export const ALPHA_ERRAND='M06';
// Old [quest, step index] -> {id, step (step id), keep: carry count/done, errand}.
// errand: the alpha errand's state ('finished' or {step,count}); absent = not offered yet.
function rule(id,step,count){
 switch(id){
  case 'M00':return {id:'M00',index:step,keep:true};
  case 'M01':return {id:'M01',step:'inn'};
  case 'M02':return {id:'M10',step:'father'};
  case 'M03':return step===0?{id:'M10',step:'father'}:step===1?{id:'M03',step:'hunt',keep:true}:{id:'M03',step:'report'};
  case 'M04':return step===0?{id:'M04',step:'father'}:{id:'M04',step:'report'};
  case 'M05':return {id:'M11',step:'herbalist'};
  case 'M06':return {id:'M11',step:'herbalist',errand:step===1?{step:0,count}:step===2?{step:1,count:0}:null};
  case 'M07':return {...(step===0?{id:'M11',step:'herbalist'}:step===1?{id:'M07',step:'goblins',keep:true}:{id:'M07',step:'clues'}),errand:'finished'};
  case 'M08':return {id:'M08',step:'saint',keep:true,errand:'finished'};
  case 'M09':return {id:'M09',step:'report',errand:'finished'};
  default:return null;
 }
}
// Whether this quest list is the reordered chapter 1 line.
export const isHomecomingLine=quests=>Array.isArray(quests)&&quests.some(quest=>quest?.id==='M10')&&quests[0]?.id==='M00';
// value: a parsed legacy record {quest,step,count,done}. Returns the cursor on
// `quests` plus {migrated:true, errand} or null when the record is not usable.
export function migrateLegacyCursor(value,quests){
 const old=value.quest,count=Math.max(0,Number(value.count)||0),done=Array.isArray(value.done)?value.done.filter(v=>typeof v==='string').slice(0,32):[];
 if(old===LEGACY_ORDER.length)return {quest:quests.length,step:value.step,count,done,migrated:true,errand:{id:ALPHA_ERRAND,state:'finished'}};
 const target=rule(LEGACY_ORDER[old],value.step,count);if(!target)return null;
 const quest=quests.findIndex(row=>row.id===target.id);if(quest<0)return null;
 const steps=quests[quest].steps,step=target.index??steps.findIndex(row=>row.id===target.step);
 if(step<0||step>=steps.length)return null;
 return {quest,step,count:target.keep?count:0,done:target.keep?done:[],migrated:true,errand:target.errand?{id:ALPHA_ERRAND,state:target.errand}:null};
}
