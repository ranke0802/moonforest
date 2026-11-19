// Story runtime for 0.3: places the cast for the current map, runs
// conversations, feeds quest events and coaches the first fight. It is driven
// by boot.js from the game frame; it owns no timer or frame loop.
import {createQuestLog} from './quests.js';
import {createDialogue} from './dialogue.js';
import {createPlayHud} from './play-hud.js';
import {createGuideTrack} from './guide-track.js';
import {PLAINS_MONSTER_GROUPS} from '../plains-monster-spawns.js';
import {portraitFor} from './portraits.js';
import {t,speaker} from './i18n.js';
import {clearAlpha} from './title-camera.js';
import {createWagonHorse} from './wagon-horse.js';

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
export {particle} from './korean.js';
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
 const HINT_SECONDS=40,coachState={index:0,moved:0,lastX:null,lastZ:null,alpha:null,shown:0},tips={seen:new Set(),queue:[],showing:null,left:0,step:null};
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
 // Quest rewards. Gold is credited per quest id (idempotent across reloads);
 // potions refill toward the carry limit; armor is a persistent flag in main.
 function grantReward(quest){
  const reward=quest?.reward;if(!reward)return;
  const parts=[];
  try{if(reward.gold&&api.creditGold?.('v03-quest-'+quest.id,reward.gold))parts.push(t('reward.gold',{n:reward.gold}));}catch(error){console.warn('[MoonForest 0.3] gold reward',error);}
  try{if(reward.potions){const n=api.addPotions?.(reward.potions)??0;if(n>0)parts.push(t('reward.potions',{n}));}}catch(error){console.warn('[MoonForest 0.3] potion reward',error);}
  try{if(reward.armor&&api.grantArmor?.(reward.armor))parts.push(t('reward.armor.'+reward.armor));}catch(error){console.warn('[MoonForest 0.3] armor reward',error);}
  if(!parts.length)return;
  api.playSound?.('gold_pickup',{volume:.9});
  setTimeout(()=>{if(!disposed)api.toast?.(t('reward.got',{items:parts.join(' · ')}));},1400);
 }
 function refresh(){
  const quest=log.quest();
  if(quest)hud.setQuest(quest.title,log.objective());else hud.setQuest(t('hud.chapterNext'),content.CHAPTER_END_NOTE);
 }
 function emit(event){
  const result=log.notify(event);if(!result.changed)return result;
  refresh();
  if(result.questDone){
   const done=content.QUESTS.find(quest=>quest.id===result.questDone),next=log.quest();
   hud.flash(next?t('hud.completeNext',{done:done.title,next:next.title}):t('hud.complete',{done:done.title}));
   grantReward(done);
   save.touch({title:next?.title??done.title,titleKey:(next??done).id});
  }
  return result;
 }
 // ----- guide light -----
 const GUIDE_MAX_GAP=8,GUIDE_PATH_RADIUS=.34;
 const walkable=(x,z)=>{const nav=api.world.navigation;if(!nav?.free)return true;try{return nav.free({x,z},.22);}catch{return true;}};
 // Straight hop from the player to a point, used only for the short orbit.
 const clearLine=(from,x,z)=>{for(let i=1;i<=3;i++){const k=i/3;if(!walkable(from.x+(x-from.x)*k,from.z+(z-from.z)*k))return false;}return true;};
 const guide={visual:null,track:createGuideTrack(),key:null,originX:0,originZ:0,age:0,time:0,failed:false,shown:false,x:0,y:0,z:0,sway:0,lift:1.25},guidePoint={x:0,z:0};
 function nearestDen(player){
  let den=null,bestSq=Infinity;
  for(const group of PLAINS_MONSTER_GROUPS){const {x,z}=group.territory,sq=(x-player.x)**2+(z-player.z)**2;if(sq<64||sq>=bestSq)continue;bestSq=sq;den={id:group.id,x,z};}
  return den;
 }
 function guideTarget(player){
  const step=log.step();if(!step||api.battle.combatCount>0&&step.type!=='defeat')return null;
  if(step.type==='defeat'){
   if(step.map&&step.map!==mapId){const exit=content.ROUTES?.[mapId]?.[step.map];if(!exit)return null;guidePoint.x=exit.x;guidePoint.z=exit.z;return {key:'exit:'+step.map,direct:false,stopShort:0};}
   if(step.at&&!livingFoe(step.kind)){if((step.at.x-player.x)**2+(step.at.z-player.z)**2<16)return null;guidePoint.x=step.at.x;guidePoint.z=step.at.z;return {key:'spot:'+step.id,direct:false,stopShort:1};}
   // Lead toward the nearest living foe, stopping short of it.
   let best=null,bestSq=Infinity;
   for(const foe of api.battle.encounters??[]){if(!foe.active||!(foe.brain?.hp>0)||step.kind&&(foe.summonKind??foe.kind)!==step.kind)continue;const p=foe.actor.position,sq=(p.x-player.x)**2+(p.z-player.z)**2;if(sq<bestSq){best=p;bestSq=sq;}}
   if(best&&bestSq<16)return null;
   if(best){guidePoint.x=best.x;guidePoint.z=best.z;return {key:'foe',chase:true,stopShort:2.6};}
   // No beast awake nearby: lead to the nearest plains den instead of vanishing.
   const den=!step.kind&&mapId==='great-plains'?nearestDen(player):null;if(!den)return null;
   guidePoint.x=den.x;guidePoint.z=den.z;return {key:'den:'+den.id,direct:false,stopShort:3};
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
 // A foe counts until its defeat has been reported (the event fires one frame
 // after the killing blow): otherwise the last kill of a wave summons one more.
 const livingFoe=kind=>(api.battle.encounters??[]).some(foe=>foe.active&&foe.brain&&(foe.brain.hp>0||foe.death&&!foe.death.started)&&(!kind||(foe.summonKind??foe.kind)===kind));
 // Story fights: a defeat step with {at,summon} calls its foes once the player
 // is inside the spot, and again after a retreat or death left none alive.
 const staged={key:null,busy:false,next:0,introduced:new Set()};
 function stageFight(player){
  const step=log.step(),quest=log.quest();
  if(step?.type!=='defeat'||!step.at||step.map!==mapId||!player||staged.busy||talking||dialogue.open)return;
  const tune=step.tune??step.summon?.tune;
  if(!step.summon&&!step.intro&&!tune)return;
  const key=quest.id+'/'+step.id;
  const inside=(step.at.x-player.x)**2+(step.at.z-player.z)**2<=step.at.radius**2;
  // While a foe of the step is alive: apply the 0.3 balance and play the
  // arrival line once, before the fight starts.
  if(livingFoe(step.kind)){
   staged.key=key;staged.since=null;if(tune)tuneFoes(step.kind,tune);
   if(inside&&step.intro&&!staged.introduced.has(key)&&content.DIALOGUES[step.intro]&&api.battle.combatCount===0){
    staged.introduced.add(key);staged.busy=true;talking=true;api.input.setSuspended(true);
    void dialogue.play(content.DIALOGUES[step.intro]).catch(()=>{}).finally(()=>{talking=false;staged.busy=false;if(!disposed){api.input.setSuspended(false);if(step.arrival)hud.flash(step.arrival);}});
   }
   return;
  }
  // No summon: the step is fought against the resident placed on the map.
  if(!step.summon||api.battle.loading||api.battle.combatCount>0||guide.time<staged.next)return;
  if(!inside){staged.since=null;return;}
  if(step.summon.after){staged.since??=guide.time;if(guide.time-staged.since<step.summon.after)return;}
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
    if(ok!==false&&tune)tuneFoes(step.summon.kind,tune);
    if(ok!==false&&!disposed&&step.arrival)hud.flash(step.arrival);
   }catch(error){console.warn('[MoonForest 0.3] story fight unavailable',error);}
   finally{staged.busy=false;staged.key=key;staged.next=guide.time+4;}
  })();
 }
 // 0.3 balance for an early story fight: lower HP and hit damage of the
 // summoned foes only (the 0.2 encounters keep their own numbers).
 function tuneFoes(kind,tune){
  for(const foe of api.battle.encounters??[]){
   if(!foe.active||foe.v03Tuned||(foe.summonKind??foe.kind)!==kind||!foe.brain)continue;
   if(tune.hp){foe.brain.maxHp=tune.hp;foe.brain.hp=Math.min(foe.brain.hp,tune.hp);}
   if(tune.damage)foe.damageScale=tune.damage;
   foe.v03Tuned=true;
  }
 }
 function updateGuide(dt,player){
  guide.time+=dt;
  // While a quest is open the light never leaves: with a goal it leads the
  // way, without one (a fight, a goal it cannot path to) it circles the player.
  // Not during the opening fight and its tutorial (the light starts with the
  // driver's talk), and not while a fight is on: it would only add glare and
  // overdraw around the player where the combat effects already are.
  const opening=log.quest()?.id==='M00'&&log.step()?.id==='fight';
  if(!createGuide||guide.failed||talking||dialogue.open||!player||!log.step()||opening||api.battle?.combatCount>0){guide.visual?.hide();guide.key=null;guide.shown=false;return;}
  try{guide.visual??=createGuide(api.world.scene);}catch(error){guide.failed=true;console.warn('[MoonForest 0.3] guide light unavailable',error);return;}
  // Its explanation card comes with the light's first appearance (once per record).
  trigger('guide-shown');
  const target=guideTarget(player),time=guide.time,blend=1-Math.exp(-dt*1.6);
  if(!target){
   guide.key=null;guide.sway+=(.3-guide.sway)*blend;guide.lift+=(1.9-guide.lift)*blend;
   // Circle the player, but never inside a wall, tree or prop: fall back to
   // hovering just above the player's shoulder.
   const angle=time*.55;let wantX=player.x+Math.cos(angle)*1.6,wantZ=player.z+Math.sin(angle)*1.6;
   if(!walkable(wantX,wantZ)||!clearLine(player,wantX,wantZ)){wantX=player.x+.35;wantZ=player.z+.35;}
   const wantY=(api.world.terrain?.heightAt?.(wantX,wantZ)??0)+guide.lift+Math.sin(time*1.9)*.18;
   chase(dt,wantX,wantY,wantZ);guide.visual.show(guide.x,guide.y,guide.z,time,false);return;
  }
  guide.age+=dt;
  const moved=Math.hypot(player.x-guide.originX,player.z-guide.originZ);
  if(target.key!==guide.key||guide.age>1.2&&(target.chase||moved>5)){
   const points=[{x:player.x,z:player.z}];
   // Walkable route at the player's own width, so the light only goes where the player can.
   try{for(const p of api.world.navigation?.path?.(player,guidePoint,GUIDE_PATH_RADIUS)??[])points.push({x:p.x,z:p.z});}catch{/* fall back to a straight line */}
   // The path search stays inside the map's enemy area; exits on a road
   // beyond it (the village gate road) are reached by the last straight leg.
   const last=points[points.length-1];
   if(points.length<2||Math.hypot(last.x-guidePoint.x,last.z-guidePoint.z)>1)points.push({x:guidePoint.x,z:guidePoint.z});
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
  // The drift never pushes the light into scenery: near walls it stays on the route.
  if(!walkable(wantX,wantZ)){wantX=p.x;wantZ=p.z;}
  // Stay on screen: when the player has wandered off, the route is rebuilt from
  // where they stand (the light comes back along it) instead of cutting across.
  if(Math.hypot(p.x-player.x,p.z-player.z)>GUIDE_MAX_GAP&&guide.age>.5)guide.key=null;
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
 let wagonHorse=null;
 function clearCast(){wagonHorse?.dispose();wagonHorse=null;for(const member of cast)member.visual.dispose();cast.length=0;near=null;hud.setPrompt(null);markers?.clear();markerKey='';}
 function placeProps(id){
  const props=(content.PROPS??[]).filter(prop=>prop.map===id);
  if(props.length)void Promise.resolve(api.placeProps?.(props)).catch(error=>console.warn('[MoonForest 0.3] story scenery unavailable',error));
  // The driver's wagon has its horse in the shafts.
  const wagon=props.find(prop=>prop.asset==='covered-wagon'),scene=api.world?.scene;
  if(wagon&&scene&&!scene.isDisposed&&typeof scene.addPendingData==='function'){wagonHorse?.dispose();wagonHorse=createWagonHorse({scene,wagon,heightAt:(x,z)=>api.world.terrain?.heightAt?.(x,z)??0});}
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
   if(effect==='rest'){api.rest?.();save.touch({});hud.flash(t('hud.rested'));trigger('effect:rest');}
  }
 }
 async function interact(){
  if(!started||talking||dialogue.open||!near||api.battle.combatCount>0)return false;
  const member=near,questLine=log.dialogueFor(member.npc.id),lines=content.DIALOGUES[questLine??member.npc.idle];
  if(!lines)return false;
  talking=true;hud.setPrompt(null);api.input.setSuspended(true);
  member.visual.talk?.(true,()=>api.getPlayer?.()?.position??null);
  try{
   const played=await dialogue.play(lines);
   if(played&&!disposed){runEffects(played);if(questLine)emit({type:'talk',npc:member.npc.id});}
  }finally{talking=false;member.visual.talk?.(false);if(!disposed)api.input.setSuspended(false);}
  return true;
 }
 // ----- ambush scene -----
 // Played once as the prologue fades out, as a few shots on the live scene
 // (no extra loop; input suspended, the wolf held by the tutorial):
 //  1. far off, the wolf snarls (close on the wolf)
 //  2. the driver panics (close on the driver, he stumbles back)
 //  3. the wolf charges the driver (wide)
 //  4. the warrior rolls in between and stands guard (camera swings behind)
 const SCENE=Object.freeze({wolfShot:0,driverShot:2.3,chargeShot:4.3,rollAt:4.75,heroShot:5.9,end:7.6});
 const SCENE_LINES=Object.freeze([{at:.35,line:3},{at:2.4,line:0},{at:4.35,line:1},{at:6.0,line:2}]);
 const scene={active:false,pending:false,time:0,beat:0,shot:-1,driver:null,wolf:null,points:null,rolled:false,rollWindow:false,radius:0,beta:0,focus:{x:0,y:0,z:0},cameraFocus:null};
 const ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
 const heightAt=(x,z)=>api.world.terrain?.heightAt?.(x,z)??0;
 const alphaFrom=(from,to)=>Math.atan2(from.z-to.z,from.x-to.x);// camera on `from`'s side looking at `to`
 function freeNear(point){const nav=api.world.navigation;try{return nav?.free?.(point,.6)?point:nav?.findFree?.(point,.6)??point;}catch{return point;}}
// One clip per shot, on the scene's own clock: the snarl and watch, the charge
 // run, then watching the warrior who now stands between them.
 function holdWolf(foe){
  const animator=foe.animator,clips=foe.config?.animations??{};if(!animator)return;
  let clip=null,clock=0;
  foe.storyHold=dt=>{
   // Gait chosen by updateScene from the wolf's real travel speed, so the feet
   // never walk or run on the spot.
   const want=scene.wolfGait==='run'?(clips.run??'Wolf_Run_R5'):scene.wolfGait==='walk'?(clips.walk??'Wolf_Walk_R5'):(clips.watch??'Circle_Watch_R5');
   if(want!==clip){clip=want;clock=0;}
   clock+=dt*(scene.wolfRate??1);const length=animator.durations?.[clip]??1;
   animator.transition(clip,{clipTime:clock%length,actionId:'story-'+clip,blendDuration:.25});animator.update(dt);
  };
 }
 function releaseWolf(foe){
  if(!foe?.storyHold)return;foe.storyHold=null;
  const brain=foe.brain;
  // It charged and stands facing the warrior: never fall back to the lying
  // rest it was summoned in (it used to lie down, then get up again).
  if(brain&&/_Lie_|Rise_From_Lie/.test(brain.state??'')&&typeof brain.start==='function'){brain.start('Circle_Watch_R5','idle');brain.behavior='observe';brain.observation=Math.max(brain.observation??0,.6);}
  if(brain&&foe.animator)foe.animator.transition(brain.state,{clipTime:brain.time??0,actionId:brain.serial,blendDuration:.25});
 }
 function beginAmbushScene(){
  const player=api.getPlayer()?.position,camera=api.world.camera,lines=content.DIALOGUES['ambush-scene'];
  const foe=(api.battle.encounters??[]).find(row=>row.active&&row.brain?.hp>0),member=cast.find(row=>row.npc.id==='driver');
  if(!player||!camera||!foe||!lines||!member)return false;
  const D={x:member.x,z:member.z},ux=player.x-D.x,uz=player.z-D.z,len=Math.hypot(ux,uz)||1,c=Math.cos(.7),s=Math.sin(.7);
  // The wolf appears far off the road, 14 m from the driver, a little to the
  // side of the warrior, and walks in (then runs) on its own feet.
  const dir={x:(ux*c-uz*s)/len,z:(ux*s+uz*c)/len};
  const far=freeNear({x:D.x+dir.x*14,z:D.z+dir.z*14}),charge=freeNear({x:D.x+dir.x*5.2,z:D.z+dir.z*5.2}),guard=freeNear({x:D.x+dir.x*2.4,z:D.z+dir.z*2.4});
  foe.actor.position.x=far.x;foe.actor.position.z=far.z;foe.actor.position.y=heightAt(far.x,far.z);
  if(foe.actor.rotation)foe.actor.rotation.y=Math.atan2(D.x-far.x,D.z-far.z);
  scene.driver=member;scene.wolf=foe;scene.points={D,far,charge,guard,start:{x:player.x,z:player.z}};
  scene.wolfAt={x:far.x,z:far.z};scene.wolfSpeed=0;scene.wolfGait='watch';scene.wolfRate=1;
  // The shots pose the wolf; its own AI sits out until the scene ends.
  holdWolf(foe);
  Object.assign(scene,{active:true,time:0,beat:0,shot:-1,rolled:false,rollWindow:false,radius:camera.radius,beta:camera.beta});
  api.input.setSuspended(true);
  return true;
 }
 function frame(target,height,alpha,radius,beta){
  const camera=api.world.camera;
  scene.focus.x=target.x;scene.focus.z=target.z;scene.focus.y=heightAt(target.x,target.z)+height;scene.cameraFocus=scene.focus;
  camera.alpha=alpha;camera.beta=beta;camera.radius=Math.max(camera.lowerRadiusLimit??1,radius);
 }
 function updateScene(dt){
  const camera=api.world.camera,lines=content.DIALOGUES['ambush-scene'],P=scene.points,wolf=scene.wolf,player=api.getPlayer();scene.time+=dt;const now=scene.time;
  while(scene.beat<SCENE_LINES.length&&now>=SCENE_LINES[scene.beat].at){const line=lines[SCENE_LINES[scene.beat++].line];hud.setCaption({who:speaker(line.who),text:line.text});}
  const shot=now<SCENE.driverShot?0:now<SCENE.chargeShot?1:now<SCENE.heroShot?2:3;
  if(shot!==scene.shot){
   scene.shot=shot;
   if(shot===0||shot===2)api.playSound?.('wolf_alert',{position:wolf.actor.position});
  }
  // The wolf walks in during the first two shots and runs at the third,
  // easing to a stop at the charge point; the gait follows the real speed.
  {const W=scene.wolfAt,bal=wolf.brain?.balance??{},walk=bal.walkSpeed??1.2,run=bal.runSpeed??4.2,rate=bal.locomotionPlaybackRate??1;
   const dx=P.charge.x-W.x,dz=P.charge.z-W.z,dist=Math.hypot(dx,dz);
   const want=dist<.03?0:Math.min(shot<2?walk:run,dist*2.2);
   scene.wolfSpeed+=Math.max(-9*dt,Math.min(7*dt,want-scene.wolfSpeed));
   const step=Math.min(dist,scene.wolfSpeed*dt);if(dist>1e-6){W.x+=dx/dist*step;W.z+=dz/dist*step;}
   const v=scene.wolfSpeed;scene.wolfGait=v>2.4?'run':v>.12?'walk':'watch';
   scene.wolfRate=scene.wolfGait==='run'?rate*Math.max(.6,Math.min(1.3,v/run)):scene.wolfGait==='walk'?rate*Math.max(.45,Math.min(1.4,v/walk)):1;
   wolf.actor.position.x=W.x;wolf.actor.position.z=W.z;wolf.actor.position.y=heightAt(W.x,W.z);
   if(wolf.actor.rotation)wolf.actor.rotation.y=Math.atan2(P.D.x-W.x,P.D.z-W.z);}
  const W=scene.wolfAt;
  // Shots. Close shots look across the subject from the other party's side;
  // the wolf shots track the walking/running wolf.
  if(shot===0)frame(W,.7,alphaFrom(P.D,W)+.35,4.6,1.32);
  else if(shot===1){
   frame(P.D,1.45,alphaFrom(P.far,P.D)-.25,3.6,1.3);
   // The driver stumbles back, shaking.
   const k=ease((now-SCENE.driverShot)/1.4),shake=Math.sin(now*38)*.035,x=P.D.x-(P.far.x-P.D.x)/12*.9*k+shake,z=P.D.z-(P.far.z-P.D.z)/12*.9*k;
   scene.driver.x=x;scene.driver.z=z;scene.driver.visual.place(x,heightAt(x,z),z,Math.atan2(P.far.x-x,P.far.z-z));
  }else if(shot===2){
   // Wide on the charge, the frame riding between the running wolf and the driver.
   const mid={x:(P.D.x+W.x)/2,z:(P.D.z+W.z)/2};
   frame(mid,1,alphaFrom(P.start,mid)+.6,8.5,1.18);
   // The warrior rolls in between: face the guard spot and dodge for real.
   if(!scene.rolled&&now>=SCENE.rollAt&&player){
    scene.rolled=true;const p=player.position;if(player.rotation)player.rotation.y=Math.atan2(P.guard.x-p.x,P.guard.z-p.z);
    scene.rollWindow=true;try{api.actions?.dodge?.();}finally{scene.rollWindow=false;}
   }
  }else{
   // Settle exactly on the guard spot facing the wolf, then swing behind.
   if(player){const p=player.position,k=Math.min(1,dt*6);p.x+=(P.guard.x-p.x)*k;p.z+=(P.guard.z-p.z)*k;p.y=heightAt(p.x,p.z);if(player.rotation)player.rotation.y=Math.atan2(P.charge.x-p.x,P.charge.z-p.z);}
   // Behind the warrior, but never behind the wagon (it hid the wolf).
   const k=ease((now-SCENE.heroShot)/1.3),behind=clearAlpha(alphaFrom(P.D,P.charge),P.guard,(content.PROPS??[]).filter(prop=>prop.map===mapId));
   scene.cameraFocus=null;
   let turn=behind-camera.alpha;turn=Math.atan2(Math.sin(turn),Math.cos(turn));camera.alpha+=turn*Math.min(1,dt*4);
   camera.beta+=(scene.beta-camera.beta)*Math.min(1,dt*3);camera.radius+=(scene.radius-camera.radius)*k*Math.min(1,dt*3);
  }
  if(now>=SCENE.end){
   scene.active=false;scene.cameraFocus=null;camera.radius=scene.radius;camera.beta=scene.beta;
   releaseWolf(wolf);
   hud.setCaption(null);api.input.setSuspended(false);hud.flash(t('scene.protect'));coachState.alpha=camera.alpha;
  }
 }
 // ----- slow motion -----
 // In the first fight, the start of every attack (the warrior's or the
 // wolf's) plays 0.3 s of real time at 30 % speed: the moment reads clearly.
 const SLOW_SCALE=.3,SLOW_SECONDS=.3,ATTACK_STATES=new Set(['attack','slash','judgment','moveAttack']);
 const slow={left:0,player:null,foes:new WeakMap()};
 function updateSlow(dt){
  slow.left=Math.max(0,slow.left-dt);
  const first=log.quest()?.id==='M00'&&log.step()?.id==='fight'&&!scene.active;
  const state=api.getController()?.state??null,attacking=ATTACK_STATES.has(state);
  let start=attacking&&!ATTACK_STATES.has(slow.player);slow.player=state;
  for(const foe of api.battle.encounters??[]){const mode=foe.brain?.mode;if(mode==='attack'&&slow.foes.get(foe)!=='attack')start=true;slow.foes.set(foe,mode);}
  if(start&&first)slow.left=SLOW_SECONDS;
  updateSlowZoom();
 }
 // A light push-in while slow motion lasts (user request 2026-11-19): the
 // field of view narrows by up to 9 % and eases back, on real time so the slow
 // itself does not stretch the zoom. FOV only: the player's zoom distance,
 // pitch and the camera guard are untouched.
 const SLOW_ZOOM=.09,SLOW_ZOOM_IN=.12,SLOW_ZOOM_OUT=.35;
 const zoom={weight:0,base:null,last:0,camera:null};
 function updateSlowZoom(){
  const camera=api.world?.camera;if(!camera||!Number.isFinite(camera.fov))return;
  const now=performance.now(),dt=zoom.last?Math.min(.1,(now-zoom.last)/1000):0;zoom.last=now;
  if(zoom.camera!==camera){zoom.camera=camera;zoom.weight=0;zoom.base=null;}
  const target=slow.left>0?1:0;
  if(zoom.weight===0&&target===0){zoom.base=null;return;}
  zoom.base??=camera.fov;
  zoom.weight=target?Math.min(1,zoom.weight+dt/SLOW_ZOOM_IN):Math.max(0,zoom.weight-dt/SLOW_ZOOM_OUT);
  const eased=zoom.weight*zoom.weight*(3-2*zoom.weight);
  camera.fov=zoom.base*(1-SLOW_ZOOM*eased);
  if(zoom.weight===0){camera.fov=zoom.base;zoom.base=null;}
 }
 // ----- light combat (M3 prototype: Genshin-like) -----
 // Taps chain three hits (slash → thrust → judgment finisher at half stamina);
 // a shield raised within JUST_WINDOW before contact is a just guard: longer
 // enemy stagger, stamina back, a short slow-motion beat.
 const COMBAT_COMBO=Object.freeze(['slash','attack','judgment']),COMBO_COST=Object.freeze({judgment:15});
 // Normal combo hits flinch smaller foes and push them back ~0.4 m; the
 // warrior steps forward into each swing (main.js reads lunge per state).
 const LIGHT_HIT=Object.freeze({push:2.5,skip:Object.freeze(['bear','elena','mourning-elena'])});
 const LUNGE=Object.freeze({slash:{distance:.55,until:.35},attack:{distance:.7,until:.35},judgment:{distance:.9,until:.3,reach:3,stop:1.25}});
 const JUST_WINDOW=.25,JUST_STAGGER=1.6,JUST_REFUND=20,JUST_SLOW=.4;
 const combatState={controller:null,combat:null,justCount:0};
 function configureCombat(){
  const controller=api.getController?.();
  if(controller&&controller!==combatState.controller&&'combo' in controller){controller.combo=COMBAT_COMBO;controller.comboCost=COMBO_COST;combatState.controller=controller;}
  const combat=api.battle?.combat;
  if(combat&&combat!==combatState.combat){combat.justGuard={window:JUST_WINDOW,stagger:JUST_STAGGER};combat.lightHit=LIGHT_HIT;
   // Foes that are neither drawn nor near the player update every third frame.
   api.battle.farUpdateInterval=3;combat.onJustGuard=justGuard;combatState.combat=combat;}
 }
 function justGuard(){
  combatState.justCount++;slow.left=Math.max(slow.left,JUST_SLOW);
  const controller=api.getController?.();if(controller&&Number.isFinite(controller.stamina))controller.stamina=Math.min(controller.maxStamina??100,controller.stamina+JUST_REFUND);
  hud.flash(t('combat.justGuard'));api.playSound?.('charge_ready',{volume:.45,rate:1.25});
 }
 // ----- first-fight tutorial -----
 // Each lesson allows only its own action (main.js asks allows()), the wolf
 // plays its part (holds still, charges for the dodge lesson, snaps for the
 // shield lesson) and neither side can die until the lessons are done.
 const lessonActive=()=>started&&log.quest()?.id==='M00'&&log.step()?.id==='fight'&&coachState.index<(content.COMBAT_HINTS?.length??0);
 const LOCKABLE=['move','camera','attack','dodge','guard','potion'];
 let lockKey='';
 function allows(kind){
  if(scene.active)return kind==='dodge'&&scene.rollWindow;
  if(!lessonActive())return true;
  const allow=content.COMBAT_HINTS[coachState.index]?.allow;
  return !allow||allow.includes(kind);
 }
 function showLocks(){
  const allow=scene.active?[]:lessonActive()?content.COMBAT_HINTS[coachState.index]?.allow:null;
  const key=allow?LOCKABLE.filter(kind=>!allow.includes(kind)).join(' '):'';
  if(key===lockKey)return;lockKey=key;
  if(key)doc.documentElement.dataset.v03Lock=key;else delete doc.documentElement.dataset.v03Lock;
 }
 const WOLF_PLAY={charge:['lunge'],snap:['quick-bite']};
 let wolfPlay=null;
 function directWolf(){
  const lesson=lessonActive()?content.COMBAT_HINTS[coachState.index]:null,play=scene.active?'hold':lesson?.wolf??null;
  for(const foe of api.battle.encounters??[]){
   const brain=foe.brain;if(!foe.active||!brain||!(brain.hp>0))continue;
   if(play){
    // Nobody dies mid-lesson: the wolf keeps a third of its health, the player too.
    brain.hp=Math.max(brain.hp,brain.maxHp*.35);
    const combat=api.battle.combat;if(combat&&combat.hp<combat.maxHp*.35)combat.hp=combat.maxHp*.35;
   }
   if(play==='hold'&&brain.mode!=='attack'&&brain.mode!=='down'&&brain.mode!=='recover'){brain.behavior='observe';brain.observation=Math.max(brain.observation??0,.6);}
   if(play!==wolfPlay)brain.configureAttacks?.(WOLF_PLAY[play]?{custom:true,sequence:WOLF_PLAY[play]}:{});
  }
  wolfPlay=play;
 }
 function coach(dt=0){
  const quest=log.quest(),step=log.step(),hints=content.COMBAT_HINTS??[];
  directWolf();showLocks();
  if(scene.active){hud.setHint(null);return;}
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
  // Lessons finished this frame unlock at once.
  showLocks();directWolf();
  coachState.shown+=dt;
  const hint=hints[coachState.index];
  hud.setHint(hint?`${hint.text} · ${touch?hint.touch:hint.keys}`:null);
  // The ring marks the one control this lesson is about, on PC and touch alike.
  if(!tips.showing)hud.setRing(hint?.target??null);
 }
 function contextTips(){
  const quest=log.quest(),step=log.step(),key=quest&&step?`step:${quest.id}/${step.id}`:null;
  if(key!==tips.step){tips.step=key;if(key)trigger(key);}
  if(near)trigger('near-npc');
  const combat=api.battle.combat;
  if(combat&&combat.maxHp>0&&combat.hp>0&&combat.hp/combat.maxHp<.6)trigger('low-hp');
  // Stamina: explained the first time it runs low, or as soon as the
  // first-fight lessons are over (attacks and dodges have used it by then).
  if(tips.seen.has('stamina'))return;
  const controller=api.getController?.(),max=controller?.maxStamina;
  const low=max>0&&Number.isFinite(controller.stamina)&&controller.stamina<max*.3;
  if(low||quest?.id==='M00'&&step?.id==='fight'&&coachState.index>=(content.COMBAT_HINTS?.length??0))trigger('low-stamina');
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
  allows,
  beginAmbushScene,
  get sceneActive(){return scene.active;},
  get cameraFocus(){return scene.active?scene.cameraFocus:null;},
  get timeScale(){return slow.left>0?SLOW_SCALE:1;},
  get lunge(){return scene.active?null:LUNGE;},
  // Where the current step is fought on this map (monster groups near it load first).
  // Where this quest's fight on the current map is: the current step, or a later
  // step of the same quest (M06 talks to the driver first, then the alpha pack
  // fights far across the plains). The map prepares that pack first.
  get questSpot(){
   if(!started)return null;const map=api.world?.mapId??mapId,step=log.step(),steps=log.quest()?.steps??[];
   // "Defeat any N" here and now: the nearest packs to the player come first,
   // not a later step's fight across the map (that queued the hunt behind it).
   if(step?.type==='defeat'&&!step.at)return null;
   for(const row of steps.slice(Math.max(0,steps.indexOf(step))))if(row.type==='defeat'&&row.at&&row.map===map)return row.at;
   return null;
  },
  get started(){return started;},
  log,
  start({fresh=false}={}){
   if(fresh||!log.load())log.reset();
   // A new game opens on the wolf at the wagon (once the cast is placed).
   scene.pending=fresh===true&&log.quest()?.id==='M00';
   started=true;mapId=null;Object.assign(coachState,{index:0,moved:0,lastX:null,lastZ:null,alpha:null,shown:0});
   tips.queue.length=0;tips.showing=null;tips.step=null;hud.setTip(null);loadTips();if(fresh){tips.seen.clear();try{save.journey.removeItem(TIP_KEY);}catch{/* optional */}}
   refresh();
   const quest=log.quest();if(quest)save.touch({title:quest.title,titleKey:quest.id});
  },
  defeat(event){if(started)emit({type:'defeat',kind:event?.kind,map:mapId});},
  // Called behind the prologue: scenery and the path grid are ready before
  // the player sees the stage.
  prepare(id){
   placeProps(id);
   try{const player=api.getPlayer()?.position,exit=Object.values(content.ROUTES?.[id]??{})[0];if(player&&exit)api.world.navigation?.path?.(player,exit,GUIDE_PATH_RADIUS);}catch{/* warm-up only */}
  },
  update(dt,s){
   if(!started||disposed||!s.ready)return;
   if(s.mapId!==mapId){mapId=s.mapId;buildCast(mapId);emit({type:'reach',map:mapId});}
   if(scene.pending){scene.pending=false;try{beginAmbushScene();}catch(error){console.warn('[MoonForest 0.3] ambush scene skipped',error);scene.active=false;releaseWolf(scene.wolf);api.input.setSuspended(false);}}
   if(scene.active){try{updateScene(dt);}catch(error){console.warn('[MoonForest 0.3] ambush scene stopped',error);scene.active=false;releaseWolf(scene.wolf);scene.cameraFocus=null;hud.setCaption(null);api.input.setSuspended(false);}coach(0);updateGuide(dt,null);return;}
   const player=api.getPlayer()?.position;
   if(player&&!talking&&!dialogue.open){
    let best=null,bestSq=TALK_RANGE_SQ;
    for(const member of cast){const dx=member.x-player.x,dz=member.z-player.z,sq=dx*dx+dz*dz;if(sq<bestSq){best=member;bestSq=sq;}}
    near=api.battle.combatCount>0?null:best;
    if(near){
     const quest=log.isTarget(near.npc.id),name=speaker(near.npc.name);
     hud.setPrompt({key:touch?null:'E',name,action:t(quest?'prompt.actionQuest':'prompt.actionIdle'),mark:markFor(near.npc.id),label:t(quest?'prompt.talkQuest':'prompt.talkIdle',{name})});
    }else hud.setPrompt(null);
   }
   coach(dt);updateSlow(dt);configureCombat();contextTips();runTips(dt);stageFight(player);updateGuide(dt,player);updateMarkers();
  },
  inspect:()=>({started,mapId,cast:cast.map(member=>({id:member.npc.id,x:member.x,z:member.z})),near:near?.npc.id??null,quest:log.quest()?.id??null,step:log.step()?.id??null,objective:log.objective(),dialogue:dialogue.open,hint:coachState.index,guideVisible:guide.visual?.visible===true,guide:guide.key,guideAt:guide.key?{x:+guide.track.position.x.toFixed(1),z:+guide.track.position.z.toFixed(1)}:null,tips:[...tips.seen],tip:tips.showing?.id??null,justGuards:combatState.justCount}),
  dispose(){if(disposed)return;disposed=true;doc.removeEventListener('keydown',onKey,true);guide.visual?.dispose();guide.visual=null;clearCast();markers?.dispose();markers=null;api.setMapMarkers?.([]);dialogue.dispose();hud.dispose();},
 };
}
