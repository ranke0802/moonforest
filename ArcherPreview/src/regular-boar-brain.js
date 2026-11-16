import {WolfV02Brain} from './wolf-v02-spec.js';
import {WOLF_CLIPS} from './wolf-spec.js';

const lying=new Set([WOLF_CLIPS.rest,WOLF_CLIPS.alert,WOLF_CLIPS.rise]);
const idleModes=new Set(['idle','alert','rise']);
const standing=(state,mode)=>lying.has(state)&&idleModes.has(mode);
export const BOAR_CHARGE_TIMING=Object.freeze({preparationSeconds:.9,counterSeconds:2.5});

// A boar watches from its feet and closes forward. The shared charge, contact,
// damage, fall, death and supported get-up paths retain their original owners.
export class RegularBoarBrain extends WolfV02Brain{
 constructor(...args){super(...args);this.visited.delete(WOLF_CLIPS.rest);this.beginStalk();}
 start(state,mode){this.boarPreparation=null;return super.start(standing(state,mode)?WOLF_CLIPS.watch:state,standing(state,mode)?'idle':mode);}
 startIfChanged(state,mode){return super.startIfChanged(standing(state,mode)?WOLF_CLIPS.watch:state,standing(state,mode)?'idle':mode);}
 cancelBout(){this.boarPreparation=null;return super.cancelBout();}
 startAction(id,options={}){
  const selected=id===WOLF_CLIPS.lunge?'lunge':id,action=this.actions[selected];
  if(!action?.momentumRam)return super.startAction(id,options);
  // Show the existing standing watch keys before committing. Keep the
  // incoming RUN phase/speed so the unchanged charge retains its reach/gait.
  const carry=this.state===WOLF_CLIPS.run&&this.mode==='move'?{time:this.time}:null;
  this.start(WOLF_CLIPS.watch,'idle');this.behavior='boar-windup';this.boarObserving=false;
  this.boarPreparation={id:selected,options:{...options},elapsed:0,carry};return action;
 }
 updateMomentumRam(dt){return this.boarPreparation?{events:[],speed:0}:super.updateMomentumRam(dt);}
 beginRecovery(){
  const charge=!!this.action?.momentumRam;super.beginRecovery();
  if(charge){this.followupId=null;this.followChain=false;this.recoveryFull=this.recoveryRemaining=Math.max(this.recoveryRemaining,BOAR_CHARGE_TIMING.counterSeconds);}
 }
 hit(options={}){
  const preparing=!!this.boarPreparation,accepted=super.hit(options);
  if(accepted&&preparing){this.boarPreparation=null;if(this.hp>0&&this.mode==='idle')this.beginStalk();}
  return accepted;
 }
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
 chooseFollowup(distance){if(this.action?.momentumRam)return null;const next=super.chooseFollowup(distance);return next==='paw-swipe'?(this.followupInReach('quick-bite',distance)?'quick-bite':null):next;}
 update(dt,distance,playerAlive=true){
  if(this.boarPreparation){
   const preparation=this.boarPreparation;dt=Number.isFinite(dt)?Math.max(0,dt):0;distance=Number.isFinite(distance)?Math.max(0,distance):Infinity;
   if(!playerAlive||this.hp<=0||this.stagger>0||this.sightBlocked||distance>this.balance.detectRange){this.boarPreparation=null;if(this.hp>0&&this.mode==='idle')this.beginStalk();return super.update(dt,distance,playerAlive);}
   // This non-attacking pause uses game dt; attack-speed settings and the
   // encounter's observation/yaw shortcut cannot shorten the visible signal.
   this.lastDistance=distance;this.phase=this.hp<=this.maxHp*.5?2:1;this.combatClock+=dt;this.flash=Math.max(0,this.flash-dt);
   this.retreatCooldown=Math.max(0,this.retreatCooldown-dt);this.tacticalCooldown=Math.max(0,this.tacticalCooldown-dt);this.evadeCooldown=Math.max(0,this.evadeCooldown-dt);
   preparation.elapsed+=dt;this.time=Math.min(this.durations[WOLF_CLIPS.watch]??BOAR_CHARGE_TIMING.preparationSeconds,preparation.elapsed);
   if(preparation.elapsed+1e-9>=BOAR_CHARGE_TIMING.preparationSeconds){
    this.boarPreparation=null;
    if(preparation.carry){this.state=WOLF_CLIPS.run;this.mode='move';this.time=preparation.carry.time;}
    super.startAction(preparation.id,{...preparation.options,distance});
   }
   return {events:[],speed:0};
  }
  if(this.boarObserving&&this.mode==='idle'&&this.behavior==='observe'&&this.hp>0&&playerAlive&&distance<=this.balance.detectRange&&this.observation<=Math.max(0,dt)){
   this.boarObserving=false;this.observation=0;this.boutObserved=true;this.behavior='position';this.plannedId=this.stalkPlannedId=this.chooseAction(distance);
  }
  const result=super.update(dt,distance,playerAlive);
  if(this.state===WOLF_CLIPS.watch&&this.mode==='idle'&&this.behavior==='rest')this.behavior='observe';
  return result;
 }
 get label(){return this.boarPreparation?'돌진 준비':super.label;}
}
