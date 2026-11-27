// Quest progress for 0.3. Pure logic over a storage-like object: no DOM, no
// engine. One linear main line; each step listens for one kind of event.
import {LEGACY_ORDER,isHomecomingLine,migrateLegacyCursor} from './quest-migration.js';
const STORE_KEY='v03-story-v1';
// Saved cursor format 2 (2026-11-27): {v:2,id,quest,step,count,done}. The quest
// id ('#end' past the last quest) is what is read back; the index is kept for
// older readers. Records without v are index-only (shipped before 11/27): the
// reordered chapter 1 line moves them with quest-migration.js.
export const CURSOR_FORMAT=2,END_ID='#end';
// A stored record -> {quest,step,count,done[,migrated,errand]} on `quests` (quest
// objects, or bare ids as chapter-progress passes them), or null.
export function readCursor(value,quests){
 if(!value||typeof value!=='object'||!Array.isArray(quests)||!Number.isInteger(value.step)||value.step<0||!Array.isArray(value.done))return null;
 const count=Math.max(0,Number(value.count)||0),done=value.done.filter(v=>typeof v==='string').slice(0,32);
 if(value.v===CURSOR_FORMAT){
  const quest=value.id===END_ID?quests.length:quests.findIndex(row=>(typeof row==='string'?row:row?.id)===value.id);
  if(quest<0||quest<quests.length&&value.step>=(quests[quest].steps?.length??Infinity))return null;
  return {quest,step:value.step,count,done};
 }
 if(!Number.isInteger(value.quest)||value.quest<0)return null;
 if(isHomecomingLine(quests))return value.quest<=LEGACY_ORDER.length?migrateLegacyCursor(value,quests):null;
 if(value.quest>quests.length)return null;
 const quest=quests[value.quest];
 if(quest&&value.step>=(quest.steps?.length??Infinity))return null;
 return {quest:value.quest,step:value.step,count,done};
}
// A defeat step's actor (2026-11-27, 1127-chapter): the spawn definition the kill must come
// from (the plains alpha, not any wolf). Kills without a definition id (story summons) pass.
export function actorMatches(step,event){return !step.actor||!event.actor||event.actor===step.actor;}
// The quota part this kill fills, or null: its kind is listed and the part is not full yet.
export function openPart(step,event,done){
 for(const part of step.quota){
  if(!part.kinds.includes(event.kind)&&!part.kinds.includes(event.source))continue;
  let n=0;for(const id of done)if(id===part.id)n++;
  if(n<part.count)return part;
 }
 return null;
}
export function createQuestLog({quests,storage=null,key=STORE_KEY,settle=null}){
 const state={quest:0,step:0,count:0,done:[]};
 // Set by load() when an old record was moved: {errand} for the caller to apply, then save().
 let migration=null;
 function load(){
  try{
   const cursor=readCursor(JSON.parse(storage?.getItem(key)??'null'),quests);
   migration=null;if(!cursor)return false;
   Object.assign(state,{quest:cursor.quest,step:cursor.step,count:cursor.count,done:cursor.done});
   if(cursor.migrated)migration={errand:cursor.errand};
   return true;
  }catch{return false;}
 }
 function save(){try{storage?.setItem(key,JSON.stringify({v:CURSOR_FORMAT,id:quests[state.quest]?.id??END_ID,...state}));return true;}catch{return false;}}
 const quest=()=>quests[state.quest]??null;
 const step=()=>quest()?.steps[state.step]??null;
 function advance(){
  state.step++;state.count=0;state.done=[];
  let finished=null;
  if(state.step>=quest().steps.length){finished=quest().id;state.quest++;state.step=0;}
  save();return finished;
 }
 return {
  load,save,
  get migration(){return migration;},
  recoverSettled(hasReceipt){
   let changed=false;
   while(quest()&&hasReceipt(quest().id)){state.quest++;changed=true;}
   if(changed){state.step=0;state.count=0;state.done=[];save();}
   return changed;
  },
  reset(){Object.assign(state,{quest:0,step:0,count:0,done:[]});save();},
  get finished(){return state.quest>=quests.length;},
  quest,step,
  // Whether the main quest with this id has been completed.
  isDone(id){const index=quests.findIndex(quest=>quest.id===id);return index>=0&&(state.quest>index);},
  snapshot:()=>({...state,done:[...state.done]}),
  // Text for the tracker, e.g. "늑대를 물리치기 (1/2)".
  objective(){
   const current=step();if(!current)return '';
   if(current.type==='defeat')return `${current.text} (${Math.min(state.count,current.count)}/${current.count})`;
   if(current.type==='talk'&&current.targets.length>1)return `${current.text} (${state.done.length}/${current.targets.length})`;
   return current.text;
  },
  // Which dialogue an NPC speaks now: its quest line if it is a pending
  // target of the current step, otherwise null (the caller uses the idle line).
  dialogueFor(npc){const current=step();return current?.type==='talk'&&current.targets.includes(npc)&&!state.done.includes(npc)?current.dialogues?.[npc]??null:null;},
  isTarget(npc){const current=step();return current?.type==='talk'&&current.targets.includes(npc)&&!state.done.includes(npc);},
  // Returns {changed, stepDone, questDone} for one event.
  notify(event){
   const current=step(),result={changed:false,stepDone:false,questDone:null};if(!current||!event)return result;
   if(current.type==='defeat'&&event.type==='defeat'&&(!current.kind||event.kind===current.kind)&&actorMatches(current,event)&&(!current.map||!event.map||event.map===current.map)){
    // quota: each kill fills its kind's part; the parts filled go in done (a count saved before
    // the quota, 2026-11-27, keeps counting toward the total).
    const part=current.quota?openPart(current,event,state.done):null;
    if(!current.quota||part){
     if(part)state.done.push(part.id);
     state.count++;result.changed=true;if(state.count>=current.count)result.stepDone=true;else save();
    }
   }else if(current.type==='talk'&&event.type==='talk'&&current.targets.includes(event.npc)&&!state.done.includes(event.npc)){
    state.done.push(event.npc);result.changed=true;if(state.done.length>=current.targets.length)result.stepDone=true;else save();
   }else if(current.type==='reach'&&event.type==='reach'&&event.map===current.map){result.changed=true;result.stepDone=true;}
   if(result.stepDone){
    if(settle&&state.step===quest().steps.length-1&&!settle(quest(),current)){
     if(current.type==='defeat'){state.count--;if(current.quota)state.done.pop();}
     if(current.type==='talk')state.done.pop();
     return {changed:false,stepDone:false,questDone:null};
    }
    result.questDone=advance();
   }
   return result;
  },
 };
}
