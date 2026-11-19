// Story runtime for 0.3: places the cast for the current map, runs
// conversations, feeds quest events and coaches the first fight. It is driven
// by boot.js from the game frame; it owns no timer or frame loop.
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Quaternion} from '@babylonjs/core/Maths/math.vector.js';
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
import {createWagonRig} from './wagon-rig.js';
import {createWagonModel} from './wagon-model.js';
import {createSleepPose} from './sleep-pose.js';

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
 let wagonHorse=null,wagonModel=null,hiddenWagon=null;
 function clearCast(){clearCover();wagonHorse?.dispose();wagonHorse=null;wagonModel?.dispose();wagonModel=null;hiddenWagon=null;for(const member of cast)member.visual.dispose();cast.length=0;near=null;hud.setPrompt(null);markers?.clear();markerKey='';}
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
    cast.push({npc,visual,x:spot.x,z:spot.z});
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
 const SCENE=Object.freeze({sleepShot:6,scream:9,sitUp:10.7,sitSeconds:.9,attack:12.2,lunge:13.35,crash:13.9,tipStart:14.0,tipSeconds:.65,heroShot:15.6,rollAt:16.2,settle:17.4,end:19,ride:17});
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
 const wagonRig=createWagonRig({getRoot:()=>wagonModel?.root??null,heightAt:(x,z)=>heightAt(x,z)});
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
  if(horseState.down){horseState.down=false;horseState.rising=3.1;wagonHorse.play('Horse_GetUp');}
  if(horseState.rising>0){horseState.rising-=dt;if(horseState.rising>0)return;}
  wagonHorse.play('Horse_Idle');
 }
 // The wagon lies on its side from the ambush until the driver and the
 // warrior set it back up (M00 fight / wagon steps), also after a reload.
 const wagonDown=()=>log.quest()?.id==='M00'&&['fight','wagon'].includes(log.step()?.id);
 // Searched once per map visit from the walkable map: ahead of the wagon on the
 // wolf's side, open around it, and a straight walkable line to the horse.
 // A little over the map's own bush size (they are .7-.94): 1.15-1.35 read as
 // out of place (2026-11-19, user). Three, loosely spaced.
 const AMBUSH_BUSHES=Object.freeze([{dx:0,df:.3,yaw:.4,scale:1.0},{dx:1.9,df:-.4,yaw:2.1,scale:.9},{dx:-1.8,df:-.2,yaw:4.0,scale:.95}]);
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
  for(const [i,bush] of AMBUSH_BUSHES.entries()){
   try{
    const R=hide.coverR??hide.r,F=hide.coverF??hide.f,x=hide.x+bush.dx*R.x+bush.df*F.x,z=hide.z+bush.dx*R.z+bush.df*F.z;
    const root=new TransformNode('v03-ambush-bush-'+i,scene);root.position.set(x,heightAt(x,z),z);root.rotation.y=bush.yaw;root.scaling.setAll(bush.scale);const meshes=[];
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
   const want=scene.wolfGait==='lunge'?(clips.lunge??'Run_Dodge_Lunge_R5'):scene.wolfGait==='run'?(clips.run??'Wolf_Run_R5'):scene.wolfGait==='walk'?(clips.walk??'Wolf_Walk_R5'):(clips.watch??'Circle_Watch_R5');
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
  // The warrior ends between the wolf and the driver.
  const guard=freeNear({x:(D.x+charge.x)/2+r.x*.6,z:(D.z+charge.z)/2+r.z*.6});
  foe.actor.position.x=far.x;foe.actor.position.z=far.z;foe.actor.position.y=heightAt(far.x,far.z);
  if(foe.actor.rotation)foe.actor.rotation.y=Math.atan2(out.x-far.x,out.z-far.z);
  scene.driver=member;scene.wolf=foe;scene.points={S,H,D,far,out,charge,guard,f,r,yaw,start:{x:player.x,z:player.z}};
  scene.wolfAt={x:far.x,z:far.z};scene.wolfSpeed=0;scene.wolfGait='watch';scene.wolfRate=1;scene.wolfOut=false;
  holdWolf(foe);
  // The shots need a longer arm than play allows; restored at the end.
  scene.upper=camera.upperRadiusLimit;camera.upperRadiusLimit=Math.max(camera.upperRadiusLimit??0,80);
  Object.assign(scene,{active:true,time:0,beat:0,shot:-1,rolled:false,rollWindow:false,radius:camera.radius,beta:camera.beta,shake:0,thrown:false,placed:false,landed:false,sleeping:true,pitch:-Math.PI/2,horse:null});
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
 // Lying in the bed: feet toward the bench, head toward the open back.
 // The limbs are laid along the body by sleep-pose.js (the model has no lying
 // clip), applied each frame after the animation; the lying body's back sits
 // 0.19 m above its feet pivot (measured on the model).
 const sleepPoses=new WeakMap();
 function startSleepPose(){
  const root=api.getPlayer?.(),bscene=api.world?.scene;if(!root||!bscene)return;
  let pose=sleepPoses.get(root);if(!pose){try{pose=createSleepPose(root);}catch(error){console.warn('[MoonForest 0.3] sleep pose skipped',error);return;}sleepPoses.set(root,pose);}
  scene.sleepWeight=1;scene.sleepObserver=bscene.onBeforeRenderObservable.add(()=>{if(scene.active&&scene.sleeping)pose.apply(scene.sleepWeight);});scene.sleepScene=bscene;
 }
 function stopSleepPose(){if(scene.sleepObserver){scene.sleepScene?.onBeforeRenderObservable.remove(scene.sleepObserver);}scene.sleepObserver=null;scene.sleepScene=null;}
 function poseSleeper(player,W0,ground,pitch){
  const P=scene.points,p=player.position;
  p.x=W0.x+P.f.x*.55+P.r.x*.15;p.z=W0.z+P.f.z*.55+P.r.z*.15;p.y=ground+.8-.19*Math.cos(pitch+Math.PI/2);
  if(player.rotation){player.rotation.y=P.yaw;player.rotation.x=pitch;player.rotation.z=0;}
 }
 function updateScene(dt){
  const lines=content.DIALOGUES['ambush-scene'],P=scene.points,wolf=scene.wolf,player=api.getPlayer();scene.time+=dt;const now=scene.time;
  while(scene.beat<SCENE_LINES.length&&now>=SCENE_LINES[scene.beat].at){const line=lines[SCENE_LINES[scene.beat++].line];if(line)hud.setCaption({who:speaker(line.who),text:line.text});}
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
  if(wagonHorse){
   wagonHorse.place(W0.x+fx*3.55,W0.z+fz*3.55,P.yaw);
   const speed=SCENE.ride/SCENE.crash*Math.max(0,1-now/SCENE.crash)*(1.35-.7*now/SCENE.crash);
   const clip=now<SCENE.attack?'Horse_Walk':now<SCENE.lunge?'Horse_Nervous':now<SCENE.tipStart?'Horse_Rear':now<SCENE.tipStart+1.5?'Horse_Fall':'Horse_Down';
   wagonHorse.play(clip);if(clip==='Horse_Walk')wagonHorse.speed?.(Math.max(.4,Math.min(1.3,speed/1.6)));
  }
  // The driver rides on the bench, then is thrown clear by the fall.
  if(now<SCENE.tipStart){const x=W0.x+fx*1.25,z=W0.z+fz*1.25;scene.driver.x=x;scene.driver.z=z;scene.driver.visual.place(x,ground+1.05,z,P.yaw);}
  else if(!scene.thrown){scene.thrown=true;scene.driver.x=P.D.x;scene.driver.z=P.D.z;scene.driver.visual.place(P.D.x,heightAt(P.D.x,P.D.z),P.D.z,Math.atan2(P.charge.x-P.D.x,P.charge.z-P.D.z));}
  // The warrior: asleep in the bed, sits up after the scream, thrown out in the fall.
  if(player&&now<SCENE.tipStart){
   const k=ease((now-SCENE.sitUp)/SCENE.sitSeconds);scene.pitch=-Math.PI/2+(Math.PI/2-.3)*k;scene.sleepWeight=1-k;
   poseSleeper(player,W0,ground,scene.pitch);
  }else if(scene.sleeping){scene.sleeping=false;stopSleepPose();if(player?.rotation){player.rotation.x=0;player.rotation.z=0;}showPlayer(false);}
  // The wolf: waits behind the firewood, breaks out round its side, springs at the horse.
  {const Wf=scene.wolfAt,bal=wolf.brain?.balance??{},run=bal.runSpeed??4.2,rate=bal.locomotionPlaybackRate??1;
   let target=P.far;
   if(now>=SCENE.attack){if(!scene.wolfOut&&Math.hypot(P.out.x-Wf.x,P.out.z-Wf.z)<.6)scene.wolfOut=true;target=scene.wolfOut?P.charge:P.out;}
   const dx=target.x-Wf.x,dz=target.z-Wf.z,dist=Math.hypot(dx,dz);
   // Paced so it reaches the horse as the spring starts.
   const left=Math.max(.25,SCENE.lunge-now),path=dist+(scene.wolfOut?0:Math.hypot(P.charge.x-P.out.x,P.charge.z-P.out.z));
   const want=now<SCENE.attack||dist<.03?0:Math.min(run*1.6,Math.max(run*.8,path/left));
   scene.wolfSpeed+=Math.max(-14*dt,Math.min(14*dt,want-scene.wolfSpeed));
   const step=Math.min(dist,scene.wolfSpeed*dt);if(dist>1e-6){Wf.x+=dx/dist*step;Wf.z+=dz/dist*step;}
   const v=scene.wolfSpeed;
   scene.wolfGait=now>=SCENE.lunge&&now<SCENE.heroShot?'lunge':v>2.4?'run':v>.12?'walk':'watch';
   scene.wolfRate=scene.wolfGait==='run'?rate*Math.max(.6,Math.min(1.4,v/run)):1;
   wolf.actor.position.x=Wf.x;wolf.actor.position.z=Wf.z;wolf.actor.position.y=heightAt(Wf.x,Wf.z);
   const look=now<SCENE.attack?P.out:now<SCENE.heroShot?{x:W0.x+fx*3.55,z:W0.z+fz*3.55}:P.guard;
   if(wolf.actor.rotation&&Math.hypot(look.x-Wf.x,look.z-Wf.z)>.2)wolf.actor.rotation.y=Math.atan2(look.x-Wf.x,look.z-Wf.z);}
  const Wf=scene.wolfAt,rx=P.r.x,rz=P.r.z;
  scene.shake=Math.max(0,scene.shake-dt);const jolt=scene.shake>0?Math.sin(now*61)*.05*scene.shake/.45:0;
  if(shot===0){
   // Over the plains, closing slowly on the wagon from behind and to the side.
   const k=ease(now/SCENE.sleepShot),back=28-21.5*k,side=14-11.8*k,up=26-22.6*k,ahead=8*(1-k);
   frameEye(W0.x-fx*back+rx*side,ground+up,W0.z-fz*back+rz*side,W0.x+fx*ahead,ground+1.5*k,W0.z+fz*ahead);
  }else if(shot===1){
   // Low through the open back, between the tail rails: the warrior asleep in
   // the bed (from 1.9 m the bed's high sides hid him; checked in renders of
   // the wagon from behind: 1.5 m just past the tailboard sees the whole bed).
   const k=ease((now-SCENE.sleepShot)/(SCENE.scream-SCENE.sleepShot)),back=3.25-.4*k;
   frameEye(W0.x-fx*back+rx*.1,ground+1.5,W0.z-fz*back+rz*.1,W0.x-fx*.3,ground+1.0,W0.z-fz*.3);
  }else if(shot===2){
   // From his eyes: the canopy overhead, then up to the bench as he sits up.
   const pitch=scene.pitch,c=Math.cos(pitch),s=Math.sin(pitch),feet={x:W0.x+fx*.55+rx*.15,z:W0.z+fz*.55+rz*.15};
   const ex=feet.x+fx*1.55*s,ez=feet.z+fz*1.55*s,ey=ground+.95+1.55*c+jolt;
   const lx=ex+fx*(3*c+1.2),lz=ez+fz*(3*c+1.2),ly=ey-3*s-.4*(1-c);
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
   // The warrior is on his feet by the wreck; he rolls in between.
   showPlayer(true);
   if(player&&!scene.placed){scene.placed=true;const p=player.position,spot=freeNear({x:P.S.x+rx*WOLF_SIDE*2.6,z:P.S.z+rz*WOLF_SIDE*2.6});p.x=spot.x;p.z=spot.z;p.y=heightAt(p.x,p.z);if(player.rotation)player.rotation.y=Math.atan2(P.guard.x-p.x,P.guard.z-p.z);}
   const mid={x:(P.D.x+Wf.x)/2,z:(P.D.z+Wf.z)/2};
   frame(mid,1,alphaFrom(P.S,mid)+.9,8.5,1.2);
   if(!scene.rolled&&now>=SCENE.rollAt&&player){
    scene.rolled=true;const p=player.position;if(player.rotation)player.rotation.y=Math.atan2(P.guard.x-p.x,P.guard.z-p.z);
    scene.rollWindow=true;try{api.actions?.dodge?.();}finally{scene.rollWindow=false;}
   }
  }else{
   // Settle on the guard spot facing the wolf, then swing behind.
   showPlayer(true);
   const camera=api.world.camera;
   if(player){const p=player.position,k=Math.min(1,dt*6);p.x+=(P.guard.x-p.x)*k;p.z+=(P.guard.z-p.z)*k;p.y=heightAt(p.x,p.z);if(player.rotation)player.rotation.y=Math.atan2(Wf.x-p.x,Wf.z-p.z);}
   const k=ease((now-SCENE.settle)/1.3),behind=clearAlpha(alphaFrom(P.D,Wf),P.guard,(content.PROPS??[]).filter(prop=>prop.map===mapId));
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
  releaseWolf(scene.wolf);
  hud.setCaption(null);api.input.setSuspended(false);hud.flash(t('scene.protect'));coachState.alpha=camera?.alpha??coachState.alpha;
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
  // Wagon frame: standing spans -2.6..4.6 along (bed to horse), +-1.3 across;
  // lying, the canopy reaches out to 4.3 on the fall side.
  const along=state==='up'?1.0:.8,across=state==='up'?0:WAGON_FALL*2.6,halfWidth=state==='up'?1.3:1.75,halfDepth=state==='up'?3.6:3.5;
  const x=prop.x+f.x*along+r.x*across,z=prop.z+f.z*along+r.z*across;
  const block={id:'v03-story-wagon-'+state,shape:'box',x,z,yaw,halfWidth,halfDepth,radius:Math.hypot(halfWidth,halfDepth),height:1.6,source:'v03-story-wagon'};
  try{const next=createAuthoredPlacementNavigation(base,[block],'v03-wagon-'+(++blockSerial));world.navigation=next;navOurs=new WeakRef(next);blockState=state;}
  catch(error){console.warn('[MoonForest 0.3] wagon collision skipped',error);blockState=state;}
 }
 // ----- setting the wagon back up (M00, after the fight) -----
 // The driver's 'right-wagon' line sends him to the toppled wagon; the warrior
 // walks round to the roof side next to him and pushes (E, three heaves with
 // the shield shove). The wagon rises a third per heave and drops onto its
 // wheels on the last; then the driver's thanks play (2026-11-19, user).
 const PUSHES=3,HEAVE_SECONDS=.55,PUSH_RANGE=1.7,PUSH_RANGE_SQ=PUSH_RANGE*PUSH_RANGE;
 const lift={active:false,spot:null,helper:null,count:0,from:1,to:1,time:0,member:null,cued:false,caption:0,called:-1,callIn:0};
 const COUNT_KEYS=Object.freeze(['lift.one','lift.two','lift.three']);
 // The driver must stand at his place before the first heave (it used to be
 // pushable while he was still walking over; 2026-11-19, user).
 function driverPlaced(){const at=lift.member?.visual?.position;if(!at||!lift.helper)return !lift.member?.visual?.walkTo;const dx=at.x-lift.helper.x,dz=at.z-lift.helper.z;return dx*dx+dz*dz<.36;}
 function driverSays(key){hud.setCaption({who:speaker('마부'),text:t(key)});lift.caption=1.3;}
 function liftSpots(){
  const prop=openingWagon();if(!prop)return null;const yaw=prop.yaw??0,f={x:Math.sin(yaw),z:Math.cos(yaw)},r={x:Math.cos(yaw),z:-Math.sin(yaw)};
  // The wagon lies on its WAGON_FALL side: its roof edge is out there.
  const out=4.9;
  return {player:freeNear({x:prop.x+r.x*WAGON_FALL*out-f.x*.7,z:prop.z+r.z*WAGON_FALL*out-f.z*.7}),helper:freeNear({x:prop.x+r.x*WAGON_FALL*out+f.x*.9,z:prop.z+r.z*WAGON_FALL*out+f.z*.9}),face:{x:prop.x,z:prop.z}};
 }
 function startLift(member){
  const spots=liftSpots();if(!spots||!member)return false;
  Object.assign(lift,{active:true,spot:spots.player,helper:spots.helper,face:spots.face,count:0,from:1,to:1,time:HEAVE_SECONDS,member,cued:false,caption:0,called:-1,callIn:0});
  const yaw=Math.atan2(spots.face.x-spots.helper.x,spots.face.z-spots.helper.z);
  if(member.visual.walkTo)member.visual.walkTo(spots.helper.x,spots.helper.z,{yaw,heightAt});
  else{member.x=spots.helper.x;member.z=spots.helper.z;member.visual.place(spots.helper.x,heightAt(spots.helper.x,spots.helper.z),spots.helper.z,yaw);}
  return true;
 }
 // Called by interact() while the lift waits for the warrior.
 function nearLift(player){if(!lift.active||!player||!lift.spot)return false;const dx=player.x-lift.spot.x,dz=player.z-lift.spot.z;return dx*dx+dz*dz<=PUSH_RANGE_SQ;}
 function push(){
  if(!lift.active||lift.time<HEAVE_SECONDS||lift.count>=PUSHES||!driverPlaced()||lift.called!==lift.count)return false;
  const player=api.getPlayer?.();if(player?.rotation){const p=player.position;player.rotation.y=Math.atan2(lift.face.x-p.x,lift.face.z-p.z);}
  try{api.actions?.guard?.();}catch{/* the heave still counts */}
  lift.member?.visual.gesture?.('Agree_Gesture');
  lift.count++;lift.from=lift.to;lift.to=1-lift.count/PUSHES;lift.time=0;lift.callIn=.35;lift.caption=.5;
  api.playSound?.(lift.count<PUSHES?'shield_up':'land',{volume:.75});
  return true;
 }
 function updateLift(dt,player){
  if(!lift.active)return false;
  if(lift.caption>0){lift.caption-=dt;if(lift.caption<=0)hud.setCaption(null);}
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
    wagonRig.upright();const member=lift.member;lift.active=false;lift.member=null;hud.setPrompt(null);hud.setCaption(null);lift.caption=0;
    emit({type:'talk',npc:'driver'});
    if(member&&!disposed){near=member;void interact();}
    return true;
   }
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
 // wolf's) plays 0.3 s of real time at 30 % speed: the moment reads clearly.
 const SLOW_SCALE=.18,SLOW_SECONDS=.45,ATTACK_STATES=new Set(['attack','slash','judgment','moveAttack']);
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
 // Stronger since 2026-11-19 evening (user: hard to notice): 20 % push-in.
 const SLOW_ZOOM=.2,SLOW_ZOOM_IN=.1,SLOW_ZOOM_OUT=.45;
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
   hidePlacedWagon();updateCover(dt);
   if(scene.active){try{updateScene(dt);}catch(error){console.warn('[MoonForest 0.3] ambush scene stopped',error);try{endScene();}catch{scene.active=false;showPlayer(true);api.input.setSuspended(false);}}coach(0);updateGuide(dt,null);return;}
   // Strolling actors: talk range and markers follow where they stand now.
   for(const member of cast){const at=member.visual.position;if(at){member.x=at.x;member.z=at.z;}}
   const player=api.getPlayer()?.position;
   if(wagonDown())poseWagonForStory();horseMotion(dt);wagonCollision(scene.active?null:wagonDown()||lift.active?'down':'up');
   if(updateLift(dt,player))return;
   if(player&&!talking&&!dialogue.open&&!lift.active){
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
  inspect:()=>({lift:lift.active?{x:lift.spot.x,z:lift.spot.z,count:lift.count}:null,started,mapId,cast:cast.map(member=>({id:member.npc.id,x:member.x,z:member.z})),near:near?.npc.id??null,quest:log.quest()?.id??null,step:log.step()?.id??null,objective:log.objective(),dialogue:dialogue.open,hint:coachState.index,guideVisible:guide.visual?.visible===true,guide:guide.key,guideAt:guide.key?{x:+guide.track.position.x.toFixed(1),z:+guide.track.position.z.toFixed(1)}:null,tips:[...tips.seen],tip:tips.showing?.id??null,justGuards:combatState.justCount}),
  dispose(){if(disposed)return;disposed=true;stopSleepPose();doc.removeEventListener('keydown',onKey,true);guide.visual?.dispose();guide.visual=null;clearCast();markers?.dispose();markers=null;api.setMapMarkers?.([]);dialogue.dispose();hud.dispose();},
 };
}
