// Story runtime for 0.3: places the cast for the current map, runs
// conversations, feeds quest events and coaches the first fight. It is driven
// by boot.js from the game frame; it owns no timer or frame loop.
import {createQuestLog} from './quests.js';
import {createDialogue} from './dialogue.js';
import {createPlayHud} from './play-hud.js';

const TALK_RANGE=2.7,TALK_RANGE_SQ=TALK_RANGE*TALK_RANGE;
// A walkable spot at or near the authored point: the point itself, then rings.
export function findFreeSpot(navigation,point,radius=.42){
 if(!navigation?.free||navigation.free(point,radius))return {x:point.x,z:point.z};
 for(let ring=1;ring<=5;ring++)for(let i=0;i<8;i++){
  const angle=i/8*Math.PI*2,candidate={x:point.x+Math.cos(angle)*ring*.7,z:point.z+Math.sin(angle)*ring*.7};
  if(navigation.free(candidate,radius))return candidate;
 }
 return {x:point.x,z:point.z};
}
// Korean particle by final consonant: particle('여관 주인','과','와') → '여관 주인과'.
export function particle(word,withFinal,withoutFinal){
 const code=word.charCodeAt(word.length-1)-0xac00;
 return word+(code>=0&&code<=11171&&code%28?withFinal:withoutFinal);
}
export function createStory({api,doc,save,content,createVisual}){
 const view=doc.defaultView,touch=view?.matchMedia?.('(pointer: coarse)')?.matches===true;
 const log=createQuestLog({quests:content.QUESTS,storage:save.journey});
 const dialogue=createDialogue({doc});
 const hud=createPlayHud({doc,onInteract:()=>interact()});
 const cast=[];let mapId=null,near=null,started=false,talking=false,disposed=false;
 // Tutorial state: sequential fight coaching and one-time tips (saved per slot).
 const TIP_KEY='v03-tips-v1',TIP_SECONDS=7.5;
 const coachState={index:0,moved:0,lastX:null,lastZ:null,alpha:null},tips={seen:new Set(),queue:[],showing:null,left:0,step:null};
 function loadTips(){tips.seen=new Set();try{const value=JSON.parse(save.journey.getItem(TIP_KEY)??'[]');if(Array.isArray(value))for(const id of value)if(typeof id==='string')tips.seen.add(id);}catch{/* start fresh */}}
 function trigger(when){
  for(const tip of content.TIPS??[]){
   if(tip.when!==when||tips.seen.has(tip.id))continue;
   tips.seen.add(tip.id);tips.queue.push(tip);
   try{save.journey.setItem(TIP_KEY,JSON.stringify([...tips.seen]));}catch{/* shown anyway */}
  }
 }
 function runTips(dt){
  if(tips.showing){tips.left-=dt;if(tips.left<=0){tips.showing=null;hud.setTip(null);}return;}
  if(!tips.queue.length||dialogue.open)return;
  const tip=tips.queue.shift();tips.showing=tip;tips.left=TIP_SECONDS;hud.setTip({title:tip.title,lead:touch?tip.touch:tip.keys,text:tip.text});
 }
 function refresh(){
  const quest=log.quest();
  if(quest)hud.setQuest(quest.title,log.objective());else hud.setQuest('이야기의 다음 장',content.CHAPTER_END_NOTE);
 }
 function emit(event){
  const result=log.notify(event);if(!result.changed)return result;
  refresh();
  if(result.questDone){
   const done=content.QUESTS.find(quest=>quest.id===result.questDone),next=log.quest();
   hud.flash(next?`완료 · ${done.title}  →  ${next.title}`:`완료 · ${done.title}`);
   save.touch({title:next?.title??done.title});
  }
  return result;
 }
 function clearCast(){for(const member of cast)member.visual.dispose();cast.length=0;near=null;hud.setPrompt(null);}
 function buildCast(id){
  clearCast();
  const world=api.world,scene=world.scene;if(!scene||scene.isDisposed)return;
  for(const npc of content.NPCS){
   if(npc.map!==id)continue;
   try{
    const visual=createVisual(scene,npc.visual,{id:npc.id}),spot=findFreeSpot(world.navigation,npc);
    visual.place(spot.x,world.terrain?.heightAt?.(spot.x,spot.z)??0,spot.z,npc.yaw??0);
    cast.push({npc,visual,x:spot.x,z:spot.z});
   }catch(error){console.warn('[MoonForest 0.3] cast member unavailable',npc.id,error);}
  }
 }
 function runEffects(lines){
  for(const line of lines)for(const effect of line.effects??[]){
   if(effect==='rest'){api.rest?.();save.touch({});hud.flash('쉬었습니다 · 여정을 기록했습니다');trigger('effect:rest');}
  }
 }
 async function interact(){
  if(!started||talking||dialogue.open||!near||api.battle.combatCount>0)return false;
  const member=near,questLine=log.dialogueFor(member.npc.id),lines=content.DIALOGUES[questLine??member.npc.idle];
  if(!lines)return false;
  talking=true;hud.setPrompt(null);api.input.setSuspended(true);
  try{
   const played=await dialogue.play(lines);
   if(played&&!disposed){runEffects(played);if(questLine)emit({type:'talk',npc:member.npc.id});}
  }finally{talking=false;if(!disposed)api.input.setSuspended(false);}
  return true;
 }
 function coach(){
  const quest=log.quest(),step=log.step(),hints=content.COMBAT_HINTS??[];
  if(quest?.id!=='M00'||step?.id!=='fight'||coachState.index>=hints.length){hud.setHint(null);return;}
  const controller=api.getController(),player=api.getPlayer()?.position,camera=api.world.camera;
  if(player){
   if(coachState.lastX!==null)coachState.moved+=Math.hypot(player.x-coachState.lastX,player.z-coachState.lastZ);
   coachState.lastX=player.x;coachState.lastZ=player.z;
  }
  if(coachState.alpha===null&&camera)coachState.alpha=camera.alpha;
  const stateName=controller?.guarding?'guard':controller?.state;
  // Skip past everything already done this frame, then show the next line.
  for(;coachState.index<hints.length;coachState.index++){
   const done=hints[coachState.index].done;
   const finished=done.moved!==undefined?coachState.moved>=done.moved:done.camera!==undefined?Math.abs((camera?.alpha??0)-(coachState.alpha??0))>=done.camera:done.states.includes(stateName);
   if(!finished)break;
   if(done.camera!==undefined||done.moved!==undefined){coachState.moved=0;coachState.alpha=camera?.alpha??null;}
  }
  const hint=hints[coachState.index];
  hud.setHint(hint?`${hint.text} · ${touch?hint.touch:hint.keys}`:null);
 }
 function contextTips(){
  const quest=log.quest(),step=log.step(),key=quest&&step?`step:${quest.id}/${step.id}`:null;
  if(key!==tips.step){tips.step=key;if(key)trigger(key);}
  if(near)trigger('near-npc');
  const combat=api.battle.combat;
  if(combat&&combat.maxHp>0&&combat.hp>0&&combat.hp/combat.maxHp<.6)trigger('low-hp');
 }
 const onKey=event=>{
  if(event.code!=='KeyE'||event.repeat||!started||dialogue.open)return;
  if(doc.querySelector('dialog[open]'))return;
  if(near){event.preventDefault();event.stopPropagation();void interact();}
 };
 // Capture phase: the game's own key handler on window (E = potion) must not
 // also receive the key that starts a conversation.
 doc.addEventListener('keydown',onKey,true);
 return {
  get dialogueOpen(){return dialogue.open;},
  get started(){return started;},
  log,
  start({fresh=false}={}){
   if(fresh||!log.load())log.reset();
   started=true;mapId=null;Object.assign(coachState,{index:0,moved:0,lastX:null,lastZ:null,alpha:null});
   tips.queue.length=0;tips.showing=null;tips.step=null;hud.setTip(null);loadTips();if(fresh){tips.seen.clear();try{save.journey.removeItem(TIP_KEY);}catch{/* optional */}}
   refresh();
   const quest=log.quest();if(quest)save.touch({title:quest.title});
  },
  defeat(event){if(started)emit({type:'defeat',kind:event?.kind});},
  update(dt,s){
   if(!started||disposed||!s.ready)return;
   if(s.mapId!==mapId){mapId=s.mapId;buildCast(mapId);emit({type:'reach',map:mapId});}
   const player=api.getPlayer()?.position;
   if(player&&!talking&&!dialogue.open){
    let best=null,bestSq=TALK_RANGE_SQ;
    for(const member of cast){const dx=member.x-player.x,dz=member.z-player.z,sq=dx*dx+dz*dz;if(sq<bestSq){best=member;bestSq=sq;}}
    near=api.battle.combatCount>0?null:best;
    hud.setPrompt(near?`${touch?'':'E · '}${log.isTarget(near.npc.id)?particle(near.npc.name,'과','와')+' 이야기하기':near.npc.name+'에게 말 걸기'}`:null);
   }
   coach();contextTips();runTips(dt);
  },
  inspect:()=>({started,mapId,cast:cast.map(member=>({id:member.npc.id,x:member.x,z:member.z})),near:near?.npc.id??null,quest:log.quest()?.id??null,step:log.step()?.id??null,objective:log.objective(),dialogue:dialogue.open,hint:coachState.index,tips:[...tips.seen],tip:tips.showing?.id??null}),
  dispose(){if(disposed)return;disposed=true;doc.removeEventListener('keydown',onKey,true);clearCast();dialogue.dispose();hud.dispose();},
 };
}
