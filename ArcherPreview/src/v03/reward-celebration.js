import {createLevelUpFx} from './levelup-fx.js';
import {createRewardHud} from './reward-hud.js';
import {reducedMotion} from './accessibility.js';

// Level-up and quest-reward moments (2026-11-27, user: "레벨업시 텍스트만 있음").
// - Several levels at once, or more levels while a banner is still young, are one
//   banner with the final level and the summed skill points.
// - Nothing starts during a dialogue, a cutscene, loading or an open dialog: the moment
//   waits and plays when the screen is free (allowed() is asked only while one waits).
// - One world effect, one banner, one reward strip: a new moment replaces or merges, never stacks.
// The page's frame loop drives it (update); no timer, no frame callback of its own.
// Lifetime: page; the world effect is rebuilt for a new scene and holds only the player root.
export const LEVEL_SECONDS=2.8, REWARD_SECONDS=2.6, MERGE_SECONDS=.9;

const merge=(into,event)=>{
 into.level=Math.max(into.level,event.level);into.points+=event.points??0;
 into.ratio=event.ratio??into.ratio;into.cap=event.cap??into.cap;into.hp=(into.hp??0)+(event.hp??0);into.attack=(into.attack??0)+(event.attack??0);return into;
};
const copy=event=>({level:event.level,points:event.points??0,cap:event.cap??20,ratio:event.ratio??0,fromRatio:event.fromRatio??0,hp:event.hp??0,attack:event.attack??0});
const addReward=(into,r)=>{into.gold+=r.gold??0;into.xp+=r.xp??0;into.potions+=r.potions??0;into.armor=r.armor??into.armor;return into;};

export function createRewardCelebration({doc,mount,reduced=reducedMotion,playCue=()=>false,createFx=createLevelUpFx,createHud=createRewardHud}){
 const hud=createHud({doc,mount});
 let fx=null,fxScene=null,disposed=false,mapId=null;
 let pending=null,current=null,age=0;
 let pendingReward=null,rewardAge=-1;
 function bindScene(scene,player){
  if(scene!==fxScene||fx&&scene?.isDisposed){
   fx?.dispose();fx=null;fxScene=scene??null;
   if(scene&&!scene.isDisposed&&scene.getEngine)try{fx=createFx({scene});}catch(error){console.warn('[MoonForest 0.3] level-up light unavailable',error);}
  }
  if(fx&&player!==fx.root)fx.bind(player);
 }
 function endLevel(){current=null;hud.hideLevel();fx?.stop();}
 function startLevel(){
  current=pending;pending=null;age=0;
  const less=reduced();
  hud.showLevel(current);
  fx?.play({reduced:less});
  playCue('levelup');
 }
 function endReward(){rewardAge=-1;hud.hideReward();}
 function startReward(){
  const summary=pendingReward;pendingReward=null;
  if(hud.showReward(summary)){rewardAge=0;playCue('quest:complete');}
 }
 return {hud,
  get fx(){return fx;},
  // event: {level, points, cap, ratio (0..1 into the next level), fromRatio (before the gain), hp, attack (what the levels added)}
  levelUp(event){
   if(disposed||!Number.isSafeInteger(event?.level))return false;
   if(current&&age<MERGE_SECONDS){merge(current,event);hud.updateLevel(current);return true;}
   pending=pending?merge(pending,event):copy(event);
   return true;
  },
  // summary: {gold, xp, potions, armor}; shown under the reward message.
  reward(summary){
   if(disposed||!summary)return false;
   pendingReward=addReward(pendingReward??{gold:0,xp:0,potions:0,armor:null},summary);
   return true;
  },
  // state: {scene, player, mapId, allowed()}: allowed is read only while something waits or plays.
  update(dt,state){
   if(disposed)return;
   bindScene(state.scene,state.player);
   if(state.mapId!==mapId){mapId=state.mapId;if(current)endLevel();if(rewardAge>=0)endReward();}
   if(!current&&!pending&&rewardAge<0&&!pendingReward)return;
   const free=state.allowed();
   if(current){
    age+=dt;fx?.tick();
    if(!free||age>=LEVEL_SECONDS)endLevel();
   }else if(pending&&free)startLevel();
   if(rewardAge>=0){
    rewardAge+=dt;hud.tick(dt);
    if(!free||rewardAge>=REWARD_SECONDS)endReward();
   }else if(pendingReward&&free)startReward();
  },
  get active(){return !!current||rewardAge>=0;},
  get waiting(){return !!pending||!!pendingReward;},
  inspect(){return {level:current?{...current,age}:null,pending:pending?{...pending}:null,reward:rewardAge>=0,pendingReward:!!pendingReward,fx:fx?.inspect()??null};},
  clear(){pending=null;pendingReward=null;if(current)endLevel();if(rewardAge>=0)endReward();},
  dispose(){if(disposed)return;disposed=true;pending=null;pendingReward=null;fx?.dispose();fx=null;fxScene=null;hud.dispose();},
 };
}
