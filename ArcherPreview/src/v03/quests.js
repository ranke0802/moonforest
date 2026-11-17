// Quest progress for 0.3. Pure logic over a storage-like object: no DOM, no
// engine. One linear main line; each step listens for one kind of event.
const STORE_KEY='v03-story-v1';
export function createQuestLog({quests,storage=null,key=STORE_KEY}){
 const state={quest:0,step:0,count:0,done:[]};
 const valid=value=>value&&Number.isInteger(value.quest)&&Number.isInteger(value.step)&&value.quest>=0&&value.quest<=quests.length&&value.step>=0&&Array.isArray(value.done);
 function load(){
  try{
   const value=JSON.parse(storage?.getItem(key)??'null');
   if(!valid(value))return false;
   const quest=quests[value.quest];
   if(quest&&value.step>=quest.steps.length)return false;
   Object.assign(state,{quest:value.quest,step:value.step,count:Math.max(0,Number(value.count)||0),done:value.done.filter(v=>typeof v==='string').slice(0,32)});return true;
  }catch{return false;}
 }
 function save(){try{storage?.setItem(key,JSON.stringify(state));return true;}catch{return false;}}
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
  reset(){Object.assign(state,{quest:0,step:0,count:0,done:[]});save();},
  get finished(){return state.quest>=quests.length;},
  quest,step,
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
   if(current.type==='defeat'&&event.type==='defeat'&&(!current.kind||event.kind===current.kind)){
    state.count++;result.changed=true;if(state.count>=current.count)result.stepDone=true;else save();
   }else if(current.type==='talk'&&event.type==='talk'&&current.targets.includes(event.npc)&&!state.done.includes(event.npc)){
    state.done.push(event.npc);result.changed=true;if(state.done.length>=current.targets.length)result.stepDone=true;else save();
   }else if(current.type==='reach'&&event.type==='reach'&&event.map===current.map){result.changed=true;result.stepDone=true;}
   if(result.stepDone)result.questDone=advance();
   return result;
  },
 };
}
