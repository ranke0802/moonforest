// Optional errands (선택 의뢰) for 0.3: villagers' requests between main
// quests. Pure logic over a storage-like object (no DOM, no engine), next to
// the linear main line in quests.js.
//
// An errand is offered by its giver once the main quest `after` is done. Its
// steps run in order and use the main step types (defeat, talk, reach) plus
// deliver {item,count,targets}: handing items over when talking to a target,
// and town {action,item?}: a village service event (craft, forge, repair, buy).
// Any number of errands can be active; events advance every active errand.
const STORE_KEY='v03-errands-v1';
export function createErrandLog({errands=[],storage=null,key=STORE_KEY,settle=null}){
 const byId=new Map(errands.map(errand=>[errand.id,errand]));
 // active: id -> {step,count}; finished: ids in completion order.
 let state={active:{},finished:[]};
 const valid=value=>value&&typeof value.active==='object'&&value.active&&Array.isArray(value.finished);
 function load(){
  try{
   const value=JSON.parse(storage?.getItem(key)??'null');
   if(!valid(value))return false;
   const active={};
   for(const [id,row] of Object.entries(value.active)){
    const errand=byId.get(id);
    if(errand&&Number.isInteger(row?.step)&&row.step>=0&&row.step<errand.steps.length)active[id]={step:row.step,count:Math.max(0,Number(row.count)||0)};
   }
   state={active,finished:value.finished.filter(id=>byId.has(id)&&!active[id]).slice(0,64)};return true;
  }catch{return false;}
 }
 function save(){try{storage?.setItem(key,JSON.stringify(state));return true;}catch{return false;}}
 const stepOf=id=>{const row=state.active[id];return row?byId.get(id).steps[row.step]:null;};
 const isActive=id=>!!state.active[id],isFinished=id=>state.finished.includes(id);
 function advance(id){
  const row=state.active[id],errand=byId.get(id);
  if(settle&&row.step===errand.steps.length-1&&!settle(errand,stepOf(id)))return null;
  row.step++;row.count=0;
  if(row.step<byId.get(id).steps.length){save();return false;}
  delete state.active[id];state.finished.push(id);save();return true;
 }
 const pendingTalk=(step,npc)=>(step?.type==='talk'||step?.type==='deliver')&&step.targets?.includes(npc);
 return {
  load,save,
  recoverSettled(hasReceipt){
   const owed=errands.filter(errand=>!isFinished(errand.id)&&hasReceipt(errand.id));
   if(!owed.length)return false;
   for(const {id} of owed){delete state.active[id];state.finished.push(id);}
   save();return true;
  },
  reset(){state={active:{},finished:[]};save();},
  snapshot:()=>({active:Object.fromEntries(Object.entries(state.active).map(([id,row])=>[id,{...row}])),finished:[...state.finished]}),
  errand:id=>byId.get(id)??null,
  step:stepOf,isActive,isFinished,
  // Errands in the order they were defined that are active now.
  active:()=>errands.filter(errand=>state.active[errand.id]),
  // Active errands in the order they were accepted (the quest panel's pages, 2026-11-27).
  accepted:()=>Object.keys(state.active).map(id=>byId.get(id)),
  // An errand this NPC can offer now (mainDone: id => boolean).
  offerFor(npc,mainDone){return errands.find(errand=>errand.giver===npc&&!isActive(errand.id)&&!isFinished(errand.id)&&(!errand.after||mainDone(errand.after)))??null;},
  accept(id){if(!byId.has(id)||isActive(id)||isFinished(id))return false;state.active[id]={step:0,count:0};save();return true;},
  // The active errand whose current step waits on talking to this NPC.
  waitingOn(npc){return errands.find(errand=>pendingTalk(stepOf(errand.id),npc))??null;},
  // The active errand this NPC gave whose current step is elsewhere.
  givenBy(npc){return errands.find(errand=>errand.giver===npc&&isActive(errand.id))??null;},
  // Text for the tracker, e.g. "대평원에서 짐승 두 마리 쫓아내기 (1/2)".
  objective(id,have=null){
   const step=stepOf(id);if(!step)return '';
   if(step.type==='defeat')return `${step.text} (${Math.min(state.active[id].count,step.count)}/${step.count})`;
   if(step.type==='deliver'&&have!==null)return `${step.text} (${Math.min(have,step.count)}/${step.count})`;
   return step.text;
  },
  // One event for every active errand. Returns [{id,stepDone,errandDone}].
  // talk and deliver steps complete through complete(), after their dialogue.
  notify(event){
   const results=[];if(!event)return results;
   for(const errand of errands){
    const step=stepOf(errand.id);if(!step)continue;
    let done=false;
    if(step.type==='defeat'&&event.type==='defeat'&&(!step.kind||event.kind===step.kind||event.family===step.kind||event.source===step.kind)&&(!step.map||!event.map||event.map===step.map)){
     const row=state.active[errand.id];row.count++;done=row.count>=step.count;if(!done){save();results.push({id:errand.id,stepDone:false,errandDone:false});continue;}
    }else if(step.type==='reach'&&event.type==='reach'&&event.map===step.map)done=true;
    else if(step.type==='town'&&event.type==='town'&&event.action===step.action&&(!step.item||event.item===step.item))done=true;
    if(done){
     const errandDone=advance(errand.id);
     if(errandDone!==null)results.push({id:errand.id,stepDone:true,errandDone});
     else if(step.type==='defeat')state.active[errand.id].count--;
    }
   }
   return results;
  },
  // The talk or deliver step of an errand that waits on this NPC is done.
  complete(id,npc){const step=stepOf(id);if(!pendingTalk(step,npc))return null;const errandDone=advance(id);return errandDone===null?null:{id,stepDone:true,errandDone};},
 };
}
