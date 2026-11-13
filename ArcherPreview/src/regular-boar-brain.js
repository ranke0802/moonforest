import {WolfV02Brain} from './wolf-v02-spec.js';
import {WOLF_CLIPS} from './wolf-spec.js';

const lying=new Set([WOLF_CLIPS.rest,WOLF_CLIPS.alert,WOLF_CLIPS.rise]);
const idleModes=new Set(['idle','alert','rise']);
const standing=(state,mode)=>lying.has(state)&&idleModes.has(mode);

// A boar watches from its feet and closes forward. The shared charge, contact,
// damage, fall, death and supported get-up paths retain their original owners.
export class RegularBoarBrain extends WolfV02Brain{
 constructor(...args){super(...args);this.visited.delete(WOLF_CLIPS.rest);this.beginStalk();}
 start(state,mode){return super.start(standing(state,mode)?WOLF_CLIPS.watch:state,standing(state,mode)?'idle':mode);}
 startIfChanged(state,mode){return super.startIfChanged(standing(state,mode)?WOLF_CLIPS.watch:state,standing(state,mode)?'idle':mode);}
 chooseAction(distance){
  if(this.attackSettings?.custom){const requested=super.chooseAction(distance);return requested==='paw-swipe'?'lunge':requested;}
  return 'lunge';
 }
 beginStalk(){
  this.followupId=null;this.followChain=false;this.boutStrikes=0;this.plannedId=this.stalkPlannedId=null;this.boutObserved=false;
  this.ramApproachVariant='run-ram';this.ramEvaded=true;this.orbitTargetRadius=null;this.stalkBlocked=false;
  this.start(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.boarObserving=true;
  const value=Number(this.random());this.observation=.8+.4*Math.max(0,Math.min(1,Number.isFinite(value)?value:.5));
 }
 beginRamEvade(counter=false){
  if(counter)this.lastEvadedActionId=this.playerThreatActionId;
  this.evadeCooldown=this.tactics.evadeCooldown;this.ramApproachVariant='run-ram';this.ramEvaded=true;
  this.start(WOLF_CLIPS.watch,'idle');this.behavior='position';this.boarObserving=false;this.boutObserved=true;this.plannedId=this.stalkPlannedId='lunge';
 }
 chooseFollowup(distance){const next=super.chooseFollowup(distance);return next==='paw-swipe'?(this.followupInReach('quick-bite',distance)?'quick-bite':null):next;}
 update(dt,distance,playerAlive=true){
  if(this.boarObserving&&this.mode==='idle'&&this.behavior==='observe'&&this.hp>0&&playerAlive&&distance<=this.balance.detectRange&&this.observation<=Math.max(0,dt)){
   this.boarObserving=false;this.observation=0;this.boutObserved=true;this.behavior='position';this.plannedId=this.stalkPlannedId=this.chooseAction(distance);
  }
  const result=super.update(dt,distance,playerAlive);
  if(this.state===WOLF_CLIPS.watch&&this.mode==='idle'&&this.behavior==='rest')this.behavior='observe';
  return result;
 }
}
