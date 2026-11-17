// Story runtime for 0.3: places the cast for the current map, runs
// conversations, feeds quest events and coaches the first fight. It is driven
// by boot.js from the game frame; it owns no timer or frame loop.
import {createQuestLog} from './quests.js';
import {createDialogue} from './dialogue.js';
import {createPlayHud} from './play-hud.js';
import {createGuideTrack} from './guide-track.js';
import {portraitFor} from './portraits.js';

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
export function createStory({api,doc,save,content,createVisual,createGuide=null,createMarkers=null}){
 const view=doc.defaultView,touch=view?.matchMedia?.('(pointer: coarse)')?.matches===true;
 const log=createQuestLog({quests:content.QUESTS,storage:save.journey});
 const dialogue=createDialogue({doc,portraitFor});
 // Warm the art cache so the first line never shows an empty frame.
 for(const npc of content.NPCS??[]){const art=portraitFor(npc.name);if(art&&view?.Image){const image=new view.Image();image.decoding='async';image.src=art;}}
 const hud=createPlayHud({doc,onInteract:()=>interact()});
 const cast=[];let mapId=null,near=null,started=false,talking=false,disposed=false;
 // Tutorial state: sequential fight coaching and one-time tips (saved per slot).
 const TIP_KEY='v03-tips-v1',TIP_SECONDS=7.5;
 const HINT_SECONDS=9,coachState={index:0,moved:0,lastX:null,lastZ:null,alpha:null,shown:0},tips={seen:new Set(),queue:[],showing:null,left:0,step:null};
 function loadTips(){tips.seen=new Set();try{const value=JSON.parse(save.journey.getItem(TIP_KEY)??'[]');if(Array.isArray(value))for(const id of value)if(typeof id==='string')tips.seen.add(id);}catch{/* start fresh */}}
 function trigger(when){
  for(const tip of content.TIPS??[]){
   if(tip.when!==when||tips.seen.has(tip.id))continue;
   tips.seen.add(tip.id);tips.queue.push(tip);
   try{save.journey.setItem(TIP_KEY,JSON.stringify([...tips.seen]));}catch{/* shown anyway */}
  }
 }
 function runTips(dt){
  if(tips.showing){tips.left-=dt;if(tips.left<=0){tips.showing=null;hud.setTip(null);hud.setRing(null);}return;}
  if(!tips.queue.length||dialogue.open)return;
  const tip=tips.queue.shift();tips.showing=tip;tips.left=TIP_SECONDS;hud.setTip({title:tip.title,lead:touch?tip.touch:tip.keys,text:tip.text});if(touch&&tip.target)hud.setRing(tip.target);
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
 // ----- guide light -----
 const GUIDE_MAX_GAP=6;
 const guide={visual:null,track:createGuideTrack(),key:null,originX:0,originZ:0,age:0,time:0,failed:false,shown:false,x:0,y:0,z:0,sway:0,lift:1.25},guidePoint={x:0,z:0};
 function guideTarget(player){
  const step=log.step();if(!step||api.battle.combatCount>0&&step.type!=='defeat')return null;
  if(step.type==='defeat'){
   if(step.map&&step.map!==mapId){const exit=content.ROUTES?.[mapId]?.[step.map];if(!exit)return null;guidePoint.x=exit.x;guidePoint.z=exit.z;return {key:'exit:'+step.map,direct:false,stopShort:0};}
   if(step.at&&!livingFoe(step.kind)){if((step.at.x-player.x)**2+(step.at.z-player.z)**2<16)return null;guidePoint.x=step.at.x;guidePoint.z=step.at.z;return {key:'spot:'+step.id,direct:false,stopShort:1};}
   // Lead toward the nearest living foe, stopping short of it.
   let best=null,bestSq=Infinity;
   for(const foe of api.battle.encounters??[]){if(!foe.active||!(foe.brain?.hp>0)||step.kind&&(foe.summonKind??foe.kind)!==step.kind)continue;const p=foe.actor.position,sq=(p.x-player.x)**2+(p.z-player.z)**2;if(sq<bestSq){best=p;bestSq=sq;}}
   if(!best||bestSq<16)return null;
   guidePoint.x=best.x;guidePoint.z=best.z;return {key:'foe',direct:true,stopShort:2.6};
  }
  if(step.type==='talk'){
   let best=null,bestSq=Infinity,away=null;
   for(const id of step.targets){
    if(!log.isTarget(id))continue;
    const member=cast.find(row=>row.npc.id===id);
    if(member){const sq=(member.x-player.x)**2+(member.z-player.z)**2;if(sq<bestSq){best=member;bestSq=sq;}}
    else away??=content.NPCS.find(npc=>npc.id===id);
   }
   if(best){guidePoint.x=best.x;guidePoint.z=best.z;return {key:'npc:'+best.npc.id,direct:false,stopShort:1.4};}
   const exit=away&&content.ROUTES?.[mapId]?.[away.map];if(!exit)return null;
   guidePoint.x=exit.x;guidePoint.z=exit.z;return {key:'exit:'+away.map,direct:false,stopShort:0};
  }
  if(step.type==='reach'){
   const exit=content.ROUTES?.[mapId]?.[step.map];if(!exit)return null;
   guidePoint.x=exit.x;guidePoint.z=exit.z;return {key:'exit:'+step.map,direct:false,stopShort:0};
  }
  return null;
 }
 const livingFoe=kind=>(api.battle.encounters??[]).some(foe=>foe.active&&foe.brain?.hp>0&&(!kind||(foe.summonKind??foe.kind)===kind));
 // Story fights: a defeat step with {at,summon} calls its foes once the player
 // is inside the spot, and again after a retreat or death left none alive.
 const staged={key:null,busy:false,next:0,introduced:new Set()};
 function stageFight(player){
  const step=log.step(),quest=log.quest();
  if(!step?.summon||step.type!=='defeat'||step.map!==mapId||!player||staged.busy||talking||dialogue.open)return;
  const key=quest.id+'/'+step.id;
  if(livingFoe(step.kind)){staged.key=key;return;}
  if(api.battle.loading||api.battle.combatCount>0||guide.time<staged.next)return;
  if((step.at.x-player.x)**2+(step.at.z-player.z)**2>step.at.radius**2)return;
  staged.busy=true;
  void (async()=>{
   try{
    if(step.intro&&!staged.introduced.has(key)&&content.DIALOGUES[step.intro]){
     staged.introduced.add(key);talking=true;api.input.setSuspended(true);
     try{await dialogue.play(content.DIALOGUES[step.intro]);}finally{talking=false;if(!disposed)api.input.setSuspended(false);}
    }
    if(disposed||log.step()!==step)return;
    const left=Math.max(1,step.summon.count-log.snapshot().count);
    const ok=await api.battle.summon(api.getPlayer(),left,step.summon.kind);
    if(ok!==false&&!disposed&&step.arrival)hud.flash(step.arrival);
   }catch(error){console.warn('[MoonForest 0.3] story fight unavailable',error);}
   finally{staged.busy=false;staged.key=key;staged.next=guide.time+4;}
  })();
 }
 function updateGuide(dt,player){
  guide.time+=dt;
  // While a quest is open the light never leaves: with a goal it leads the
  // way, without one (a fight, a goal it cannot path to) it circles the player.
  if(!createGuide||guide.failed||talking||dialogue.open||!player||!log.step()){guide.visual?.hide();guide.key=null;guide.shown=false;return;}
  try{guide.visual??=createGuide(api.world.scene);}catch(error){guide.failed=true;console.warn('[MoonForest 0.3] guide light unavailable',error);return;}
  const target=guideTarget(player),time=guide.time,blend=1-Math.exp(-dt*1.6);
  if(!target){
   guide.key=null;guide.sway+=(.3-guide.sway)*blend;guide.lift+=(1.9-guide.lift)*blend;
   const angle=time*.55,wantX=player.x+Math.cos(angle)*1.6,wantZ=player.z+Math.sin(angle)*1.6;
   const wantY=(api.world.terrain?.heightAt?.(wantX,wantZ)??0)+guide.lift+Math.sin(time*1.9)*.18;
   chase(dt,wantX,wantY,wantZ);guide.visual.show(guide.x,guide.y,guide.z,time,false);return;
  }
  guide.age+=dt;
  const moved=Math.hypot(player.x-guide.originX,player.z-guide.originZ);
  if(target.key!==guide.key||guide.age>1.2&&(target.direct||moved>5)){
   const points=[{x:player.x,z:player.z}];
   if(!target.direct){try{for(const p of api.world.navigation?.path?.(player,guidePoint,.3)??[])points.push({x:p.x,z:p.z});}catch{/* fall back to a straight line */}}
   if(points.length<2)points.push({x:guidePoint.x,z:guidePoint.z});
   guide.track.setPath(points);guide.key=target.key;guide.originX=player.x;guide.originZ=player.z;guide.age=0;
  }
  const before=guide.track.distance,arrived=guide.track.update(dt,player,{stopShort:target.stopShort}),moving=guide.track.distance-before>dt*1.5;
  const p=guide.track.position;
  // Every wobble blends in and out; nothing switches in one frame.
  guide.sway+=((moving?.45:.7)-guide.sway)*blend;guide.lift+=((arrived?1.7:1.3)-guide.lift)*blend;
  // Drift: two incommensurate sines per axis, so the path never looks mechanical.
  const sx=(Math.sin(time*1.13)+Math.sin(time*.71+1.3)*.6)*guide.sway*.6,sz=(Math.cos(time*.97+.4)+Math.sin(time*.53+2.1)*.6)*guide.sway*.6;
  const sy=Math.sin(time*1.9)*.22+Math.sin(time*.83+.7)*.14;
  let wantX=p.x+sx,wantZ=p.z+sz;
  // Stay on screen: a light parked at a far exit is pulled back toward the player.
  const gx=wantX-player.x,gz=wantZ-player.z,gap=Math.hypot(gx,gz);
  if(gap>GUIDE_MAX_GAP){wantX=player.x+gx/gap*GUIDE_MAX_GAP;wantZ=player.z+gz/gap*GUIDE_MAX_GAP;}
  const wantY=(api.world.terrain?.heightAt?.(wantX,wantZ)??0)+guide.lift+sy;
  chase(dt,wantX,wantY,wantZ);guide.visual.show(guide.x,guide.y,guide.z,time,moving);
 }
 // The visible light chases its goal with a smooth lag: path rebuilds,
 // corners and mode changes become curves instead of jumps.
 function chase(dt,x,y,z){
  if(!guide.shown){guide.x=x;guide.y=y;guide.z=z;guide.shown=true;return;}
  const follow=1-Math.exp(-dt*3.2);guide.x+=(x-guide.x)*follow;guide.y+=(y-guide.y)*follow;guide.z+=(z-guide.z)*follow;
 }
 // ----- quest markers: ? = quest waiting, ! = report back -----
 let markers=null,markerKey='';const mapMarks=[];
 function markFor(id){const step=log.step();return step?.type==='talk'&&log.isTarget(id)?(step.turnIn?'!':'?'):null;}
 function updateMarkers(){
  if(createMarkers&&!markers&&cast.length){try{markers=createMarkers(api.world.scene);}catch(error){console.warn('[MoonForest 0.3] quest markers unavailable',error);createMarkers=null;}}
  mapMarks.length=0;let key=mapId??'';
  for(const member of cast){
   const glyph=dialogue.open?null:markFor(member.npc.id);
   markers?.set(member.npc.id,glyph,member.x,(api.world.terrain?.heightAt?.(member.x,member.z)??0)+2.55,member.z);
   if(glyph){mapMarks.push({x:member.x,z:member.z,glyph});key+=`|${member.npc.id}${glyph}`;}
  }
  // Goals on another map: mark the way out instead.
  const step=log.step(),away=step&&(step.type==='reach'?step.map:step.type==='defeat'?step.map:step.type==='talk'?step.targets.map(id=>log.isTarget(id)&&!cast.some(row=>row.npc.id===id)?content.NPCS.find(npc=>npc.id===id)?.map:null).find(Boolean):null);
  const exit=away&&away!==mapId?content.ROUTES?.[mapId]?.[away]:null;
  if(exit){mapMarks.push({x:exit.x,z:exit.z,glyph:'>'});key+=`|exit:${away}`;}
  if(key!==markerKey){markerKey=key;api.setMapMarkers?.(mapMarks.slice());}
  markers?.update(guide.time);
 }
 function clearCast(){for(const member of cast)member.visual.dispose();cast.length=0;near=null;hud.setPrompt(null);markers?.clear();markerKey='';}
 function placeProps(id){
  const props=(content.PROPS??[]).filter(prop=>prop.map===id);
  if(props.length)void Promise.resolve(api.placeProps?.(props)).catch(error=>console.warn('[MoonForest 0.3] story scenery unavailable',error));
 }
 function buildCast(id){
  clearCast();placeProps(id);
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
 function coach(dt=0){
  const quest=log.quest(),step=log.step(),hints=content.COMBAT_HINTS??[];
  if(quest?.id!=='M00'||step?.id!=='fight'||coachState.index>=hints.length){hud.setHint(null);if(!tips.showing)hud.setRing(null);return;}
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
   // A line nobody acts on must not block the lessons after it.
   const finished=coachState.shown>=HINT_SECONDS||(done.moved!==undefined?coachState.moved>=done.moved:done.camera!==undefined?Math.abs((camera?.alpha??0)-(coachState.alpha??0))>=done.camera:done.states.includes(stateName));
   if(!finished)break;
   coachState.shown=0;coachState.moved=0;coachState.alpha=camera?.alpha??null;
  }
  coachState.shown+=dt;
  const hint=hints[coachState.index];
  hud.setHint(hint?`${hint.text} · ${touch?hint.touch:hint.keys}`:null);
  if(!tips.showing)hud.setRing(touch?hint?.target??null:null);
 }
 function contextTips(){
  const quest=log.quest(),step=log.step(),key=quest&&step?`step:${quest.id}/${step.id}`:null;
  if(key!==tips.step){tips.step=key;if(key)trigger(key);}
  if(near)trigger('near-npc');
  const combat=api.battle.combat;
  if(combat&&combat.maxHp>0&&combat.hp>0&&combat.hp/combat.maxHp<.6)trigger('low-hp');
 }
 const onKey=event=>{
  if(event.code!=='KeyE'||event.repeat||event.defaultPrevented||!started||dialogue.open)return;
  if(doc.querySelector('dialog[open]'))return;
  if(near){event.preventDefault();event.stopPropagation();void interact();}
 };
 // Capture phase: the game's own key handler on window (E = potion) must not
 // also receive the key that starts a conversation.
 doc.addEventListener('keydown',onKey,true);
 return {
  get dialogueOpen(){return dialogue.open;},
  get near(){return near!==null;},
  get started(){return started;},
  log,
  start({fresh=false}={}){
   if(fresh||!log.load())log.reset();
   started=true;mapId=null;Object.assign(coachState,{index:0,moved:0,lastX:null,lastZ:null,alpha:null,shown:0});
   tips.queue.length=0;tips.showing=null;tips.step=null;hud.setTip(null);loadTips();if(fresh){tips.seen.clear();try{save.journey.removeItem(TIP_KEY);}catch{/* optional */}}
   refresh();
   const quest=log.quest();if(quest)save.touch({title:quest.title});
  },
  defeat(event){if(started)emit({type:'defeat',kind:event?.kind,map:mapId});},
  // Called behind the prologue: scenery and the path grid are ready before
  // the player sees the stage.
  prepare(id){
   placeProps(id);
   try{const player=api.getPlayer()?.position,exit=Object.values(content.ROUTES?.[id]??{})[0];if(player&&exit)api.world.navigation?.path?.(player,exit,.3);}catch{/* warm-up only */}
  },
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
   coach(dt);contextTips();runTips(dt);stageFight(player);updateGuide(dt,player);updateMarkers();
  },
  inspect:()=>({started,mapId,cast:cast.map(member=>({id:member.npc.id,x:member.x,z:member.z})),near:near?.npc.id??null,quest:log.quest()?.id??null,step:log.step()?.id??null,objective:log.objective(),dialogue:dialogue.open,hint:coachState.index,guideVisible:guide.visual?.visible===true,guide:guide.key,guideAt:guide.key?{x:+guide.track.position.x.toFixed(1),z:+guide.track.position.z.toFixed(1)}:null,tips:[...tips.seen],tip:tips.showing?.id??null}),
  dispose(){if(disposed)return;disposed=true;doc.removeEventListener('keydown',onKey,true);guide.visual?.dispose();guide.visual=null;clearCast();markers?.dispose();markers=null;api.setMapMarkers?.([]);dialogue.dispose();hud.dispose();},
 };
}
