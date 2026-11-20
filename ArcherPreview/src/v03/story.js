// Story runtime for 0.3: places the cast for the current map, runs
// conversations, feeds quest events and coaches the first fight. It is driven
// by boot.js from the game frame; it owns no timer or frame loop.
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {createQuestLog} from './quests.js';
import {createDialogue} from './dialogue.js';
import {createPlayHud} from './play-hud.js';
import {createGuideTrack} from './guide-track.js';
import {PLAINS_MONSTER_GROUPS} from '../plains-monster-spawns.js';
import {portraitFor} from './portraits.js';
import {t,speaker} from './i18n.js';
import {clearAlpha} from './title-camera.js';
import {blocksView} from '../tree-occlusion.js';
import {createAuthoredPlacementNavigation} from '../authored-placement-runtime.js';
import {createWagonHorse} from './wagon-horse.js';
import {createWagonRig,tipQuaternion} from './wagon-rig.js';
import {createWagonModel} from './wagon-model.js';
import {createSitPose} from './sit-pose.js';
import {createLiePose,createCrouchPose,createPushPose} from './story-poses.js';
import {layOnBack} from './bone-pose.js';
import {SLOW_FX_DEFAULT} from './slow-fx.js';
import {pinScreenArea,unpinScreenArea} from './zoom-lod-pin.js';

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
export function createStory({api,doc,save,content,createVisual,createGuide=null,createMarkers=null,slowFx=null}){
 const view=doc.defaultView,touch=view?.matchMedia?.('(pointer: coarse)')?.matches===true;
 const log=createQuestLog({quests:content.QUESTS,storage:save.journey});
 const dialogue=createDialogue({doc,portraitFor});
 // Warm the art cache so the first line never shows an empty frame.
 for(const npc of content.NPCS??[]){const art=portraitFor(npc.name);if(art&&view?.Image){const image=new view.Image();image.decoding='async';image.src=art;}}
 const hud=createPlayHud({doc,onInteract:()=>interact()});
 const cast=[];let mapId=null,near=null,started=false,talking=false,disposed=false;
 // Tutorial state: sequential fight coaching and one-time tips (saved per slot).
 const TIP_KEY='v03-tips-v1',TIP_SECONDS=7.5;
 const HINT_SECONDS=40,coachState={index:0,moved:0,lastX:null,lastZ:null,alpha:null,shown:0,held:0},tips={seen:new Set(),queue:[],showing:null,left:0,step:null};
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
   // The quest's end as a guide card (2026-11-20, user: the same form as the
   // guide notices, clear of the yellow messages in the middle). It comes
   // first; a card it cuts short is shown again after it.
   if(tips.showing){tips.queue.unshift(tips.showing);tips.showing=null;hud.setRing(null);}
   tips.queue.unshift({title:t('hud.questDone'),keys:done.title,touch:done.title,text:next?t('hud.questNext',{next:next.title}):''});
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
   // No quest mark over a head that has a speech bubble on it.
   const glyph=dialogue.open||bubble.member===member?null:markFor(member.npc.id);
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
 // The guide light and the quest marks first show in the frame the opening
 // fight ends; their shaders are built behind the prologue or the loading
 // cover instead (CLAUDE.md: first-use preparation happens while hidden).
 // Called behind the prologue and again as play starts (each warm is a no-op
 // once its shaders exist; the dust needs its texture ready, which it is by then).
 function warmStoryVisuals(){
  if(!api.world?.scene)return;
  try{if(createGuide&&!guide.failed){guide.visual??=createGuide(api.world.scene);guide.visual.warm?.();}}catch(error){console.warn('[MoonForest 0.3] guide warm skipped',error);}
  try{if(createMarkers){markers??=createMarkers(api.world.scene);markers.warm?.();}}catch(error){console.warn('[MoonForest 0.3] marker warm skipped',error);}
 }
 // The coin material was prepared at page load under the title's lights; the
 // variant used in play differed and was built in the frame of the first kill
 // (measured 2026-11-20). Prepared again here, behind the prologue or cover.
 function warmLoot(){try{const job=api.world?.goldLootView?.prepare?.();job?.catch?.(()=>{});}catch{/* built on first use instead */}}
 let wagonHorse=null,wagonModel=null,hiddenWagon=null,driverMember=null;
 function clearCast(){clearCover();wagonHorse?.dispose();wagonHorse=null;wagonModel?.dispose();wagonModel=null;hiddenWagon=null;wagonRig.dispose();endLift();resetDriver();stopRoute();clearBubble();thanks.done=false;driverMember=null;for(const member of cast)member.visual.dispose();cast.length=0;near=null;hud.setPrompt(null);markers?.clear();markerKey='';}
 function placeProps(id){
  const props=(content.PROPS??[]).filter(prop=>prop.map===id);
  // The wolf's hiding place: a bush clump on open ground with a clear run to
  // the horse (2026-11-19: it used to start between trees and shake against them).
  const hide=ambushHide(id);
  // The wagon first; then the wolf's cover: copies of the map's own bushes
  // (the placement runtime cannot load a new asset type: its cache is full).
  if(props.length)void Promise.resolve(api.placeProps?.(props)).then(()=>{if(!disposed)poseWagonForStory();}).catch(error=>console.warn('[MoonForest 0.3] story scenery unavailable',error));
  if(hide)placeCover(hide);
  // The driver's wagon has its horse in the shafts.
  const wagon=props.find(prop=>prop.asset==='covered-wagon'),scene=api.world?.scene;
  if(wagon&&scene&&!scene.isDisposed&&typeof scene.addPendingData==='function'){wagonModel?.dispose();wagonModel=createWagonModel({scene,wagon,shadows:api.world.shadows??null,heightAt:(x,z)=>api.world.terrain?.heightAt?.(x,z)??0});wagonHorse?.dispose();wagonHorse=createWagonHorse({scene,wagon,shadows:api.world.shadows??null,heightAt:(x,z)=>api.world.terrain?.heightAt?.(x,z)??0});}
 }
 function buildCast(id){
  clearCast();placeProps(id);
  const world=api.world,scene=world.scene;if(!scene||scene.isDisposed)return;
  for(const npc of content.NPCS){
   if(npc.map!==id)continue;
   try{
    const visual=createVisual(scene,npc.visual,{id:npc.id}),spot=findFreeSpot(world.navigation,npc);
    visual.place(spot.x,world.terrain?.heightAt?.(spot.x,spot.z)??0,spot.z,npc.yaw??0);
    // Village folk stroll a little around their spot; the driver stays by his wagon.
    if(npc.roam!==false&&npc.id!=='driver')visual.roam?.({radius:npc.roam??2.2,free:(x,z)=>{try{return world.navigation?.free?.({x,z},.4)??true;}catch{return true;}},heightAt:(x,z)=>world.terrain?.heightAt?.(x,z)??0,player:()=>api.getPlayer?.()?.position??null});
    cast.push({npc,visual,x:spot.x,z:spot.z});if(npc.id==='driver')driverMember=cast[cast.length-1];
   }catch(error){console.warn('[MoonForest 0.3] cast member unavailable',npc.id,error);}
  }
 }
 function runEffects(lines){
  for(const line of lines)for(const effect of line.effects??[]){
   if(effect==='right-wagon')continue;// handled by interact (needs the member)
   if(effect==='rest'){api.rest?.();save.touch({});hud.flash(t('hud.rested'));trigger('effect:rest');}
  }
 }
 async function interact(){
  if(!started||talking||dialogue.open||api.battle.combatCount>0)return false;
  // While the wagon waits, E means push (at the roof side next to the driver).
  if(lift.active)return nearLift(api.getPlayer?.()?.position)?push():false;
  if(!near)return false;
  const member=near,questLine=log.dialogueFor(member.npc.id),lines=content.DIALOGUES[questLine??member.npc.idle];
  if(!lines)return false;
  if(member===driverMember){thanks.done=true;if(route.member===member)stopRoute();}
  talking=true;hud.setPrompt(null);api.input.setSuspended(true);
  member.visual.talk?.(true,()=>api.getPlayer?.()?.position??null);
  try{
   const played=await dialogue.play(lines);
   if(played&&!disposed){
    runEffects(played);
    // Setting the wagon up: the step completes when it stands again (updateLift).
    const heave=played.some(line=>line.effects?.includes('right-wagon'));
    if(heave&&startLift(member)){}else if(questLine)emit({type:'talk',npc:member.npc.id});
   }
  }finally{talking=false;member.visual.talk?.(false);if(!disposed)api.input.setSuspended(false);}
  return true;
 }
 // ----- opening scene (2026-11-19 second rework, user storyboard) -----
 // Played once as the prologue fades out, as shots on the live scene (no
 // extra loop; input suspended, the wolf held by the tutorial):
 //  0. over the Great Plains, slowly closing on the wagon rolling down the road
 //  1. through the wagon's back: the warrior asleep in the bed
 //  2. the driver screams; the warrior wakes (eyes opening, from his view) and sits up
 //  3. the wolf breaks from behind the firewood and springs at the horse
 //  4. the horse goes down and takes the wagon over with it
 //  5. the warrior is on his feet by the wreck and rolls in between
 //  6. the camera settles behind him: the fight starts with horse and wagon down
 // Without the wagon and horse models (tests, a failed load) the shots still run.
 const SCENE=Object.freeze({sleepShot:6,scream:9,sitUp:10.7,sitSeconds:.9,attack:12.2,lunge:13.35,crash:13.9,tipStart:14.0,tipSeconds:.65,heroShot:15.6,rollAt:16.2,settle:17.4,end:19,ride:14});
 const SCENE_LINES=Object.freeze([{at:9.0,line:0},{at:10.5,line:1},{at:12.3,line:2},{at:14.4,line:3},{at:16.5,line:4}]);
 // The wagon falls to its left, away from the road side where the driver and
 // the warrior end up; the wolf comes from the right.
 const WAGON_FALL=-1,WOLF_SIDE=1;
 const scene={active:false,pending:false,time:0,beat:0,shot:-1,driver:null,wolf:null,points:null,rolled:false,rollWindow:false,radius:0,beta:0,focus:{x:0,y:0,z:0,snap:true},cameraFocus:null,hidden:null,shake:0};
 const ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
 const heightAt=(x,z)=>api.world.terrain?.heightAt?.(x,z)??0;
 const alphaFrom=(from,to)=>Math.atan2(from.z-to.z,from.x-to.x);// camera on `from`'s side looking at `to`
 function freeNear(point){const nav=api.world.navigation;try{return nav?.free?.(point,.6)?point:nav?.findFree?.(point,.6)??point;}catch{return point;}}
 const openingWagon=()=>(content.PROPS??[]).find(prop=>prop.asset==='covered-wagon'&&prop.map===(api.world?.mapId??mapId))??null;
 const wagonRig=createWagonRig({getRoot:()=>wagonModel?.root??null,getContact:()=>wagonModel?.contact??null,heightAt:(x,z)=>heightAt(x,z)});
 // The map's placed wagon stays for collision; the shafted story wagon is drawn instead.
 function hidePlacedWagon(){
  const id=openingWagon()?.id;if(!id)return;
  const record=api.world?.authoredPlacements?.records?.get?.(id);if(!record||record===hiddenWagon)return;
  for(const mesh of record.meshes??[])mesh.isVisible=false;hiddenWagon=record;
 }
 // The horse: gallops on the ride, rears at the wolf, stays nervous while the
 // wagon is down, calm again once it stands.
 // Outside the scene: down while the wagon is, then up on its feet and calm.
 const horseState={down:false,rising:0};
 function horseMotion(dt=0){
  if(!wagonHorse||scene.active)return;
  if(wagonDown()){horseState.down=true;horseState.rising=0;wagonHorse.play('Horse_Down');return;}
  if(horseState.down){horseState.down=false;horseState.rising=4.4;wagonHorse.play('Horse_GetUp');}
  if(horseState.rising>0){horseState.rising-=dt;if(horseState.rising>0)return;}
  wagonHorse.play('Horse_Idle');
 }
 // The shafts go down with the horse and come back up as it stands
 // (2026-11-20, user: they hung in the air over the fallen horse).
 const SHAFTS_FALL=Object.freeze({after:.1,seconds:1.1}),SHAFTS_RISE=Object.freeze({after:.9,seconds:1.6,clip:4.4});
 function shaftDrop(){
  if(scene.active)return ease((scene.time-SCENE.tipStart-SHAFTS_FALL.after)/SHAFTS_FALL.seconds);
  if(wagonDown()||horseState.down)return 1;
  if(horseState.rising>0)return 1-ease((SHAFTS_RISE.clip-horseState.rising-SHAFTS_RISE.after)/SHAFTS_RISE.seconds);
  return 0;
 }
 function shaftMotion(){wagonModel?.dropShafts(shaftDrop(),wagonRig.tip,WAGON_FALL);}
 // The wagon lies on its side from the ambush until the driver and the
 // warrior set it back up (M00 fight / wagon steps), also after a reload.
 const wagonDown=()=>log.quest()?.id==='M00'&&['fight','wagon'].includes(log.step()?.id);
 // Searched once per map visit from the walkable map: ahead of the wagon on the
 // wolf's side, open around it, and a straight walkable line to the horse.
 // Sized like the map's own bushes (2026-11-20, user: still far too big, over
 // the firewood and the handcart). Measured in the game: the map's bush roots
 // are scaled 0.23-0.31 (placement scale x 0.33, 1.3-2.2 m across) while these
 // were made at 0.9-1.0, 6-7 m across and 4 m tall. `scale` is a placement
 // scale now, a little over the map's largest so a wolf fits behind one.
 const AMBUSH_BUSHES=Object.freeze([{dx:0,df:.35,yaw:.4,scale:1.15},{dx:1.25,df:-.25,yaw:2.1,scale:.95},{dx:-1.2,df:-.1,yaw:4.0,scale:1.05}]);
 let coverNodes=[];const cover=[];
 function clearCover(){for(const node of coverNodes)try{node.dispose(false,false);}catch{}coverNodes=[];cover.length=0;}
 // The cover fades like the map's trees when it stands between the camera and
 // the player (or the scene's subject), checked every 0.1 s.
 const COVER_SEEN=.15,coverAim={x:0,y:0,z:0};let coverCheck=0;
 function updateCover(dt){
  if(!cover.length)return;
  const camera=api.world?.camera,eye=camera?.globalPosition;if(!eye)return;
  coverCheck-=dt;
  if(coverCheck<=0){
   coverCheck=.1;
   const subject=scene.active?scene.cameraFocus:null,player=api.getPlayer?.()?.position;
   if(subject){coverAim.x=subject.x;coverAim.y=subject.y;coverAim.z=subject.z;}else if(player){coverAim.x=player.x;coverAim.y=player.y+1;coverAim.z=player.z;}else return;
   for(const bush of cover)bush.target=blocksView(eye,coverAim,bush.min,bush.max,0)?COVER_SEEN:1;
  }
  const step=Math.min(dt,.1)*4;
  for(const bush of cover){
   if(bush.coverage===bush.target)continue;
   bush.coverage+=Math.sign(bush.target-bush.coverage)*Math.min(step,Math.abs(bush.target-bush.coverage));
   for(const mesh of bush.meshes)mesh.instancedBuffers.treeCoverage=bush.coverage;
  }
 }
 let coverAt=null;
 function placeCover(hide){
  clearCover();coverAt=hide;
  const bushes=(api.world?.villageRenderRecords??[]).filter(row=>row.placement?.asset==='bush'&&row.root&&!row.root.isDisposed?.());
  const template=bushes.find(row=>row.root.isEnabled())??bushes[0];
  const scene=api.world?.scene;if(!template||!scene)return;
  // Plain instances of the bush's own source meshes (createInstance carries the
  // source's instanced buffers such as treeCoverage). instantiateHierarchy made
  // instances without them and the shared draw read null: the frame loop
  // stopped (2026-11-19, measured on the deploy).
  template.root.computeWorldMatrix(true);const inverse=template.root.getWorldMatrix().clone().invert();
  const parts=[];
  for(const mesh of template.meshes??[]){
   const source=mesh.sourceMesh??null;if(!source||source.isDisposed?.())continue;
   mesh.computeWorldMatrix(true);parts.push({source,local:mesh.getWorldMatrix().multiply(inverse)});
  }
  if(!parts.length)return;
  // The map scales a bush's root by its placement scale times the model's own unit.
  const unit=(template.root.scaling.x||1)/(template.placement?.scale||1);
  // Off the props around the hide (firewood, handcart): the first clear spot, stepping away from the driver.
  const nav=api.world?.navigation,clear=(x,z)=>{try{return nav?.free?nav.free({x,z},.9):true;}catch{return true;}};
  for(const [i,bush] of AMBUSH_BUSHES.entries()){
   try{
    const R=hide.coverR??hide.r,F=hide.coverF??hide.f;let x=hide.x+bush.dx*R.x+bush.df*F.x,z=hide.z+bush.dx*R.z+bush.df*F.z;
    if(!clear(x,z))search:for(const back of [.5,1,1.5,2])for(const side of [0,.7,-.7]){const cx=x+F.x*back+R.x*side,cz=z+F.z*back+R.z*side;if(clear(cx,cz)){x=cx;z=cz;break search;}}
    const root=new TransformNode('v03-ambush-bush-'+i,scene);root.position.set(x,heightAt(x,z),z);root.rotation.y=bush.yaw;root.scaling.setAll(bush.scale*unit);const meshes=[];
    for(const part of parts){
     const instance=part.source.createInstance('v03-ambush-bush-'+i+'-'+part.source.name);
     if(part.source.instancedBuffers)for(const key of Object.keys(part.source.instancedBuffers))instance.instancedBuffers[key]=key==='treeCoverage'?1:part.source.instancedBuffers[key];
     instance.parent=root;part.local.decompose(instance.scaling,instance.rotationQuaternion??=new Quaternion(),instance.position);
     instance.isPickable=false;meshes.push(instance);
    }
    root.computeWorldMatrix(true);for(const node of root.getDescendants()){node.computeWorldMatrix?.(true);node.freezeWorldMatrix?.();}root.freezeWorldMatrix();
    coverNodes.push(root);
    const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
    for(const mesh of meshes){const box=mesh.getBoundingInfo().boundingBox;for(const k of ['x','y','z']){min[k]=Math.min(min[k],box.minimumWorld[k]);max[k]=Math.max(max[k],box.maximumWorld[k]);}}
    if(meshes.length&&Number.isFinite(min.x))cover.push({meshes,min,max,coverage:1,target:1});
   }catch(error){console.warn('[MoonForest 0.3] ambush cover',error);break;}
  }
 }
 let hideCache=null;
 // Behind the roadside firewood as the driver sees it (2026-11-19, user), with a
 // way out round the side nearer the horse. Falls back to open grass ahead.
 function ambushHide(id){
  const prop=(content.PROPS??[]).find(row=>row.asset==='covered-wagon'&&row.map===id);if(!prop)return null;
  if(hideCache?.map===id)return hideCache.spot;
  const nav=api.world?.navigation,free=(x,z,radius)=>{try{return nav?.free?nav.free({x,z},radius):true;}catch{return true;}};
  const yaw=prop.yaw??0,f={x:Math.sin(yaw),z:Math.cos(yaw)},r={x:Math.cos(yaw),z:-Math.sin(yaw)};
  const H={x:prop.x+f.x*3.55,z:prop.z+f.z*3.55},charge={x:H.x+r.x*WOLF_SIDE*4.2,z:H.z+r.z*WOLF_SIDE*4.2};
  const driver=(content.NPCS??[]).find(npc=>npc.id==='driver'&&npc.map===id),from=driver?{x:driver.x,z:driver.z}:{x:prop.x,z:prop.z};
  let wood=null,best=26*26;
  for(const row of api.world?.villageRenderRecords??[]){const p=row.placement;if(p?.asset!=='firewood')continue;const dx=p.x-prop.x,dz=p.z-prop.z,d=dx*dx+dz*dz;if(d<best){best=d;wood=p;}}
  let spot=null;
  if(wood){
   const dx=wood.x-from.x,dz=wood.z-from.z,length=Math.hypot(dx,dz)||1,ux=dx/length,uz=dz/length,px=-uz,pz=ux;
   const a={x:wood.x+px*2.3,z:wood.z+pz*2.3},b={x:wood.x-px*2.3,z:wood.z-pz*2.3};
   const out=Math.hypot(a.x-H.x,a.z-H.z)<Math.hypot(b.x-H.x,b.z-H.z)?a:b;
   for(const back of [2.3,2.7,1.9,3.1]){const x=wood.x+ux*back,z=wood.z+uz*back;if(free(x,z,.9)){spot={x,z,f,r,charge,out,coverF:{x:ux,z:uz},coverR:{x:px,z:pz}};break;}}
   if(spot){hideCache={map:id,spot};return spot;}
  }
  search:for(const ahead of [10,12,8,14])for(const side of [10,9,11,8,12,7]){
   const x=prop.x+f.x*ahead+r.x*WOLF_SIDE*side,z=prop.z+f.z*ahead+r.z*WOLF_SIDE*side;
   if(!free(x,z,1.6))continue;
   const dx=charge.x-x,dz=charge.z-z,length=Math.hypot(dx,dz);let clear=true;
   for(let d=.5;d<length;d+=.5)if(!free(x+dx*d/length,z+dz*d/length,.55)){clear=false;break;}
   if(clear){spot={x,z,f,r,charge};break search;}
  }
  // Not cached: the firewood may only be streamed in later this visit.
  return spot;
 }
 function poseWagonForStory(){if(!scene.active&&!scene.pending&&!lift.active&&wagonDown()&&!wagonRig.holds(1))wagonRig.pose({along:0,tip:1,side:WAGON_FALL},{rest:true});}
 // One clip per shot, on the scene's own clock: the snarl and watch, the charge
 // run, then watching the warrior who now stands between them.
 function holdWolf(foe){
  const animator=foe.animator,clips=foe.config?.animations??{};if(!animator)return;
  let clip=null,clock=0;
  foe.storyHold=dt=>{
   // Gait chosen by updateScene from the wolf's real travel speed, so the feet
   // never walk or run on the spot.
   const want=scene.wolfGait==='feed'?(clips.feed??'Pin_Throat_Bite_R5'):scene.wolfGait==='lunge'?(clips.lunge??'Run_Dodge_Lunge_R5'):scene.wolfGait==='run'?(clips.run??'Wolf_Run_R5'):scene.wolfGait==='walk'?(clips.walk??'Wolf_Walk_R5'):(clips.watch??'Circle_Watch_R5');
   if(want!==clip){clip=want;clock=0;}
   clock+=dt*(scene.wolfRate??1);const length=animator.durations?.[clip]??1;
   // The spring at the horse plays once and holds its end.
   const at=scene.wolfGait==='lunge'?Math.min(clock,length-.02):clock%length;
   animator.transition(clip,{clipTime:at,actionId:'story-'+clip,blendDuration:.18});animator.update(dt);
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
 function showPlayer(on){
  const root=api.getPlayer?.();if(!root?.setEnabled)return;
  if(!on){if(scene.hidden===null){scene.hidden=root.isEnabled?.()!==false;root.setEnabled(false);}return;}
  if(scene.hidden!==null){root.setEnabled(scene.hidden);scene.hidden=null;}
 }
 function beginAmbushScene(){
  const player=api.getPlayer()?.position,camera=api.world.camera,lines=content.DIALOGUES['ambush-scene'];
  const foe=(api.battle.encounters??[]).find(row=>row.active&&row.brain?.hp>0),member=cast.find(row=>row.npc.id==='driver');
  if(!player||!camera||!foe||!lines||!member)return false;
  const prop=openingWagon(),S=prop?{x:prop.x,z:prop.z}:{x:member.x,z:member.z},yaw=prop?.yaw??(member.npc.yaw??0);
  const f={x:Math.sin(yaw),z:Math.cos(yaw)},r={x:Math.cos(yaw),z:-Math.sin(yaw)};
  const H={x:S.x+f.x*3.55,z:S.z+f.z*3.55},D={x:member.x,z:member.z};
  const hide=ambushHide(api.world?.mapId??mapId);
  if(hide&&hide!==coverAt)placeCover(hide);
  const far=hide?{x:hide.x,z:hide.z}:freeNear({x:S.x+f.x*13+r.x*WOLF_SIDE*13,z:S.z+f.z*13+r.z*WOLF_SIDE*13});
  const out=hide?.out??far;
  // It springs at the horse's flank on its side of the road.
  const charge={x:H.x+r.x*WOLF_SIDE*2.2,z:H.z+r.z*WOLF_SIDE*2.2};
  // The warrior is thrown out behind the wagon and rolls clear of it, well
  // back from the wolf, which stays on the horse (2026-11-20, user).
  const emerge={x:S.x-f.x*3.3+r.x*WAGON_FALL,z:S.z-f.z*3.3+r.z*WAGON_FALL};
  const guard=freeNear({x:S.x-f.x*4.6+r.x*WOLF_SIDE*2.6,z:S.z-f.z*4.6+r.z*WOLF_SIDE*2.6});
  const at=feedSpot(),feed=at?{x:at.x,z:at.z}:charge,bite=at?{x:biteAt.x,z:biteAt.z}:H;
  resetDriver();
  foe.actor.position.x=far.x;foe.actor.position.z=far.z;foe.actor.position.y=heightAt(far.x,far.z);
  if(foe.actor.rotation)foe.actor.rotation.y=Math.atan2(out.x-far.x,out.z-far.z);
  scene.driver=member;scene.wolf=foe;scene.points={S,H,D,far,out,charge,guard,emerge,feed,bite,f,r,yaw,start:{x:player.x,z:player.z}};
  scene.wolfAt={x:far.x,z:far.z};scene.wolfYaw=null;scene.wolfSpeed=0;scene.wolfGait='watch';scene.wolfRate=1;scene.wolfOut=false;
  holdWolf(foe);
  // The shots need a longer arm than play allows; restored at the end.
  scene.upper=camera.upperRadiusLimit;camera.upperRadiusLimit=Math.max(camera.upperRadiusLimit??0,80);
  Object.assign(scene,{active:true,time:0,beat:0,shot:-1,rolled:false,rollWindow:false,radius:camera.radius,beta:camera.beta,shake:0,thrown:false,placed:false,landed:false,sleeping:true,doze:1,horse:null});
  // The warrior sleeps in the wagon bed (held off the ground by holdsPlayer).
  showPlayer(true);startSleepPose();
  api.input.setSuspended(true);
  return true;
 }
 // Camera at an eye point looking at a target point (both in world units).
 function frameEye(ex,ey,ez,tx,ty,tz){
  const camera=api.world.camera,dx=ex-tx,dy=ey-ty,dz=ez-tz,radius=Math.max(.3,Math.hypot(dx,dy,dz));
  scene.focus.x=tx;scene.focus.y=ty;scene.focus.z=tz;scene.cameraFocus=scene.focus;
  camera.alpha=Math.atan2(dz,dx);camera.beta=Math.acos(Math.max(-1,Math.min(1,dy/radius)));camera.radius=radius;
 }
 function frame(target,height,alpha,radius,beta){
  const camera=api.world.camera;
  scene.focus.x=target.x;scene.focus.z=target.z;scene.focus.y=heightAt(target.x,target.z)+height;scene.cameraFocus=scene.focus;
  camera.alpha=alpha;camera.beta=beta;camera.radius=Math.max(camera.lowerRadiusLimit??1,radius);
 }
 // Metres the wagon still has to roll before it stops where the wolf strikes.
 function rideAlong(now){const k=Math.min(1,now/SCENE.crash);return SCENE.ride*(1-k)*(1-k*.35);}
 // The eyes-opening veil (one CSS animation, removed with the scene).
 function wakeVeil(on){
  if(!on){scene.veil?.remove();scene.veil=null;return;}
  if(scene.veil||typeof document==='undefined')return;
  const veil=document.createElement('div');veil.className='v03-wake-veil';veil.setAttribute('aria-hidden','true');document.body.append(veil);scene.veil=veil;
 }
 // Seated in the bed (2026-11-20, user: lying with sword and shield looked odd):
 // back to the tailgate, facing the bench, legs out along the boards, dozing
 // with the head down, unarmed. The limbs are set by sit-pose.js each frame
 // after the animation (the model has no sitting clip). The sword and shield
 // (and their outline shells) are hidden while he sits and come back with him.
 const sitPoses=new WeakMap();
 // The bed's floor, measured in the game by a ray on the wagon model.
 const BED=1.01,SEAT_BACK=1.05,SEAT_HIPS=.13;
 const ARMS=/^(Golden_Oathblade|Bunnyguard_Shield)( \/|$)/;
 function hideArms(root,hide){
  if(hide){scene.arms=[];for(const mesh of root.getChildMeshes?.(false)??[])if(ARMS.test(mesh.name)&&mesh.isEnabled(false)){mesh.setEnabled(false);scene.arms.push(mesh);}}
  else{for(const mesh of scene.arms??[])if(!mesh.isDisposed?.())mesh.setEnabled(true);scene.arms=null;}
 }
 function startSleepPose(){
  const root=api.getPlayer?.(),bscene=api.world?.scene;if(!root||!bscene)return;
  let pose=sitPoses.get(root);if(!pose){try{pose=createSitPose(root);}catch(error){console.warn('[MoonForest 0.3] sit pose skipped',error);return;}sitPoses.set(root,pose);}
  hideArms(root,true);
  scene.sleepWeight=1;scene.doze=1;scene.hipsAbove=0;scene.sleepObserver=bscene.onBeforeRenderObservable.add(()=>{if(scene.active&&scene.sleeping){pose.apply(scene.sleepWeight,scene.doze);scene.hipsAbove=pose.hipsAbove();}});scene.sleepScene=bscene;scene.sleepRoot=root;
 }
 function stopSleepPose(){if(scene.sleepObserver){scene.sleepScene?.onBeforeRenderObservable.remove(scene.sleepObserver);}scene.sleepObserver=null;scene.sleepScene=null;if(scene.sleepRoot){hideArms(scene.sleepRoot,false);scene.sleepRoot=null;}}
 // Where he sits: near the back of the bed, facing the bench (the wagon's front).
 // One reused point: called several times a frame during the scene.
 const seatSpot={x:0,z:0};
 function seatAt(W0){const P=scene.points;seatSpot.x=W0.x-P.f.x*SEAT_BACK;seatSpot.z=W0.z-P.f.z*SEAT_BACK;return seatSpot;}
 function poseSleeper(player,W0,ground){
  const P=scene.points,p=player.position,seat=seatAt(W0);
  p.x=seat.x;p.z=seat.z;p.y=ground+BED+SEAT_HIPS-(scene.hipsAbove??0);
  if(player.rotation){player.rotation.y=P.yaw;player.rotation.x=0;player.rotation.z=0;}
 }
 function updateScene(dt){
  const lines=content.DIALOGUES['ambush-scene'],P=scene.points,wolf=scene.wolf,player=api.getPlayer();scene.time+=dt;const now=scene.time;
  // The driver's shouts go over his head; the warrior's thoughts stay a caption.
  while(scene.beat<SCENE_LINES.length&&now>=SCENE_LINES[scene.beat].at){const line=lines[SCENE_LINES[scene.beat++].line];if(!line)continue;if(line.who==='마부'&&scene.driver?.visual?.position){hud.setCaption(null);sayOver(scene.driver,line.text,2.6);}else hud.setCaption({who:speaker(line.who),text:line.text});}
  const shot=now<SCENE.sleepShot?0:now<SCENE.scream?1:now<SCENE.attack?2:now<SCENE.crash?3:now<SCENE.heroShot?4:now<SCENE.settle?5:6;
  if(shot!==scene.shot){
   scene.shot=shot;
   if(shot===2){scene.shake=.5;wakeVeil(true);api.playSound?.('wolf_alert',{position:wolf.actor.position,volume:.6});}
   if(shot===3){wakeVeil(false);api.playSound?.('wolf_alert',{position:wolf.actor.position,rate:1.15});}
   if(shot===4)scene.shake=.45;
  }
  // Wagon and horse: rolling at a walk, stopping as the wolf strikes, then over.
  const along=rideAlong(now),fx=P.f.x,fz=P.f.z;
  const W0={x:P.S.x-fx*along,z:P.S.z-fz*along},ground=heightAt(W0.x,W0.z);
  const tip=ease((now-SCENE.tipStart)/SCENE.tipSeconds);
  if(!scene.landed){const landed=now>=SCENE.tipStart+SCENE.tipSeconds;wagonRig.pose({along,tip:landed?1:tip*tip,side:WAGON_FALL},{rest:landed});if(landed){scene.landed=true;scene.shake=Math.max(scene.shake,.35);api.playSound?.('land',{volume:.9,rate:.7});}}
  shaftMotion();
  if(wagonHorse){
   wagonHorse.place(W0.x+fx*3.55,W0.z+fz*3.55,P.yaw);
   const speed=SCENE.ride/SCENE.crash*Math.max(0,1-now/SCENE.crash)*(1.35-.7*now/SCENE.crash);
   const clip=now<SCENE.attack?'Horse_Walk':now<SCENE.lunge?'Horse_Nervous':now<SCENE.tipStart?'Horse_Rear':now<SCENE.tipStart+1.7?'Horse_Fall':'Horse_Down';
   wagonHorse.play(clip);if(clip==='Horse_Walk')wagonHorse.speed?.(Math.max(.4,Math.min(1.3,speed/1.6)));
  }
  // The driver rides on the bench, then is thrown clear by the fall.
  if(now<SCENE.tipStart){const x=W0.x+fx*1.25,z=W0.z+fz*1.25;scene.driver.x=x;scene.driver.z=z;scene.driver.visual.place(x,ground+1.05,z,P.yaw);}
  else if(!scene.thrown){scene.thrown=true;if(!layDriver(scene.driver,'thrown')){scene.driver.x=P.D.x;scene.driver.z=P.D.z;scene.driver.visual.place(P.D.x,heightAt(P.D.x,P.D.z),P.D.z,Math.atan2(P.charge.x-P.D.x,P.charge.z-P.D.z));}}
  // The warrior: asleep in the bed, sits up after the scream, thrown out in the fall.
  if(player&&now<SCENE.tipStart){
   // Asleep with the head down; after the scream he looks up (still seated until the fall).
   const k=ease((now-SCENE.sitUp)/SCENE.sitSeconds);scene.doze=1-k;scene.sleepWeight=1;
   poseSleeper(player,W0,ground);
  }else if(scene.sleeping){scene.sleeping=false;stopSleepPose();if(player?.rotation){player.rotation.x=0;player.rotation.z=0;}showPlayer(false);}
  // The wolf: waits behind the firewood, breaks out round its side, springs at the horse.
  {const Wf=scene.wolfAt,bal=wolf.brain?.balance??{},run=bal.runSpeed??4.2,rate=bal.locomotionPlaybackRate??1;
   // After its spring it settles on the fallen horse and tears at it.
   let target=P.far;const feeding=now>=SCENE.heroShot;
   if(feeding)target=P.feed;else if(now>=SCENE.attack){if(!scene.wolfOut&&Math.hypot(P.out.x-Wf.x,P.out.z-Wf.z)<.6)scene.wolfOut=true;target=scene.wolfOut?P.charge:P.out;}
   const dx=target.x-Wf.x,dz=target.z-Wf.z,dist=Math.hypot(dx,dz);
   // Paced so it reaches the horse as the spring starts.
   const left=Math.max(.25,SCENE.lunge-now),path=dist+(scene.wolfOut?0:Math.hypot(P.charge.x-P.out.x,P.charge.z-P.out.z));
   const want=now<SCENE.attack||dist<.03?0:feeding?1.3:Math.min(run*1.6,Math.max(run*.8,path/left));
   scene.wolfSpeed+=Math.max(-14*dt,Math.min(14*dt,want-scene.wolfSpeed));
   const step=Math.min(dist,scene.wolfSpeed*dt);if(dist>1e-6){Wf.x+=dx/dist*step;Wf.z+=dz/dist*step;}
   const v=scene.wolfSpeed;
   scene.wolfGait=now>=SCENE.lunge&&now<SCENE.heroShot?'lunge':feeding&&dist<.08?'feed':v>2.4?'run':v>.12?'walk':'watch';
   scene.wolfRate=scene.wolfGait==='run'?rate*Math.max(.6,Math.min(1.4,v/run)):1;
   wolf.actor.position.x=Wf.x;wolf.actor.position.z=Wf.z;wolf.actor.position.y=heightAt(Wf.x,Wf.z);
   // It faces the way it runs (2026-11-20, user: its body swung from side to
   // side as it came out: it ran one way looking another) and turns smoothly;
   // standing, springing and feeding it faces the horse.
   const look=now<SCENE.attack?P.out:P.bite,running=scene.wolfSpeed>.3&&dist>.3&&scene.wolfGait!=='lunge';
   if(wolf.actor.rotation&&(running||Math.hypot(look.x-Wf.x,look.z-Wf.z)>.2)){
    const want=running?Math.atan2(dx,dz):Math.atan2(look.x-Wf.x,look.z-Wf.z),from=scene.wolfYaw??wolf.actor.rotation.y;
    let turn=want-from;turn=Math.atan2(Math.sin(turn),Math.cos(turn));
    scene.wolfYaw=from+Math.max(-7*dt,Math.min(7*dt,turn));wolf.actor.rotation.y=scene.wolfYaw;
   }}
  const Wf=scene.wolfAt,rx=P.r.x,rz=P.r.z;
  scene.shake=Math.max(0,scene.shake-dt);const jolt=scene.shake>0?Math.sin(now*61)*.05*scene.shake/.45:0;
  if(shot===0){
   // Over the plains, closing slowly on the wagon from behind and to the side.
   const k=ease(now/SCENE.sleepShot),back=28-21.5*k,side=14-11.8*k,up=26-22.6*k,ahead=8*(1-k);
   frameEye(W0.x-fx*back+rx*side,ground+up,W0.z-fz*back+rz*side,W0.x+fx*ahead,ground+1.5*k,W0.z+fz*ahead);
  }else if(shot===1){
   // Inside the canopy from the bench end: the warrior dozing against the
   // tailgate, head down (2026-11-20 seated version).
   const k=ease((now-SCENE.sleepShot)/(SCENE.scream-SCENE.sleepShot)),seat=seatAt(W0),B=ground+BED,near=1.5-.35*k;
   frameEye(seat.x+fx*near+rx*.3,B+1.02,seat.z+fz*near+rz*.3,seat.x,B+.62,seat.z);
  }else if(shot===2){
   // From his eyes: his lap and the boards, then up to the bench as he wakes.
   const seat=seatAt(W0),k=1-(scene.doze??0),ex=seat.x+fx*.3,ez=seat.z+fz*.3,ey=ground+BED+SEAT_HIPS+.86+jolt;
   const lx=ex+fx*(1+2.5*k),lz=ez+fz*(1+2.5*k),ly=ey-.95+1.05*k;
   frameEye(ex,ey,ez,lx,ly,lz);
  }else if(shot===3){
   // Past the horse's far side: the wolf breaks cover and comes for it.
   const H={x:W0.x+fx*3.55,z:W0.z+fz*3.55},mid={x:(H.x+Wf.x)/2,z:(H.z+Wf.z)/2};
   frameEye(H.x-rx*WOLF_SIDE*5.5+fx*4.5,heightAt(H.x,H.z)+2.6,H.z-rz*WOLF_SIDE*5.5+fz*4.5,mid.x,heightAt(mid.x,mid.z)+1,mid.z);
  }else if(shot===4){
   // Front quarter, wide: the horse goes down and the wagon over with it.
   const mid={x:(P.S.x+P.H.x)/2,z:(P.S.z+P.H.z)/2},g=heightAt(mid.x,mid.z);
   frameEye(mid.x+fx*8+rx*WOLF_SIDE*6,g+3.4+jolt,mid.z+fz*8+rz*WOLF_SIDE*6,mid.x-fx*.5,g+1+jolt,mid.z-fz*.5);
  }else if(shot===5){
   // The warrior comes out from behind the wagon's tail and rolls clear,
   // seen from further down the road with the wreck behind him.
   showPlayer(true);
   if(player&&!scene.placed){scene.placed=true;const p=player.position;p.x=P.emerge.x;p.z=P.emerge.z;p.y=heightAt(p.x,p.z);if(player.rotation)player.rotation.y=Math.atan2(P.guard.x-p.x,P.guard.z-p.z);}
   {const mx=(P.emerge.x+P.guard.x)/2,mz=(P.emerge.z+P.guard.z)/2,g=heightAt(mx,mz);frameEye(P.S.x-fx*8+rx*WOLF_SIDE*6.2,g+2.3+jolt,P.S.z-fz*8+rz*WOLF_SIDE*6.2,mx,g+.9,mz);}
   if(!scene.rolled&&now>=SCENE.rollAt&&player){
    scene.rolled=true;const p=player.position;if(player.rotation)player.rotation.y=Math.atan2(P.guard.x-p.x,P.guard.z-p.z);
    scene.rollWindow=true;try{api.actions?.dodge?.();}finally{scene.rollWindow=false;}
   }
  }else{
   // Settle on the guard spot facing the wolf, then swing behind.
   showPlayer(true);
   const camera=api.world.camera;
   if(player){const p=player.position,k=Math.min(1,dt*6);p.x+=(P.guard.x-p.x)*k;p.z+=(P.guard.z-p.z)*k;p.y=heightAt(p.x,p.z);if(player.rotation)player.rotation.y=Math.atan2(Wf.x-p.x,Wf.z-p.z);}
   const k=ease((now-SCENE.settle)/1.3),behind=clearAlpha(alphaFrom(P.guard,Wf),P.guard,(content.PROPS??[]).filter(prop=>prop.map===mapId));
   scene.cameraFocus=null;
   let turn=behind-camera.alpha;turn=Math.atan2(Math.sin(turn),Math.cos(turn));camera.alpha+=turn*Math.min(1,dt*4);
   camera.beta+=(scene.beta-camera.beta)*Math.min(1,dt*3);camera.radius+=(scene.radius-camera.radius)*k*Math.min(1,dt*3);
  }
  if(now>=SCENE.end)endScene();
 }
 function endScene(){
  const camera=api.world.camera;scene.active=false;scene.cameraFocus=null;wakeVeil(false);
  if(camera&&scene.upper!==undefined){camera.upperRadiusLimit=scene.upper;scene.upper=undefined;}
  if(camera){camera.radius=scene.radius;camera.beta=scene.beta;}
  const player=api.getPlayer?.();if(player?.rotation){player.rotation.x=0;player.rotation.z=0;}scene.sleeping=false;stopSleepPose();
  showPlayer(true);
  wagonHorse?.play('Horse_Down');horseState.down=true;
  wagonRig.pose({along:0,tip:1,side:WAGON_FALL},{rest:true});
  // The wolf stays on the horse while the first lessons run (directWolf lets it go).
  if(lessonWolf()==='feed'&&scene.wolf?.storyHold){scene.wolfGait='feed';scene.wolfRate=1;}else releaseWolf(scene.wolf);
  if(fallen.state==='thrown')fallen.time=Math.max(fallen.time,DRIVER_DOWN.throwSeconds);
  // The scene state outlives the map: drop what it borrowed (CLAUDE.md, memory review 4).
  scene.wolf=null;scene.driver=null;scene.points=null;
  hud.setCaption(null);clearBubble();api.input.setSuspended(false);hud.flash(t('scene.protect'));coachState.alpha=camera?.alpha??coachState.alpha;
 }
 // ----- the wagon's own collision -----
 // The map's placed wagon does not collide (its box was the rotated model's
 // square bounds and blocked both the standing and the fallen spot; 2026-11-19,
 // user). One box follows the story wagon: standing (with the horse in the
 // shafts) or lying on its fall side. The navigation is replaced, never edited,
 // and only weakly referenced here (it belongs to the map).
 let navBase=null,navOurs=null,blockState=null,blockSerial=0;
 function wagonCollision(state){
  const world=api.world,nav=world?.navigation;if(!nav)return;
  const ours=navOurs?.deref();
  if(nav!==ours){if(ours||!navBase||navBase.deref()!==nav){navBase=new WeakRef(nav);}navOurs=null;blockState=null;}
  if(state===blockState)return;
  const base=navBase?.deref(),prop=openingWagon();
  if(!state||!base||!prop||mapId!==prop.map){if(ours&&world.navigation===ours&&base)world.navigation=base;navOurs=null;blockState=state??null;return;}
  const yaw=prop.yaw??0,f={x:Math.sin(yaw),z:Math.cos(yaw)},r={x:Math.cos(yaw),z:-Math.sin(yaw)};
  // Wagon frame: standing spans -2.6..4.6 along (bed to horse), +-1.3 across.
  // Lying, the body spans -2.7..1.4 along and the canopy reaches out to 4.35
  // on the fall side; the horse lies ahead of it. 2026-11-20 (user: the
  // ground in front of the fallen wagon could not be walked on): the lying
  // box used to reach 4.3 m ahead for the shafts, which now lie on the
  // ground; only the wagon's body and the horse block the way.
  const up=state==='up',along=up?1:-.65,across=up?0:WAGON_FALL*2.6,halfWidth=up?1.3:1.75,halfDepth=up?3.6:2.05;
  const box=(id,a,s,w,d)=>({id,shape:'box',x:prop.x+f.x*a+r.x*s,z:prop.z+f.z*a+r.z*s,yaw,halfWidth:w,halfDepth:d,radius:Math.hypot(w,d),height:1.6,source:'v03-story-wagon'});
  const blocks=[box('v03-story-wagon-'+state,along,across,halfWidth,halfDepth)];
  if(!up)blocks.push(box('v03-story-horse-down',3.45,.15,.65,1.15));
  try{const next=createAuthoredPlacementNavigation(base,blocks,'v03-wagon-'+(++blockSerial));world.navigation=next;navOurs=new WeakRef(next);blockState=state;}
  catch(error){console.warn('[MoonForest 0.3] wagon collision skipped',error);blockState=state;}
 }
 // ----- talking is safe (2026-11-20, user) -----
 // The world keeps moving while a conversation is open (it used to freeze),
 // so nothing may hurt the warrior meanwhile: his own hit guard is kept up
 // (player-combat.js counts it down) and foes that are not already striking
 // watch instead of attacking.
 function shieldTalk(){
  if(!talking&&!dialogue.open)return;
  const combat=api.battle.combat;if(combat&&!(combat.invulnerable>.3))combat.invulnerable=.3;
  for(const foe of api.battle.encounters??[]){
   const brain=foe.brain;if(!foe.active||!brain||!(brain.hp>0)||brain.mode==='attack'||brain.mode==='down'||brain.mode==='recover')continue;
   brain.behavior='observe';brain.observation=Math.max(brain.observation??0,.6);
  }
 }
 // ----- a line over the speaker's head (2026-11-20, user: the driver's
 // shouts belong at the driver, not at the bottom of the screen) -----
 // One bubble (play-hud.js) follows one cast member for a few seconds.
 const bubble={member:null,left:0,point:new Vector3(),screen:new Vector3()};
 function sayOver(member,text,seconds=2.4){bubble.member=member;bubble.left=seconds;hud.setBubble(text);}
 function clearBubble(){if(!bubble.member)return;bubble.member=null;hud.setBubble(null);}
 function updateBubble(dt){
  const member=bubble.member;if(!member)return;
  bubble.left-=dt;if(bubble.left<=0){clearBubble();return;}
  const at=member.visual.position,bscene=api.world?.scene,camera=api.world?.camera,engine=bscene?.getEngine?.();if(!at||!engine||!camera?.globalPosition||!bscene.getTransformMatrix)return;
  // Over his head: on the bench, lying on the ground, or on his feet.
  const lying=fallen.member===member&&fallen.state!=='up',riding=scene.active&&!scene.thrown,point=bubble.point,eye=camera.globalPosition,look=camera.target;
  // Just over the head (2026-11-20, user: it hung far above him).
  const tall=member.visual.height??1.7;
  point.set(at.x,heightAt(at.x,at.z)+(riding?1.05+tall:lying?.45:tall)+.06,at.z);
  const scale=engine.getHardwareScalingLevel(),width=engine.getRenderWidth()*scale,height=engine.getRenderHeight()*scale;
  // Behind the camera there is no place on screen: top centre.
  if((point.x-eye.x)*(look.x-eye.x)+(point.y-eye.y)*(look.y-eye.y)+(point.z-eye.z)*(look.z-eye.z)<=0){hud.moveBubble(width/2,height*.18,width,height);return;}
  Vector3.TransformCoordinatesToRef(point,bscene.getTransformMatrix(),bubble.screen);
  hud.moveBubble((bubble.screen.x*.5+.5)*width,(1-(bubble.screen.y*.5+.5))*height,width,height);
 }
 // ----- the wolf on the fallen horse -----
 // Where it stands to tear at the horse (beside the legs, at the chest) and
 // the point it bites; both reused (the scene copies them).
 const FEED=Object.freeze({ahead:.35,side:1.5}),feedAt={x:0,z:0},biteAt={x:0,z:0};
 function feedSpot(){
  const prop=openingWagon();if(!prop)return null;
  const yaw=prop.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw),ahead=3.55+FEED.ahead;
  biteAt.x=prop.x+fx*ahead;biteAt.z=prop.z+fz*ahead;feedAt.x=biteAt.x+rx*WOLF_SIDE*FEED.side;feedAt.z=biteAt.z+rz*WOLF_SIDE*FEED.side;return feedAt;
 }
 // Outside the scene (a reload in the first fight): put it there and hold it.
 function feedWolf(foe){
  const at=feedSpot(),actor=foe.actor;if(!at||!actor)return;
  actor.position.x=at.x;actor.position.z=at.z;actor.position.y=heightAt(at.x,at.z);if(actor.rotation)actor.rotation.y=Math.atan2(biteAt.x-at.x,biteAt.z-at.z);
  scene.wolfGait='feed';scene.wolfRate=1;holdWolf(foe);
 }
 // ----- the driver thrown from the bench (2026-11-20, user) -----
 // He goes over with the wagon, to the side it falls to: he tilts with the
 // bench as it tips, comes off it sideways, lands beyond the shafts on the
 // horse's far side and slides to rest on his back, limbs loose on the ground
 // (story-poses.js). He lies there through the fight; when the wolf is beaten
 // he sits up and gets to his feet. His place in the data (NPCS) is where his
 // hips lie and where he stands afterwards.
 // head: which way his head points, [along the wagon's heading, to its fall side].
 const DRIVER_DOWN=Object.freeze({hips:.13,bench:[0,1.05,1.25],throwSeconds:1.4,leave:[.15,.5],turn:[.5,.6],travel:[.15,.8],loosen:[.4,.6],slide:[.85,.5,.3],arc:.2,sitSeconds:.9,crouchSeconds:.7,standSeconds:.8,head:[.8,.6]});
 const fallen={state:'up',time:0,stir:0,groan:0,member:null,lie:null,sit:null,crouch:null,ankle:0,headYaw:0,hipUp:0,at:{x:0,z:0},dir:{x:0,z:0},bench:new Vector3(),upQ:new Quaternion(),sideQ:new Quaternion(),lieQ:new Quaternion(),freeQ:new Quaternion()};
 function resetDriver(){if(fallen.member){try{fallen.member.visual.overlay?.(null);}catch{}}fallen.state='up';fallen.time=0;fallen.stir=0;fallen.groan=0;fallen.member=null;fallen.lie=null;fallen.sit=null;fallen.crouch=null;}
 const span=(time,row)=>ease((time-row[0])/row[1]);
 function driverOverlay(root,asset,dt){
  const F=fallen,D=DRIVER_DOWN;if(F.state==='up'||!root.rotationQuaternion)return;
  // The poses, and how high his ankles stand over the root on his feet (read before any pose is set).
  if(!F.lie){const nodes=asset.transformNodes;F.lie=createLiePose(root,{nodes});F.sit=createSitPose(root,{nodes});F.crouch=createCrouchPose(root,{nodes});F.ankle=F.lie.feetAbove();}
  const hips=F.lie.hips;if(!hips)return;
  F.time+=dt;
  const at=F.at,ground=heightAt(at.x,at.z),time=F.time;
  let lie=1,sit=0,crouch=0,stand=0,hx=at.x,hy=ground+D.hips,hz=at.z;
  if(F.state==='thrown'){
   // Leaving the bench, turning from the wagon's tilt onto his side and on to
   // his back, crossing to where he lands, limbs loosening as he goes.
   const wagon=wagonModel?.root??null,leave=span(time,D.leave),k=span(time,D.travel);
   Quaternion.SlerpToRef(F.sideQ,F.lieQ,span(time,D.turn),F.freeQ);
   Quaternion.SlerpToRef(wagon?.rotationQuaternion??F.upQ,F.freeQ,leave,root.rotationQuaternion);
   lie=span(time,D.loosen);
   if(wagon){wagon.computeWorldMatrix(true);Vector3.TransformCoordinatesFromFloatsToRef(D.bench[0],D.bench[1]+F.hipUp,D.bench[2],wagon.getWorldMatrix(),F.bench);}
   // He comes down short of his place and slides the rest.
   const short=(1-ease((time-D.slide[0])/D.slide[1]))*D.slide[2],lx=at.x-F.dir.x*short,lz=at.z-F.dir.z*short;
   hx=F.bench.x+(lx-F.bench.x)*k;hz=F.bench.z+(lz-F.bench.z)*k;hy=F.bench.y+(hy-F.bench.y)*k+Math.sin(k*Math.PI)*D.arc;
   if(time>=D.throwSeconds)F.state='down';
  }else{
   // Up again: he sits up, gets his legs under him, then stands.
   if(F.state==='rising'){const a=ease(time/D.sitSeconds),b=ease((time-D.sitSeconds)/D.crouchSeconds),c=ease((time-D.sitSeconds-D.crouchSeconds)/D.standSeconds);lie=1-a;sit=a*(1-b);crouch=b*(1-c);stand=c;}
   Quaternion.SlerpToRef(F.upQ,F.lieQ,lie,root.rotationQuaternion);
   // Lying, he stirs: two slow waves that never quite repeat, and now and
   // then a sharper wince. Eased in after the fall, let go as he gets up.
   if(F.state==='down'){F.stir+=dt;const s=F.stir,wince=Math.max(0,Math.sin(s*.47+.6));F.groan=Math.min(1,s/1.5)*Math.max(0,Math.min(1,.42+.24*Math.sin(s*.83)+.2*Math.sin(s*1.37+1.1)+.5*wince*wince*wince*wince*wince*wince));}
   else F.groan=Math.max(0,F.groan-dt*3);
  }
  root.computeWorldMatrix(true);
  if(sit>0)F.sit.apply(sit,0);
  if(crouch>0)F.crouch.apply(crouch);
  if(lie>0)F.lie.apply(lie,F.groan);
  hips.computeWorldMatrix(true);
  const ox=hips.absolutePosition.x-root.position.x,oy=hips.absolutePosition.y-root.position.y,oz=hips.absolutePosition.z-root.position.z;
  // The root goes where it puts the hips there. Lying, the hips rest on the
  // ground; sitting up and standing, the feet do (so no leg sinks or hangs).
  const feet=ground+F.ankle-F.lie.feetAbove();
  root.position.set(hx-ox+(at.x-hx+ox)*stand,F.state==='thrown'?hy-oy:(hy-oy)*lie+feet*(1-lie),hz-oz+(at.z-hz+oz)*stand);
  if(F.state==='rising'&&time>=D.sitSeconds+D.crouchSeconds+D.standSeconds){const member=F.member,yaw=F.headYaw+Math.PI;resetDriver();member?.visual.place(at.x,ground,at.z,yaw);}
  // Lying, the slow stir is enough at 30 a second; falling and getting up run every frame.
  return F.state==='down'?1/30:0;
 }
 // state: 'thrown' (off the bench of the wagon as it tips) or 'down' (already lying).
 function layDriver(member,state){
  const prop=openingWagon();if(!member?.visual?.overlay||!prop)return false;
  const yaw=prop.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw),sx=Math.cos(yaw)*WAGON_FALL,sz=-Math.sin(yaw)*WAGON_FALL,H=DRIVER_DOWN.head,B=DRIVER_DOWN.bench;
  resetDriver();
  fallen.member=member;fallen.state=state;fallen.time=0;fallen.at.x=member.npc.x;fallen.at.z=member.npc.z;fallen.hipUp=.95*(member.visual.height??1.7)/1.85;
  fallen.headYaw=Math.atan2(fx*H[0]+sx*H[1],fz*H[0]+sz*H[1]);layOnBack(fallen.lieQ,fallen.headYaw);
  tipQuaternion(fallen.sideQ,yaw,WAGON_FALL,Math.PI/2);
  Quaternion.RotationYawPitchRollToRef(state==='thrown'?yaw:fallen.headYaw+Math.PI,0,0,fallen.upQ);
  const ground=heightAt(fallen.at.x,fallen.at.z),bx=prop.x+fx*B[2],bz=prop.z+fz*B[2],gap=Math.hypot(fallen.at.x-bx,fallen.at.z-bz)||1;
  fallen.dir.x=(fallen.at.x-bx)/gap;fallen.dir.z=(fallen.at.z-bz)/gap;fallen.bench.set(bx,heightAt(bx,bz)+B[1]+fallen.hipUp,bz);
  member.x=fallen.at.x;member.z=fallen.at.z;member.visual.place(fallen.at.x,ground,fallen.at.z,fallen.headYaw+Math.PI);
  member.visual.overlay(driverOverlay);return true;
 }
 // ----- the driver's way round the wreck (2026-11-20, user: he must not walk
 // through the horse or the wagon) -----
 // In the wagon's frame (metres along its heading, and across toward its fall
 // side) two boxes hold what lies there: the wagon on its side, and the
 // shafts with the fallen horse. He walks the shortest way between two points
 // that crosses neither, turning at the boxes' corners (a margin out).
 // [back, front, toward the road, toward the fall side]
 const WRECK=Object.freeze([[-3.2,1.5,.2,4.35],[1.5,5.3,-1.2,2.3]]),WRECK_MARGIN=.5,DRIVER_PACE=1.8;
 const route={member:null,points:[],index:0,yaw:null,then:null};
 // True when the segment passes through a box (grown by the margin).
 function crossesWreck(a0,s0,a1,s1){
  for(const box of WRECK){
   const loA=box[0]-WRECK_MARGIN+.02,hiA=box[1]+WRECK_MARGIN-.02,loS=box[2]-WRECK_MARGIN+.02,hiS=box[3]+WRECK_MARGIN-.02,da=a1-a0,ds=s1-s0;
   let enter=0,leave=1,hit=true;
   // Liang-Barsky: the part of the segment inside the box, if any.
   for(let i=0;i<4&&hit;i++){
    const p=i===0?-da:i===1?da:i===2?-ds:ds,q=i===0?a0-loA:i===1?hiA-a0:i===2?s0-loS:hiS-s0;
    if(p===0){if(q<0)hit=false;}else{const t=q/p;if(p<0){if(t>leave)hit=false;else if(t>enter)enter=t;}else{if(t<enter)hit=false;else if(t<leave)leave=t;}}
   }
   if(hit&&leave-enter>1e-4)return true;
  }
  return false;
 }
 // Run when he is sent somewhere (a few times in the opening), not per frame.
 function buildRoute(fromX,fromZ,toX,toZ){
  const prop=openingWagon(),points=route.points;points.length=0;
  if(!prop){points.push({x:toX,z:toZ});return points;}
  const yaw=prop.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw),sx=Math.cos(yaw)*WAGON_FALL,sz=-Math.sin(yaw)*WAGON_FALL,m=WRECK_MARGIN;
  // Nodes: 0 the start, 1 the end, then every box corner that is not inside the other box.
  const nodes=[[(fromX-prop.x)*fx+(fromZ-prop.z)*fz,(fromX-prop.x)*sx+(fromZ-prop.z)*sz],[(toX-prop.x)*fx+(toZ-prop.z)*fz,(toX-prop.x)*sx+(toZ-prop.z)*sz]];
  for(const box of WRECK)for(const a of [box[0]-m,box[1]+m])for(const c of [box[2]-m,box[3]+m])if(!WRECK.some(other=>other!==box&&a>other[0]-m&&a<other[1]+m&&c>other[2]-m&&c<other[3]+m))nodes.push([a,c]);
  // Shortest path over the few nodes (Dijkstra).
  const cost=nodes.map((_,i)=>i?Infinity:0),before=nodes.map(()=>-1),done=nodes.map(()=>false);
  for(;;){
   let best=-1;for(let i=0;i<nodes.length;i++)if(!done[i]&&cost[i]<Infinity&&(best<0||cost[i]<cost[best]))best=i;
   if(best<0||best===1)break;done[best]=true;
   for(let i=0;i<nodes.length;i++){
    if(done[i]||crossesWreck(nodes[best][0],nodes[best][1],nodes[i][0],nodes[i][1]))continue;
    const next=cost[best]+Math.hypot(nodes[i][0]-nodes[best][0],nodes[i][1]-nodes[best][1]);if(next<cost[i]){cost[i]=next;before[i]=best;}
   }
  }
  // No clear way (an end inside a box): straight there.
  if(cost[1]<Infinity)for(let i=before[1];i>0;i=before[i])points.unshift({x:prop.x+fx*nodes[i][0]+sx*nodes[i][1],z:prop.z+fz*nodes[i][0]+sz*nodes[i][1]});
  points.push({x:toX,z:toZ});return points;
 }
 function stepRoute(){
  const member=route.member,p=route.points[route.index],from=member.visual.position,last=route.index===route.points.length-1;
  member.visual.walkTo(p.x,p.z,{yaw:last&&route.yaw!==null?route.yaw:Math.atan2(p.x-(from?.x??p.x),p.z-(from?.z??p.z)),heightAt,speed:DRIVER_PACE});
 }
 // Sends him to a spot (then facing yaw); then() runs once he is there.
 function sendDriver(member,x,z,yaw=null,then=null){
  const from=member?.visual?.position;if(!from||!member.visual.walkTo)return false;
  buildRoute(from.x,from.z,x,z);route.member=member;route.index=0;route.yaw=yaw;route.then=then;stepRoute();return true;
 }
 function stopRoute(){route.member=null;route.then=null;route.points.length=0;}
 function followRoute(){
  const member=route.member;if(!member)return;
  const at=member.visual.position,p=route.points[route.index];if(!at||!p){stopRoute();return;}
  const dx=p.x-at.x,dz=p.z-at.z;if(dx*dx+dz*dz>.09)return;
  if(++route.index<route.points.length){stepRoute();return;}
  const then=route.then;stopRoute();then?.();
 }
 // The wolf beaten: on his feet again he comes round to the warrior and
 // thanks him (the wagon step's talk starts by itself when he gets there).
 const THANKS_RANGE=2.4,THANKS_STAND=1.9,thanks={done:false};
 function driverThanks(){
  if(thanks.done||fallen.state!=='up'||lift.active||talking||dialogue.open||route.member||scene.active)return;
  const player=api.getPlayer?.()?.position,at=driverMember.visual.position;if(!player||!at)return;
  const dx=at.x-player.x,dz=at.z-player.z,gap=Math.hypot(dx,dz)||1;
  if(gap<=THANKS_RANGE){if(api.battle.combatCount>0)return;thanks.done=true;near=driverMember;void interact();return;}
  sendDriver(driverMember,player.x+dx/gap*THANKS_STAND,player.z+dz/gap*THANKS_STAND,Math.atan2(-dx,-dz));
 }
 // Outside the scene: lying while the first fight lasts (also after a reload), up after it.
 function driverMotion(){
  if(!driverMember)return;
  const quest=log.quest()?.id==='M00',step=quest?log.step()?.id:null,down=step==='fight';
  if(down&&fallen.state==='up')layDriver(driverMember,'down');
  else if(!down&&fallen.state==='down'){fallen.state='rising';fallen.time=0;}
  if(step==='wagon')driverThanks();
  followRoute();
 }
 // ----- setting the wagon back up (M00, after the fight) -----
 // The driver's 'right-wagon' line sends him to the toppled wagon; the warrior
 // walks round to the roof side next to him and pushes (E, three heaves on the
 // driver's count). The wagon rises a third per heave and drops onto its
 // wheels on the last; then the driver's thanks play (2026-11-19, user).
 // 2026-11-20 (user: the heave was a shield shove, not a push, and the half
 // lifted wagon stood in the air on its own): from the first heave both men
 // lean into the wagon with their hands on it (story-poses.js), keep hold of
 // it between heaves and step in after it as it comes up.
 const PUSHES=3,HEAVE_SECONDS=.55,PUSH_RANGE=1.7,PUSH_RANGE_SQ=PUSH_RANGE*PUSH_RANGE;
 // [tip, metres out from the wagon's centre line on its fall side, hand height]:
 // beyond the roof while it lies, under the roof edge half way up, at the side
 // wall as it comes upright (from the model's cross section).
 const LIFT_REACH=Object.freeze([[0,2.05,1.3],[1/3,2.75,1.45],[2/3,4.05,1.9],[1,4.95,1]]);
 const LIFT_ALONG=Object.freeze({player:-.7,helper:.9}),reach={out:0,hands:0};
 function liftReach(tip){
  const rows=LIFT_REACH;let i=1;while(i<rows.length-1&&tip>rows[i][0])i++;
  const a=rows[i-1],b=rows[i],k=Math.max(0,Math.min(1,(tip-a[0])/(b[0]-a[0])));
  reach.out=a[1]+(b[1]-a[1])*k;reach.hands=a[2]+(b[2]-a[2])*k;return reach;
 }
 const lift={active:false,spot:null,helper:null,count:0,from:1,to:1,time:0,member:null,cued:false,caption:0,called:-1,callIn:0,holding:false,weight:0,high:0,step:0,pose:null,rest:0,observer:null,scene:null,root:null,helperPose:null,helperRest:0,helperWeight:0,letGo:null};
 const pushPoses=new WeakMap();
 const COUNT_KEYS=Object.freeze(['lift.one','lift.two','lift.three']);
 // The driver must stand at his place before the first heave (it used to be
 // pushable while he was still walking over; 2026-11-19, user).
 function driverPlaced(){if(lift.holding)return true;const at=lift.member?.visual?.position;if(!at||!lift.helper)return !lift.member?.visual?.walkTo;const dx=at.x-lift.helper.x,dz=at.z-lift.helper.z;return dx*dx+dz*dz<.36;}
 function driverSays(key){if(lift.member)sayOver(lift.member,t(key),30);else hud.setCaption({who:speaker('마부'),text:t(key)});lift.caption=1.3;}
 function liftSpots(){
  const prop=openingWagon();if(!prop)return null;const yaw=prop.yaw??0,f={x:Math.sin(yaw),z:Math.cos(yaw)},r={x:Math.cos(yaw),z:-Math.sin(yaw)};
  // The wagon lies on its WAGON_FALL side: its roof edge is out there.
  const out=liftReach(1).out,A=LIFT_ALONG;
  return {player:freeNear({x:prop.x+r.x*WAGON_FALL*out+f.x*A.player,z:prop.z+r.z*WAGON_FALL*out+f.z*A.player}),helper:freeNear({x:prop.x+r.x*WAGON_FALL*out+f.x*A.helper,z:prop.z+r.z*WAGON_FALL*out+f.z*A.helper}),face:{x:prop.x,z:prop.z}};
 }
 // The warrior's pushing pose: set after the animation each frame while he
 // has hold of the wagon; the feet stay on the ground (the stance is lower).
 function startPushPose(){
  const root=api.getPlayer?.(),bscene=api.world?.scene;if(!root||!bscene||lift.observer)return;
  let pose=pushPoses.get(root);if(!pose){try{pose=createPushPose(root);}catch(error){console.warn('[MoonForest 0.3] push pose skipped',error);return;}pushPoses.set(root,pose);}
  lift.pose=pose;lift.rest=pose.feetAbove();lift.root=root;lift.scene=bscene;
  lift.observer=bscene.onBeforeRenderObservable.add(()=>{
   if(!(lift.weight>0)||!lift.pose||!lift.root)return;
   lift.pose.apply(lift.weight,lift.high,lift.step);
   const at=lift.root.position;at.y=heightAt(at.x,at.z)-(lift.pose.feetAbove()-lift.rest);
  });
 }
 function stopPushPose(){if(lift.observer)lift.scene?.onBeforeRenderObservable.remove(lift.observer);lift.observer=null;lift.scene=null;lift.root=null;lift.pose=null;lift.weight=0;}
 function helperOverlay(root,asset){
  if(!lift.helperPose){lift.helperPose=createPushPose(root,{nodes:asset.transformNodes,leftOnly:true});lift.helperRest=lift.helperPose.feetAbove();}
  if(!(lift.helperWeight>0))return;
  lift.helperPose.apply(lift.helperWeight,lift.high,1-lift.step);
  root.position.y=heightAt(root.position.x,root.position.z)-(lift.helperPose.feetAbove()-lift.helperRest);
 }
 // Drops the lift at once (map change, dispose).
 function endLift(){
  if(lift.holding){lift.holding=false;try{api.input.setSuspended(false);}catch{}}
  try{(lift.member?.visual??lift.letGo)?.overlay?.(null);}catch{}
  stopPushPose();lift.active=false;lift.member=null;lift.letGo=null;lift.helperPose=null;lift.helperWeight=0;
 }
 function startLift(member){
  const spots=liftSpots();if(!spots||!member)return false;
  Object.assign(lift,{active:true,spot:spots.player,helper:spots.helper,face:spots.face,count:0,from:1,to:1,time:HEAVE_SECONDS,member,cued:false,caption:0,called:-1,callIn:0,holding:false,faced:false,weight:0,high:0,step:0,helperPose:null,helperWeight:0,letGo:null});
  const yaw=Math.atan2(spots.face.x-spots.helper.x,spots.face.z-spots.helper.z);
  // Round the wreck to his place at the roof, not through it.
  if(member.visual.walkTo)sendDriver(member,spots.helper.x,spots.helper.z,yaw);
  else{member.x=spots.helper.x;member.z=spots.helper.z;member.visual.place(spots.helper.x,heightAt(spots.helper.x,spots.helper.z),spots.helper.z,yaw);}
  return true;
 }
 // Called by interact() while the lift waits for the warrior.
 function nearLift(player){if(!lift.active||!player||!lift.spot)return false;if(lift.holding)return true;const dx=player.x-lift.spot.x,dz=player.z-lift.spot.z;return dx*dx+dz*dz<=PUSH_RANGE_SQ;}
 function push(){
  if(!lift.active||lift.time<HEAVE_SECONDS||lift.count>=PUSHES||!driverPlaced()||lift.called!==lift.count)return false;
  // The first heave: both take hold and stay on it to the end.
  if(!lift.holding){lift.holding=true;api.input.setSuspended(true);startPushPose();lift.member?.visual.overlay?.(helperOverlay);}
  lift.count++;lift.from=lift.to;lift.to=1-lift.count/PUSHES;lift.time=0;lift.callIn=.35;lift.caption=.5;
  api.playSound?.(lift.count<PUSHES?'shield_up':'land',{volume:.75});
  return true;
 }
 function updateLift(dt,player){
  if(!lift.active){
   // Letting go: ease out of the pose, then hand the bodies back.
   if(lift.weight>0){lift.weight=Math.max(0,lift.weight-dt*5);if(lift.weight===0)stopPushPose();}
   if(lift.helperWeight>0||lift.letGo){lift.helperWeight=Math.max(0,lift.helperWeight-dt*5);if(lift.helperWeight===0){try{lift.letGo?.overlay?.(null);}catch{}lift.letGo=null;lift.helperPose=null;}}
   return false;
  }
  if(lift.caption>0){lift.caption-=dt;if(lift.caption<=0){hud.setCaption(null);clearBubble();}}
  const placed=driverPlaced();
  if(placed&&!lift.cued){lift.cued=true;driverSays('lift.ready');lift.caption=0;lift.callIn=1.6;}
  // The driver calls the count first ("하나!"), then the warrior pushes.
  if(placed&&lift.cued&&lift.count<PUSHES&&lift.time>=HEAVE_SECONDS&&lift.called!==lift.count){lift.callIn-=dt;if(lift.callIn<=0){lift.called=lift.count;driverSays(COUNT_KEYS[lift.count]);lift.caption=0;}}
  if(lift.time<HEAVE_SECONDS){
   lift.time=Math.min(HEAVE_SECONDS,lift.time+dt);const k=ease(lift.time/HEAVE_SECONDS);
   // A heave lifts past the mark and settles back a little; the last drops it home.
   const over=lift.count<PUSHES?Math.sin(k*Math.PI)*.04:0;
   wagonRig.pose({along:0,tip:Math.max(0,lift.from+(lift.to-lift.from)*k-over),side:WAGON_FALL},{rest:lift.time>=HEAVE_SECONDS&&lift.count<PUSHES});
   if(lift.time>=HEAVE_SECONDS&&lift.count>=PUSHES){
    wagonRig.upright();const member=lift.member;lift.active=false;lift.member=null;lift.letGo=member?.visual??null;hud.setPrompt(null);hud.setCaption(null);clearBubble();lift.caption=0;
    if(lift.holding){lift.holding=false;api.input.setSuspended(false);}
    emit({type:'talk',npc:'driver'});
    if(member&&!disposed){near=member;void interact();}
    return true;
   }
  }
  if(lift.holding){
   // Hands on the wagon: both follow it in as it comes up.
   const prop=openingWagon(),root=api.getPlayer?.();
   if(prop&&root){
    const yaw=prop.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw)*WAGON_FALL,rz=-Math.sin(yaw)*WAGON_FALL,R=liftReach(wagonRig.tip),k=Math.min(1,dt*10),at=root.position,face=Math.atan2(-rx,-rz);
    at.x+=(prop.x+rx*R.out+fx*LIFT_ALONG.player-at.x)*k;at.z+=(prop.z+rz*R.out+fz*LIFT_ALONG.player-at.z)*k;if(root.rotation)root.rotation.y=face;
    const hx=prop.x+rx*R.out+fx*LIFT_ALONG.helper,hz=prop.z+rz*R.out+fz*LIFT_ALONG.helper,stands=lift.member?.visual.position;
    if(stands&&(Math.abs(stands.x-hx)>.004||Math.abs(stands.z-hz)>.004||!lift.faced)){lift.faced=true;lift.member.visual.place(hx,heightAt(hx,hz),hz,face);}
    lift.high=Math.max(0,Math.min(1,(R.hands-1)/.9));
   }
   const blend=Math.min(1,dt*8);lift.weight+=(1-lift.weight)*blend;lift.helperWeight+=(1-lift.helperWeight)*blend;
   lift.step+=(lift.count%2-lift.step)*Math.min(1,dt*6);
  }
  if(lift.count<PUSHES&&!talking&&!dialogue.open){
   if(nearLift(player)&&(!placed||lift.called!==lift.count))hud.setPrompt({key:null,name:t('prompt.wagonName'),action:t('prompt.waitDriver'),mark:null,label:t('prompt.waitDriver')});
   else if(nearLift(player))hud.setPrompt({key:touch?null:'E',name:t('prompt.wagonName'),action:t('prompt.pushWagon',{n:lift.count,total:PUSHES}),mark:null,label:t('prompt.pushWagon',{n:lift.count,total:PUSHES})});
   else hud.setPrompt(null);
  }
  return false;
 }
 // ----- slow motion -----
 // In the first fight, the start of every attack (the warrior's or the
 // wolf's) plays a moment of real time at 18 % speed: the moment reads clearly.
 // 2026-11-20 (user): longer and with a stronger push-in, the player's choice
 // in the settings (slow-fx.js), and in later fights too: there only when the
 // warrior's own attack starts and not within SLOW_REST of the last beat, so
 // a pack of wolves does not keep the screen slow.
 // 2026-11-20 16:15 (user: repeated this often, the tension drops): one beat
 // per fight, on the first attack of that fight, the warrior's or a foe's,
 // whichever comes first. The tutorial fight too. A fight ends after
 // SLOW_CALM seconds with nothing in combat.
 const SLOW_SCALE=.18,SLOW_CALM=4,ATTACK_STATES=new Set(['attack','slash','judgment','moveAttack']);
 const slow={left:0,player:null,foes:new WeakMap(),used:false,calm:0,first:false};
 const slowSetting=()=>slowFx?.value??SLOW_FX_DEFAULT;
 function updateSlow(dt){
  slow.left=Math.max(0,slow.left-dt);
  const fx=slowSetting(),first=log.quest()?.id==='M00'&&log.step()?.id==='fight'&&!scene.active;
  const state=api.getController()?.state??null,attacking=ATTACK_STATES.has(state);
  const mine=attacking&&!ATTACK_STATES.has(slow.player);let theirs=false;slow.player=state;
  for(const foe of api.battle.encounters??[]){const mode=foe.brain?.mode;if(mode==='attack'&&slow.foes.get(foe)!=='attack')theirs=true;slow.foes.set(foe,mode);}
  const fighting=first||api.battle.combatCount>0;
  if(first!==slow.first){slow.first=first;if(first)slow.used=false;}
  if(fighting)slow.calm=0;else if(slow.calm<SLOW_CALM&&(slow.calm+=dt)>=SLOW_CALM)slow.used=false;
  if(!fx.on)slow.left=0;
  else if((mine||theirs)&&!slow.used&&!scene.active&&(first||fx.everywhere&&fighting)){slow.used=true;slow.left=Math.max(slow.left,fx.seconds);}
  updateSlowZoom();
 }
 // A light push-in while slow motion lasts (user request 2026-11-19): the
 // field of view narrows by up to 9 % and eases back, on real time so the slow
 // itself does not stretch the zoom. FOV only: the player's zoom distance,
 // pitch and the camera guard are untouched.
 // Stronger since 2026-11-19 evening (user: hard to notice): 20 % push-in;
 // 32 % by default since 2026-11-20 and set by the player (slow-fx.js).
 const SLOW_ZOOM_IN=.1,SLOW_ZOOM_OUT=.45;
 const zoom={weight:0,base:null,last:0,camera:null};
 function updateSlowZoom(){
  const camera=api.world?.camera;if(!camera||!Number.isFinite(camera.fov))return;
  const now=performance.now(),dt=zoom.last?Math.min(.1,(now-zoom.last)/1000):0;zoom.last=now;
  if(zoom.camera!==camera){unpinScreenArea(zoom.camera);zoom.camera=camera;zoom.weight=0;zoom.base=null;}
  const target=slow.left>0?1:0;
  // Focus lines at the screen's edge for as long as the beat lasts (hud: one
  // small canvas, written only when the value changes).
  hud.setFocus(target===1&&slowSetting().lines);
  if(zoom.weight===0&&target===0){zoom.base=null;return;}
  // Scenery detail keeps the un-zoomed view for the length of the push-in (zoom-lod-pin.js).
  if(zoom.base===null){zoom.base=camera.fov;pinScreenArea(camera);}
  zoom.weight=target?Math.min(1,zoom.weight+dt/SLOW_ZOOM_IN):Math.max(0,zoom.weight-dt/SLOW_ZOOM_OUT);
  const eased=zoom.weight*zoom.weight*(3-2*zoom.weight);
  camera.fov=zoom.base*(1-slowSetting().zoom*eased);
  if(zoom.weight===0){camera.fov=zoom.base;zoom.base=null;unpinScreenArea(camera);}
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
  combatState.justCount++;if(slowSetting().on)slow.left=Math.max(slow.left,JUST_SLOW);
  const controller=api.getController?.();if(controller&&Number.isFinite(controller.stamina))controller.stamina=Math.min(controller.maxStamina??100,controller.stamina+JUST_REFUND);
  hud.flash(t('combat.justGuard'));api.playSound?.('charge_ready',{volume:.45,rate:1.25});
 }
 // ----- first-fight tutorial -----
 // Each lesson allows only its own action (main.js asks allows()), the wolf
 // plays its part (holds still, charges for the dodge lesson, snaps for the
 // shield lesson) and neither side can die until the lessons are done.
 const lessonActive=()=>started&&log.quest()?.id==='M00'&&log.step()?.id==='fight'&&coachState.index<(content.COMBAT_HINTS?.length??0);
 const lessonWolf=()=>lessonActive()?content.COMBAT_HINTS[coachState.index]?.wolf??null:null;
 const LOCKABLE=['move','camera','attack','dodge','guard','potion'];
 let finishLine=null;
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
   // Busy with the horse for the first lessons; it turns on the warrior after.
   if(play==='feed'){if(!foe.storyHold&&!scene.active)feedWolf(foe);}
   else if(foe.storyHold&&!scene.active){releaseWolf(foe);api.playSound?.('wolf_alert',{position:foe.actor?.position,volume:.7});}
   if(play==='hold'&&brain.mode!=='attack'&&brain.mode!=='down'&&brain.mode!=='recover'){brain.behavior='observe';brain.observation=Math.max(brain.observation??0,.6);}
   if(play!==wolfPlay)brain.configureAttacks?.(WOLF_PLAY[play]?{custom:true,sequence:WOLF_PLAY[play]}:{});
  }
  wolfPlay=play;
 }
 function coach(dt=0){
  const quest=log.quest(),step=log.step(),hints=content.COMBAT_HINTS??[];
  directWolf();showLocks();
  if(scene.active){hud.setHint(null);return;}
  // The lessons done, the fight still on: what is left to do (2026-11-20, user).
  if(quest?.id==='M00'&&step?.id==='fight'&&coachState.index>=hints.length){hud.setHint(finishLine??=t('hint.finishWolf'));if(!tips.showing)hud.setRing(null);return;}
  if(quest?.id!=='M00'||step?.id!=='fight'){hud.setHint(null);if(!tips.showing)hud.setRing(null);return;}
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
   // combo: the chain's nth hit (the finisher); charged: the held attack, not the chain's.
   const chained=controller?.attackIndex??0,acting=done.states?done.states.includes(stateName)&&(!done.combo||chained>=done.combo)&&(!done.charged||chained===0):false;
   // hold: the action kept up for that long in all (the guard stance).
   if(done.hold){if(acting)coachState.held+=dt;}
   const finished=coachState.shown>=HINT_SECONDS||(done.moved!==undefined?coachState.moved>=done.moved:done.camera!==undefined?Math.abs((camera?.alpha??0)-(coachState.alpha??0))>=done.camera:done.hold?coachState.held>=done.hold:acting);
   if(!finished)break;
   coachState.shown=0;coachState.moved=0;coachState.held=0;coachState.alpha=camera?.alpha??null;
  }
  // Lessons finished this frame unlock at once.
  showLocks();directWolf();
  coachState.shown+=dt;
  const hint=hints[coachState.index];
  if(hint)hud.setHint(hint.text,touch?hint.touch:hint.keys);else hud.setHint(finishLine??=t('hint.finishWolf'));
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
  // True while a new game's opening scene has not been able to start yet.
  get scenePending(){return scene.pending;},
  get cameraFocus(){return scene.active?scene.cameraFocus:null;},
  // The warrior lies in the wagon bed during the opening: main.js keeps him off the ground snap.
  get holdsPlayer(){return scene.active&&scene.sleeping===true;},
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
   scene.pending=fresh===true&&log.quest()?.id==='M00';scene.pendingFor=0;
   started=true;mapId=null;warmStoryVisuals();warmLoot();Object.assign(coachState,{index:0,moved:0,lastX:null,lastZ:null,alpha:null,shown:0,held:0});
   tips.queue.length=0;tips.showing=null;tips.step=null;hud.setTip(null);loadTips();if(fresh){tips.seen.clear();try{save.journey.removeItem(TIP_KEY);}catch{/* optional */}}
   refresh();
   const quest=log.quest();if(quest)save.touch({title:quest.title,titleKey:quest.id});
  },
  defeat(event){if(started)emit({type:'defeat',kind:event?.kind,map:mapId});},
  // Called behind the prologue: scenery and the path grid are ready before
  // the player sees the stage.
  prepare(id){
   placeProps(id);warmStoryVisuals();warmLoot();
   try{const player=api.getPlayer()?.position,exit=Object.values(content.ROUTES?.[id]??{})[0];if(player&&exit)api.world.navigation?.path?.(player,exit,GUIDE_PATH_RADIUS);}catch{/* warm-up only */}
  },
  update(dt,s){
   if(!started||disposed||!s.ready)return;
   if(s.mapId!==mapId){
    mapId=s.mapId;buildCast(mapId);emit({type:'reach',map:mapId});
    // The place's name in the middle of the screen on arrival (2026-11-20,
    // user). Not over the opening scene.
    if(!scene.pending&&!scene.active){const key='place.'+s.character,name=t(key);if(name!==key)hud.showPlace(name);}
   }
   // It waits for the wolf and the driver to be there (a few seconds at most): the stage stays covered meanwhile (boot.js).
   if(scene.pending){scene.pendingFor=(scene.pendingFor??0)+dt;try{if(beginAmbushScene()||scene.pendingFor>4){scene.pending=false;scene.pendingFor=0;}}catch(error){scene.pending=false;scene.pendingFor=0;console.warn('[MoonForest 0.3] ambush scene skipped',error);scene.active=false;releaseWolf(scene.wolf);api.input.setSuspended(false);}}
   hidePlacedWagon();updateCover(dt);
   if(scene.active){try{updateScene(dt);}catch(error){console.warn('[MoonForest 0.3] ambush scene stopped',error);try{endScene();}catch{scene.active=false;showPlayer(true);api.input.setSuspended(false);}}coach(0);updateGuide(dt,null);updateBubble(dt);return;}
   // Strolling actors: talk range and markers follow where they stand now.
   for(const member of cast){const at=member.visual.position;if(at){member.x=at.x;member.z=at.z;}}
   const player=api.getPlayer()?.position;
   if(wagonDown())poseWagonForStory();horseMotion(dt);wagonCollision(scene.active?null:wagonDown()||lift.active?'down':'up');
   driverMotion();
   const lifted=updateLift(dt,player);shaftMotion();if(lifted)return;
   if(player&&!talking&&!dialogue.open&&!lift.active){
    let best=null,bestSq=TALK_RANGE_SQ;
    for(const member of cast){if(member===fallen.member)continue;const dx=member.x-player.x,dz=member.z-player.z,sq=dx*dx+dz*dz;if(sq<bestSq){best=member;bestSq=sq;}}
    near=api.battle.combatCount>0?null:best;
    if(near){
     const quest=log.isTarget(near.npc.id),name=speaker(near.npc.name);
     // No ? or ! after the button (2026-11-20, user): the mark over the actor's head says it.
     hud.setPrompt({key:touch?null:'E',name,action:t(quest?'prompt.actionQuest':'prompt.actionIdle'),mark:null,label:t(quest?'prompt.talkQuest':'prompt.talkIdle',{name})});
    }else hud.setPrompt(null);
   }
   updateBubble(dt);shieldTalk();coach(dt);updateSlow(dt);configureCombat();contextTips();runTips(dt);stageFight(player);updateGuide(dt,player);updateMarkers();
  },
  // QA: a cast member's visual (gesture, position) by NPC id.
  castVisual:id=>cast.find(member=>member.npc.id===id)?.visual??null,
  inspect:()=>({sceneTime:scene.active?+scene.time.toFixed(2):null,driver:fallen.state,lift:lift.active?{x:lift.spot.x,z:lift.spot.z,count:lift.count}:null,started,mapId,cast:cast.map(member=>({id:member.npc.id,x:member.x,z:member.z})),near:near?.npc.id??null,quest:log.quest()?.id??null,step:log.step()?.id??null,objective:log.objective(),dialogue:dialogue.open,hint:coachState.index,guideVisible:guide.visual?.visible===true,guide:guide.key,guideAt:guide.key?{x:+guide.track.position.x.toFixed(1),z:+guide.track.position.z.toFixed(1)}:null,tips:[...tips.seen],tip:tips.showing?.id??null,justGuards:combatState.justCount}),
  dispose(){if(disposed)return;disposed=true;stopSleepPose();doc.removeEventListener('keydown',onKey,true);guide.visual?.dispose();guide.visual=null;clearCast();markers?.dispose();markers=null;api.setMapMarkers?.([]);dialogue.dispose();hud.dispose();},
 };
}
