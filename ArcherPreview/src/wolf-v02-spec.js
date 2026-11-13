import {WolfBrain,WOLF_CLIPS,WOLF_BALANCE,WOLF_SCALE} from './wolf-spec.js';
export const WOLF_V02_KNOCKBACK_SCALE=.8;

// R11's torso-led diagonal bites use R8's unchanged rig. Older authored bites
// remain historical sources; the full lunge/pin retain their original poses.
export const WOLF_V02_SNAP='Wolf_Predator_Diagonal_Bite_V02',WOLF_V02_SWIPE='Wolf_Predator_Reverse_Bite_V02';
export const WOLF_V02_BRACE='Wolf_Backward_Brace_V02',WOLF_V02_DEATH='Wolf_Staggered_Collapse_V02';
export const WOLF_V02_GET_UP='Wolf_Supported_Get_Up_V02',WOLF_V02_BACK_RUN='Wolf_Backward_Run_V02';
export const WOLF_V02_AIR_REACTION='Wolf_Airborne_Knockback_Land_V02';
export const WOLF_V02_RAM='Wolf_Ram_Ground_Maul_V02';
export const WOLF_V02_CLOSE_RAM='Wolf_Close_Ram_Ground_Maul_V02';
export const WOLF_V02_RAM_PHASES=Object.freeze([
 {id:'ram',kind:'ram',contactStart:2.54,contactEnd:2.73,impact:2.62,damage:40,contactParts:Object.freeze(['head'])},
 {id:'maul-1',kind:'maul',contactStart:3.64,contactEnd:3.70,impact:3.65,damage:30,contactParts:Object.freeze(['jaw'])},
 {id:'maul-2',kind:'maul',contactStart:4.19,contactEnd:4.25,impact:4.20,damage:30,contactParts:Object.freeze(['jaw'])},
].map(Object.freeze));
const closeOffset=112/60;
export const WOLF_V02_CLOSE_RAM_PHASES=Object.freeze(WOLF_V02_RAM_PHASES.map(phase=>Object.freeze({...phase,contactStart:phase.contactStart-closeOffset,contactEnd:phase.contactEnd-closeOffset,impact:phase.impact-closeOffset})));
export const WOLF_V02_MOMENTUM_RAM_PHASES=Object.freeze([Object.freeze({...WOLF_V02_CLOSE_RAM_PHASES[0],contactStart:.28,contactEnd:.42,impact:.34}),...WOLF_V02_CLOSE_RAM_PHASES.slice(1)]);
export const WOLF_V02_ORBIT=Object.freeze({right:'Wolf_Orbit_Step_V02',left:'Wolf_Orbit_Step_Left_V02'});
// R8's supported run feet travel 4.2 source metres per source second (17/30 s
// per cycle). At 2.5x the cadence, rather than the stride, matches world speed.
export const WOLF_V02_GAIT=Object.freeze({runSpeed:6.6,farRunSpeed:9.2,runAcceleration:8,runSourceSpeed:4.2,runPlaybackRate:6.6/(4.2*WOLF_SCALE),runSourceStart:1/30,runSourceDuration:17/30,orbitPlaybackRate:1.25,orbitFastPlaybackRate:1.8,orbitRadius:1.2});
const quick={sourceClip:WOLF_V02_SNAP,clipStart:0,clipEnd:.80,impact:20/60,commitTime:.20,capture:false,damage:55,range:4,minDistance:2.8,maxDistance:3.15,preferredDistance:3.0,recovery:.60,authoredAttention:true,contactParts:['jaw','head'],whip:{source:[0,.20,.40,.80],seconds:[0,.26,.305,.68]}};
export const WOLF_V02_ACTIONS=Object.freeze([
 {id:'quick-bite',label:'짧은 입질',...quick},
 {id:'chain-bite',label:'연속 입질',...quick,damage:45,recovery:.68,chain:true},
 {id:'paw-swipe',label:'사선 돌진 물기',sourceClip:WOLF_V02_SWIPE,clipStart:0,clipEnd:52/60,impact:22/60,commitTime:.22,capture:false,damage:65,range:4,minDistance:2.8,maxDistance:3.25,preferredDistance:3.1,recovery:.65,authoredAttention:true,contactParts:['jaw','head'],whip:{source:[0,.22,26/60,52/60],seconds:[0,.28,.325,.74]}},
 {id:'lunge',label:'질주 박치기·추격 물어뜯기',sourceClip:WOLF_CLIPS.run,maulSourceClip:WOLF_V02_CLOSE_RAM,momentumRam:true,variant:'gallop-ram',clipStart:0,clipEnd:.60,impact:.34,contactStart:.28,contactEnd:.42,commitTime:.20,capture:false,damage:100,range:4,minDistance:3.8,maxDistance:6.5,preferredDistance:4.5,recovery:1.10,contactParts:['head'],authoredAttention:true,ramPhases:WOLF_V02_MOMENTUM_RAM_PHASES,postRamClock:.34,maulClipStart:1.50,maulClipEnd:200/60,abortRecoveryStart:4.32-closeOffset,whip:{source:[0,.10,.28,.34,.42,.60],seconds:[0,.16,.26,.285,.36,.49]}},
 {id:'pin',label:'앞발 제압·물기',sourceClip:WOLF_CLIPS.pin,clipStart:0,clipEnd:3.4,impact:1.20,commitTime:.85,capture:true,damage:120,range:3.2,minDistance:8.7,maxDistance:9.5,preferredDistance:9.1,recovery:1.05,contactParts:['jaw','head'],whip:{source:[0,.85,1.20,1.85,3.4],seconds:[0,.50,.57,.68,1.58]}},
].map(a=>Object.freeze({...a,contactStart:a.contactStart??(a.sourceClip===WOLF_V02_SNAP?.29:a.sourceClip===WOLF_V02_SWIPE?.32:a.capture?a.impact:a.impact-.03),contactEnd:a.contactEnd??(a.sourceClip===WOLF_V02_SNAP?.40:a.sourceClip===WOLF_V02_SWIPE?26/60:a.impact+.12),contactParts:a.contactParts?Object.freeze(a.contactParts):undefined,whip:Object.freeze({source:Object.freeze(a.whip.source),seconds:Object.freeze(a.whip.seconds)})})));
export const WOLF_V02_BY_ID=Object.freeze(Object.fromEntries(WOLF_V02_ACTIONS.map(a=>[a.id,a])));
export const WOLF_V02_CLOSE_RAM_ACTION=WOLF_V02_BY_ID.lunge;
export const WOLF_V02_TACTICS=Object.freeze({recentDamageFraction:.15,recentDamageSeconds:3,healthyHpFraction:.5,retreatCooldown:6,retreatDistance:4.8,maximumRetreatRange:8,evadeCooldown:2,evadePlaybackRate:2.5});
export const WOLF_V02_RAM_CHASE=Object.freeze({source:Object.freeze([2.70-closeOffset,3.05-closeOffset,3.64-closeOffset,3.65-closeOffset,3.70-closeOffset,4.19-closeOffset,4.20-closeOffset,4.25-closeOffset,200/60]),seconds:Object.freeze([0,.24,.46,.48,.53,1.01,1.03,1.08,2.03]),earliestProne:.82,latestProne:1.10});
const aliases={[WOLF_CLIPS.lunge]:'lunge',[WOLF_CLIPS.pin]:'pin'};
const deck1=['quick-bite','paw-swipe'],deck2=['chain-bite','paw-swipe','quick-bite','paw-swipe'];
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const actionDuration=action=>action.whip.seconds.at(-1);
export function sampleWhipTime(action,elapsed){
 const {source,seconds}=action.whip,t=clamp(elapsed,0,seconds.at(-1));
 let i=0;while(i<seconds.length-2&&t>seconds[i+1])i++;
 return source[i]+(source[i+1]-source[i])*clamp((t-seconds[i])/(seconds[i+1]-seconds[i]),0,1);
}
export function whipElapsedAt(action,sourceTime){
 const {source,seconds}=action.whip,t=clamp(sourceTime,source[0],source.at(-1));
 let i=0;while(i<source.length-2&&t>source[i+1])i++;
 return seconds[i]+(seconds[i+1]-seconds[i])*clamp((t-source[i])/(source[i+1]-source[i]),0,1);
}
export function advanceWolfActionElapsed(action,elapsed,dt,speed){
 if(!action.ramPhases)return elapsed+dt*speed;
 const boundary=whipElapsedAt(action,action.postRamClock);
 if(elapsed>=boundary)return elapsed+dt;
 const prefix=(boundary-elapsed)/speed;
 return dt<=prefix?elapsed+dt*speed:boundary+dt-prefix;
}

export class WolfV02Brain extends WolfBrain{
 constructor(durations,balance=WOLF_BALANCE,random=Math.random){
  super(durations,balance);this.random=random;this.behavior='rest';this.phase=1;this.planIndex=0;this.flankSide=1;this.lastOutcome=null;this.recoveryRemaining=0;this.observation=0;this.positionElapsed=0;this.boutStrikes=0;this.lastDistance=Infinity;this.circleTarget=0;this.circleElapsed=0;this.boutObserved=false;this.retreatCooldown=0;this.retreatPending=null;
  this.combatClock=0;this.recentDamageTimes=new Float64Array(32);this.recentDamageValues=new Float64Array(32);this.recentDamageCursor=0;this.recentDamage=0;this.tacticalCooldown=0;this.evadeCooldown=0;
 }
 configureAttacks(value={}){
  const sequence=(Array.isArray(value.sequence)?value.sequence:[]).map(id=>aliases[id]??id).filter(id=>WOLF_V02_BY_ID[id]).slice(0,12),custom=value.custom===true&&sequence.length>0,speed=Number(value.speed),old=this.attackSettings;
  if(old?.custom!==custom||old?.sequence.join('|')!==sequence.join('|')){this.customAttackIndex=0;this.plannedId=null;this.stalkPlannedId=null;this.orbitTargetRadius=null;}
  this.attackSettings={custom,sequence,speed:Number.isFinite(speed)?clamp(speed,.5,2):1};
 }
 start(state,mode){
  super.start(state,mode);
  if(mode!=='attack'){this.action=null;this.actionId=null;}
 }
 startAction(id,{continuation=false,distance}={}){
  const action=WOLF_V02_BY_ID[aliases[id]??id];if(!action)throw new Error('알 수 없는 늑대 공격: '+id);
  const carry=action.momentumRam&&this.state===WOLF_CLIPS.run&&this.mode==='move',gait=carry?this.time:WOLF_V02_GAIT.runSourceStart,runClock=carry?(this.gaitClock??gait-WOLF_V02_GAIT.runSourceStart):0,speed=carry?(this.approachSpeed??WOLF_V02_GAIT.runSpeed):WOLF_V02_GAIT.runSpeed;
  this.start(action.sourceClip,'attack');this.action=action;this.actionId=action.id;this.time=action.clipStart;this.actionElapsed=0;this.behavior='anticipation';this.attackCount++;this.lastOutcome=null;this.resolvedSerial=null;this.pinImpactPassed=false;
  this.boutStrikes=continuation?this.boutStrikes+1:1;
  if(!continuation)this.boutObserved=false;
  if(action.ramPhases){this.ramAbortReason=null;this.ramRecoveryOrigin=null;this.ramAccepted=false;this.ramAcceptedClock=null;this.ramChaseClock=null;this.ramStartDistance=distance??this.lastDistance;this.time=action.clipStart;}
  if(action.momentumRam){this.time=gait;this.ramRunClock=runClock;this.ramRunSpeed=speed;this.ramActualSpeed=speed;this.ramStage='charge';this.ramLayerElapsed=Math.max(0,whipElapsedAt(action,action.contactStart)-Math.max(0,(distance??4.5)-(this.ramReach??2.5))/speed*this.castSpeed);this.ramLayerTime=sampleWhipTime(action,this.ramLayerElapsed);this.ramContactTime=this.ramLayerTime;this.ramStageClock=0;}
  this.chainRemaining=action.chain&&this.boutStrikes<3&&!continuation?1:0;this.plannedId=null;this.positionElapsed=0;this.followupId=null;this.followChain=false;
  return action;
 }
 abortRam(reason='ram-miss'){
  if(!this.action?.ramPhases||this.mode!=='attack')return false;
  if(this.action.momentumRam){this.ramAbortReason=reason;this.lastOutcome='miss';this.requestRetreat('miss');this.ramStage='miss-brake';return true;}
  this.ramAbortReason=reason;this.requestRetreat('miss');return true;
 }
 beginRamRecovery(){
  const action=this.action;if(!action?.ramPhases)return;
  // A victim leaving after the ram must not pull the low, planted maul pose
  // back into the old airborne landing. Finish the authored recovery steps.
  const accepted=this.ramAccepted===true;
  this.start(accepted?action.sourceClip:action.missSourceClip,'ramRecover');this.action=action;this.actionId=action.id;
  this.time=this.ramRecoveryOrigin=accepted?action.abortRecoveryStart:action.missClipStart;this.ramRecoveryEnd=accepted?action.clipEnd:action.missClipEnd;this.impacted=true;this.behavior='followthrough';
 }
 noteAttackResult({serial=this.serial,hit=false,blocked=false,captured=false}={}){
  if(serial!==this.serial||!this.action)return false;
  const outcome=captured?'captured':blocked?'blocked':hit?'hit':'miss';
  // The encounter may first see empty space and then meet the player later in
  // the same bounded contact window. A miss may improve; resolved hits/blocks
  // cannot be overwritten and cannot create another strike serial.
  if(this.resolvedSerial===serial&&(this.lastOutcome!=='miss'||outcome==='miss'))return false;
  this.resolvedSerial=serial;this.lastOutcome=outcome;
  if(blocked)this.chainRemaining=0;
  return true;
 }
 requestRetreat(reason){if(this.retreatCooldown<=0)this.retreatPending=reason;}
 cancelBout(){this.chainRemaining=0;this.followupId=null;this.followChain=false;this.boutStrikes=0;this.plannedId=null;this.boutObserved=false;}
 reactionClip(brace=false){return brace&&this.durations[WOLF_V02_BRACE]?WOLF_V02_BRACE:brace?WOLF_CLIPS.brace:WOLF_CLIPS.hit;}
 recordDamage(damage){
  if(this.hp<this.maxHp*WOLF_V02_TACTICS.healthyHpFraction){this.recentDamageValues.fill(0);this.recentDamage=0;this.tacticalRetreatPending=false;return;}
  const index=this.recentDamageCursor++%this.recentDamageValues.length;this.recentDamageTimes[index]=this.combatClock;this.recentDamageValues[index]=damage;let sum=0;
  for(let i=0;i<this.recentDamageValues.length;i++)if(this.combatClock-this.recentDamageTimes[i]<=WOLF_V02_TACTICS.recentDamageSeconds)sum+=this.recentDamageValues[i];
  this.recentDamage=sum;if(!this.tacticalCooldown&&sum>=this.maxHp*WOLF_V02_TACTICS.recentDamageFraction)this.tacticalRetreatPending=true;
 }
 beginTacticalRetreat(){
  this.cancelBout();this.retreatPending=null;this.tacticalRetreatPending=false;this.tacticalCooldown=WOLF_V02_TACTICS.retreatCooldown;this.recentDamageValues.fill(0);this.recentDamage=0;
  this.backRunTarget=Math.min(WOLF_V02_TACTICS.maximumRetreatRange,this.lastDistance+WOLF_V02_TACTICS.retreatDistance);this.backRunElapsed=0;this.backRunCycles=0;this.backRunDone=this.backRunBlocked=false;
  if(this.lastDistance>=this.backRunTarget||!this.durations[WOLF_V02_BACK_RUN]){this.beginStalk();return;}
  this.start(WOLF_V02_BACK_RUN,'backRun');this.behavior='back-run';
 }
 beginRamEvade(counter=false){
  if(counter)this.lastEvadedActionId=this.playerThreatActionId;
  this.evadeCooldown=WOLF_V02_TACTICS.evadeCooldown;this.ramEvaded=true;this.evadeCounterId=counter&&this.lastDistance<3.6?'quick-bite':'lunge';this.flankSide*=-1;
  this.start(this.flankSide>0?WOLF_V02_ORBIT.right:WOLF_V02_ORBIT.left,'ramEvade');this.behavior='evade-counter';this.ramEvadeElapsed=0;this.stalkBlocked=false;this.flankReversed=false;
 }
 hit(options={}){
  const grounded=['down','recover'].includes(this.mode),before=this.hp;
  const accepted=super.hit({...options,heavy:false,stun:0,interruptsBoss:false});if(!accepted)return false;
  this.recordDamage(before-this.hp);
  if(this.hp<=0){this.stagger=0;const clip=options.heavy&&this.durations[WOLF_V02_AIR_REACTION]?WOLF_V02_AIR_REACTION:WOLF_V02_DEATH;if(this.durations[clip])this.start(clip,'down');this.cancelBout();this.behavior='dead';return true;}
  if(grounded)return true;
  if(options.heavy){
   this.cancelBout();this.stagger=0;this.start(this.durations[WOLF_V02_AIR_REACTION]?WOLF_V02_AIR_REACTION:WOLF_V02_DEATH,'down');this.behavior='down';this.nonlethalDownHold=.30;this.retreatPending=null;this.retreatCooldown=8;return true;
  }
  if(options.stun>0||options.interruptsBoss){
   this.cancelBout();this.stagger=0;this.start(this.reactionClip(options.heavy),'hit');this.behavior=options.heavy?'brace':'hit';this.reactionPlaybackRate=options.heavy?1:1.6;this.reactionRetreated=!!options.heavy;
   if(options.heavy){this.retreatPending=null;this.retreatCooldown=8;}else this.requestRetreat('hit');
  }else if((options.damage??14)>=14)this.requestRetreat('hit');
  return true;
 }
 parry(){
  if(this.hp<=0||['down','recover'].includes(this.mode))return false;
  this.cancelBout();this.stagger=0;this.start(WOLF_CLIPS.hit,'hit');this.behavior='hit';this.reactionPlaybackRate=1.6;this.reactionRetreated=false;this.flash=this.flashDuration=.45;this.lastOutcome='blocked';this.requestRetreat('blocked');return true;
 }
 chooseAction(distance){
  if(this.attackSettings?.custom){
   const requested=this.attackSettings.sequence[(this.customAttackIndex??0)%this.attackSettings.sequence.length];
   if(requested==='lunge'&&distance>=2.85||distance+1e-5>=WOLF_V02_BY_ID[requested].minDistance||!['lunge','pin'].includes(requested))return requested;
   // A custom order may request a long attack at point-blank range. Keep the
   // saved order intact, but substitute a reachable attack for this turn.
  }
  if(distance>=6||distance>=2.85&&this.planIndex%3===0)return 'lunge';
  if(distance+1e-5>=WOLF_V02_BY_ID.pin.minDistance&&this.previousAction!=='pin')return 'pin';
  const deck=this.phase===2?deck2:deck1;return deck[this.planIndex%deck.length];
 }
 followupInReach(id,distance){return distance<=WOLF_V02_BY_ID[id].maxDistance+1e-5;}
 chooseFollowup(distance){
  if(this.lastOutcome!=='hit'||this.boutStrikes>=3)return null;
  // Explicit editor sequences keep their order. An explicitly chosen chain
  // retains its two bites even in phase 1; default phase 1 never selects it.
  if(this.chainRemaining&&this.followupInReach('chain-bite',distance))return 'chain-bite';
  if(this.attackSettings?.custom||this.phase!==2)return null;
  const next=['quick-bite','chain-bite'].includes(this.action.id)?'paw-swipe':this.action.id==='paw-swipe'?'chain-bite':'quick-bite';
  return this.followupInReach(next,distance)?next:null;
 }
 beginStalk({preserveBudget=false}={}){
  if(!preserveBudget)this.stalkPlannedId=this.chooseAction(this.lastDistance);
  if(!preserveBudget){this.ramApproachVariant=this.stalkPlannedId==='lunge'?(this.planIndex%2?'run-evade-ram':'run-ram'):null;this.ramEvaded=false;}
  this.followupId=null;this.followChain=false;this.boutStrikes=0;this.plannedId=null;this.flankSide*=-1;this.suppressStalkStep=false;this.stalkBlocked=false;this.flankReversed=false;
  this.start(this.flankSide>0?WOLF_V02_ORBIT.right:WOLF_V02_ORBIT.left,'idle');this.behavior='flank';
  if(!preserveBudget||this.circleElapsed>=this.circleTarget){const sample=Number(this.random());this.circleTarget=2+clamp(Number.isFinite(sample)?sample:.5,0,1);this.circleElapsed=0;}
  this.flankRemaining=Math.max(0,this.circleTarget-this.circleElapsed);this.flankBlockedObserve=false;this.flankRetry=0;
  this.orbitTargetRadius=this.stalkPlannedId==='lunge'&&this.lastDistance>=2.85&&this.lastDistance<4?Math.min(4,this.lastDistance+1):null;
  const cycles=this.phase===2?4:3;this.flankPlaybackRate=cycles*.90/Math.max(.01,this.circleTarget);
 }
 beginRetreat(){
  this.cancelBout();this.retreatReason=this.retreatPending;this.retreatPending=null;this.retreatCooldown=8;this.start(this.reactionClip(true),'retreat');this.behavior='retreat';
 }
 beginRecovery(){
  const action=this.action,outcome=this.lastOutcome??'miss';this.previousAction=action.id;this.previousOutcome=outcome;
  if(outcome==='miss')this.requestRetreat('miss');
  this.followupId=this.retreatPending&&this.retreatCooldown<=0?null:this.chooseFollowup(this.lastDistance);this.followChain=this.followupId==='chain-bite';
  this.recoveryFull=action.recovery+(outcome==='miss'?(action.id==='lunge'?.5:.18):0);this.recoveryElapsed=0;
  this.chainRemaining=0;this.start(WOLF_CLIPS.watch,'idle');this.behavior='recovery';
  // A telegraphed attack always has a punishable ending, even when its custom
  // attack-speed setting is 2x. A missed leap leaves the longest opening.
  this.recoveryRemaining=this.followupId?(this.followChain?.30:.42):this.recoveryFull;
 }
 updateMomentumRam(dt){
  const action=this.action;this.ramStageClock+=dt;this.ramLayerElapsed=Math.min(actionDuration(action),this.ramLayerElapsed+dt*this.castSpeed);this.ramLayerTime=sampleWhipTime(action,this.ramLayerElapsed);this.actionElapsed=this.ramLayerElapsed;
  if(this.ramStage==='charge'&&this.ramAccepted){this.ramStage='chase';this.ramStageClock=0;this.ramChaseClock=this.combatClock;}
  if(this.ramStage==='charge'&&this.ramLayerTime>=.60&&!this.ramAccepted)this.abortRam('ram-miss');
  if(this.ramStage==='charge'){this.ramContactTime=this.ramLayerTime;this.behavior='running-ram';}
  else if(this.ramStage==='chase'){
   this.ramContactTime=.421;this.behavior='run-chase';
   const desired=Math.max(0,Math.min(this.approachSpeed??WOLF_V02_GAIT.farRunSpeed,this.ramChaseSpeed??WOLF_V02_GAIT.runSpeed)),change=24*dt;
   this.ramRunSpeed+=clamp(desired-this.ramRunSpeed,-change,change);
   if(this.ramCatchReady){this.ramStage='settle';this.ramStageClock=0;this.state=action.maulSourceClip;this.time=action.maulClipStart;this.ramBodyOrigin=action.maulClipStart;this.ramRunSpeed=0;return {events:[],speed:0};}
   if(this.combatClock-this.ramAcceptedClock>1.55)this.abortRam('chase-unreachable');
  }else if(this.ramStage==='settle'){
   this.behavior='settle-prone';this.ramContactTime=this.time;this.time=action.maulClipStart;
   if(this.ramStageClock>=.20&&this.ramVictimProne){this.ramStage='maul';this.ramStageClock=0;}
   else if(this.combatClock-this.ramAcceptedClock>1.6)this.abortRam('victim-not-prone-in-time');
   return {events:[],speed:0};
  }else if(this.ramStage==='maul'){
   this.behavior='maul';this.time=Math.min(action.maulClipEnd,this.time+dt);this.ramContactTime=this.time;
   if(this.time>=action.maulClipEnd)this.beginRecovery();return {events:[],speed:0};
  }
  if(this.ramStage==='miss-brake'){
   this.behavior='ram-miss';this.ramContactTime=.61;this.ramRunSpeed=Math.max(0,this.ramRunSpeed-24*dt);
   if(this.state!==WOLF_CLIPS.run||this.ramRunSpeed<=.05){this.beginRecovery();return {events:[],speed:0};}
  }
  this.ramRunClock+=dt*this.ramRunSpeed/(WOLF_V02_GAIT.runSourceSpeed*WOLF_SCALE);this.time=WOLF_V02_GAIT.runSourceStart+this.ramRunClock%WOLF_V02_GAIT.runSourceDuration;
  return {events:[],speed:this.ramRunSpeed,momentumRam:true};
 }
 update(dt,distance,playerAlive=true){
  dt=Number.isFinite(dt)?Math.max(0,dt):0;distance=Number.isFinite(distance)?Math.max(0,distance):Infinity;this.lastDistance=distance;this.phase=this.hp<=this.maxHp*.5?2:1;
  const events=[];this.combatClock+=dt;this.flash=Math.max(0,this.flash-dt);this.retreatCooldown=Math.max(0,this.retreatCooldown-dt);this.tacticalCooldown=Math.max(0,this.tacticalCooldown-dt);this.evadeCooldown=Math.max(0,this.evadeCooldown-dt);
  if(this.hp<this.maxHp*WOLF_V02_TACTICS.healthyHpFraction&&(this.recentDamage||this.tacticalRetreatPending)){this.recentDamageValues.fill(0);this.recentDamage=0;this.tacticalRetreatPending=false;}
  if(this.stagger>0&&this.hp>0){this.stagger=Math.max(0,this.stagger-dt);this.behavior='stagger';if(!this.stagger){this.start(WOLF_CLIPS.brace,'hit');this.wait=this.balance.cooldown;}return {events,speed:0};}
  if(['down','recover'].includes(this.mode)){
   const duration=this.durations[this.state]??1,finished=this.time>=duration;this.time=Math.min(duration,this.time+dt);this.behavior=this.hp<=0?'dead':this.mode;
   if(this.time>=duration&&this.hp>0){
    if(this.mode==='down'){if(finished)this.nonlethalDownHold=Math.max(0,(this.nonlethalDownHold??0)-dt);if(!this.nonlethalDownHold)this.start(this.durations[WOLF_V02_GET_UP]?WOLF_V02_GET_UP:WOLF_CLIPS.recover,'recover');}
    else this.beginStalk();
   }
   return {events,speed:0};
  }
  if(!playerAlive){
   this.chainRemaining=0;this.followChain=false;this.followupId=null;this.boutStrikes=0;this.plannedId=null;
   if(this.mode==='attack')this.start(WOLF_CLIPS.watch,'idle');
   this.behavior='observe';if(this.state===WOLF_CLIPS.watch)this.time=0;return {events,speed:0};
  }
  if(this.tacticalRetreatPending&&this.mode!=='backRun'&&this.hp>=this.maxHp*.5){this.beginTacticalRetreat();return {events,speed:0};}
  if(this.playerAttackThreat&&this.playerThreatActionId!==this.lastEvadedActionId&&distance<4.5&&!this.evadeCooldown&&!this.sightBlocked&&(this.mode==='backRun'||['observe','flank','position'].includes(this.behavior))){this.beginRamEvade(true);return {events,speed:0};}
  if(this.mode==='backRun'){
   if(this.backRunDone||this.backRunBlocked){this.backRunDone=this.backRunBlocked=false;this.beginStalk();return {events,speed:0};}
   const duration=this.durations[this.state]??.6,previousCycles=Math.floor(this.backRunElapsed/duration);this.backRunElapsed+=dt;this.backRunCycles=Math.floor(this.backRunElapsed/duration);this.time=this.backRunElapsed%duration;
   if(this.backRunCycles>previousCycles&&(distance>=this.backRunTarget||this.backRunCycles>=3))this.backRunDone=true;
   return {events,speed:0,backward:true};
  }
  if(this.mode==='ramEvade'){
   const duration=this.durations[this.state]??.9;
   if(this.stalkBlocked&&!this.flankReversed){this.flankSide*=-1;this.start(this.flankSide>0?WOLF_V02_ORBIT.right:WOLF_V02_ORBIT.left,'ramEvade');this.flankReversed=true;this.stalkBlocked=false;}
   if(this.stalkBlocked||this.time>=duration){this.boutObserved=true;this.plannedId=this.stalkPlannedId=this.evadeCounterId;this.start(WOLF_CLIPS.watch,'idle');this.behavior='position';return {events,speed:0};}
   this.time=Math.min(duration,this.time+dt*WOLF_V02_TACTICS.evadePlaybackRate);return {events,speed:0,flank:{authored:true,facePlayer:true,side:this.flankSide,radius:distance}};
  }
  if(this.mode==='retreat'){
   const duration=this.durations[this.state]??.9;
   if(this.time>=duration)this.beginStalk();else this.time=Math.min(duration,this.time+dt);
   return {events,speed:0,backward:true};
  }
  if(this.mode==='hit'){
   const duration=this.durations[this.state]??1;
   if(this.time>=duration){
    if(this.retreatPending&&this.retreatCooldown<=0)this.beginRetreat();else this.beginStalk();
   }else this.time=Math.min(duration,this.time+dt*(this.reactionPlaybackRate??1.6));
   return {events,speed:0};
  }
  if(this.mode==='ramRecover'){
   if(this.time>=this.ramRecoveryEnd)this.beginRecovery();else this.time=Math.min(this.ramRecoveryEnd,this.time+dt);
   return {events,speed:0};
  }
  if(this.mode==='attack'&&this.action){
   const action=this.action;
   if(action.momentumRam)return this.updateMomentumRam(dt);
   if(action.ramPhases&&this.ramAbortReason&&(this.ramAccepted||this.time>=action.contactEnd)){this.beginRamRecovery();return {events,speed:0};}
   if(action.ramPhases&&this.ramAccepted){
    const age=this.combatClock-this.ramAcceptedClock,chase=WOLF_V02_RAM_CHASE;
    if(this.ramChaseClock===null){
     this.time=Math.max(this.time,Math.min(chase.source[0],this.ramAcceptedSource+(chase.source[0]-this.ramAcceptedSource)*Math.min(1,age/.5)));
     this.behavior='wait-for-fall';
     if(age>=chase.earliestProne&&this.ramVictimProne){this.ramChaseClock=this.combatClock;this.time=Math.max(this.time,chase.source[0]);}
     else if(age>=chase.latestProne)this.abortRam('victim-not-prone-in-time');
    }else{
     const elapsed=Math.max(0,this.combatClock-this.ramChaseClock),times=chase.seconds;let i=0;while(i<times.length-2&&elapsed>times[i+1])i++;
     this.time=Math.max(this.time,chase.source[i]+(chase.source[i+1]-chase.source[i])*clamp((elapsed-times[i])/(times[i+1]-times[i]),0,1));this.behavior=elapsed<times[1]?'chase-prone':'maul';
     if(elapsed>=times.at(-1))this.beginRecovery();
    }
    this.actionElapsed=whipElapsedAt(action,this.time);return {events,speed:0};
   }
   const previous=this.time,next=Math.min(actionDuration(action),advanceWolfActionElapsed(action,this.actionElapsed,dt,this.castSpeed));let source=sampleWhipTime(action,next);
   if(!this.impacted&&previous<=action.impact&&source>=action.impact){
    source=action.impact;this.actionElapsed=whipElapsedAt(action,source);this.impacted=true;
    events.push({type:'attack',name:action.sourceClip,actionId:action.id,range:action.range,kind:'melee',damage:action.damage,capture:action.capture});
   }else if(action.capture&&!this.pinImpactPassed&&previous<1.85&&source>=1.85){source=1.85;this.actionElapsed=whipElapsedAt(action,source);this.pinImpactPassed=true;}
   else this.actionElapsed=next;
   this.time=source;this.behavior=source<action.commitTime?'anticipation':source<=action.impact?'strike':'followthrough';
   if(this.actionElapsed>=actionDuration(action)&&!events.length)this.beginRecovery();
   return {events,speed:0};
  }
  if(['alert','rise'].includes(this.mode)){
   this.time=Math.min(this.durations[this.state]??1,this.time+dt);this.behavior=this.mode;
   if(this.time>=(this.durations[this.state]??1)){if(this.mode==='alert')this.start(WOLF_CLIPS.rise,'rise');else{this.start(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.observation=.45;}}
   return {events,speed:0};
  }
  if(distance>this.balance.detectRange){this.startIfChanged(WOLF_CLIPS.rest,'idle');this.behavior='rest';this.plannedId=null;this.time=(this.time+dt)%(this.durations[this.state]??1);return {events,speed:0};}
  if(this.state===WOLF_CLIPS.rest){this.start(WOLF_CLIPS.alert,'alert');this.behavior='alert';return {events,speed:0};}
  if(this.behavior==='recovery'){
   this.time=0;this.recoveryElapsed+=dt;this.recoveryRemaining=Math.max(0,this.recoveryRemaining-dt);
   if(!this.recoveryRemaining){
    const follow=this.followupId;this.followupId=null;this.followChain=false;
    if(follow&&this.followupInReach(follow,distance)){this.startAction(follow,{continuation:true,distance});}
    else if(follow&&this.recoveryElapsed<this.recoveryFull)this.recoveryRemaining=this.recoveryFull-this.recoveryElapsed;
    else if(this.retreatPending&&this.retreatCooldown<=0)this.beginRetreat();else this.beginStalk();
   }
   return {events,speed:0};
  }
  if(this.behavior==='observe'||!['flank','position'].includes(this.behavior)){
   this.startIfChanged(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.time=0;this.observation-=dt;
   if(this.observation<=0)this.beginStalk();
   return {events,speed:0};
  }
  if(this.behavior==='flank'&&this.flankRemaining<=0){this.boutObserved=true;this.behavior='position';this.positionElapsed=0;this.plannedId=this.stalkPlannedId??this.chooseAction(distance);}
  if(this.behavior==='flank'){
   const advance=Math.min(dt,this.flankRemaining);this.circleElapsed+=advance;this.flankRemaining=Math.max(0,this.flankRemaining-advance);
   if(this.flankBlockedObserve){
    this.time=0;this.flankRetry=Math.max(0,this.flankRetry-dt);
    if(!this.flankRetry){this.flankSide*=-1;this.start(this.flankSide>0?WOLF_V02_ORBIT.right:WOLF_V02_ORBIT.left,'idle');this.flankBlockedObserve=false;this.flankReversed=false;this.stalkBlocked=false;}
    else return {events,speed:0};
   }
   if(this.stalkBlocked&&!this.flankReversed){
    this.flankSide*=-1;this.start(this.flankSide>0?WOLF_V02_ORBIT.right:WOLF_V02_ORBIT.left,'idle');this.flankReversed=true;this.stalkBlocked=false;
   }else if(this.stalkBlocked){this.start(WOLF_CLIPS.watch,'idle');this.flankBlockedObserve=true;this.flankRetry=.35;this.stalkBlocked=false;return {events,speed:0};}
   if(this.suppressStalkStep){this.start(WOLF_CLIPS.watch,'idle');this.flankBlockedObserve=true;this.flankRetry=.35;return {events,speed:0};}
   else{
    const duration=this.durations[this.state]??.9;this.time=(this.time+advance*this.flankPlaybackRate)%duration;
    return {events,speed:0,flank:{authored:true,facePlayer:true,side:this.flankSide,radius:distance}};
   }
  }
  if(!this.boutObserved){this.beginStalk();return {events,speed:0};}
  this.plannedId??=this.stalkPlannedId??this.chooseAction(distance);this.positionElapsed+=dt;
  if(this.plannedId==='lunge'&&this.ramApproachVariant==='run-evade-ram'&&!this.ramEvaded&&distance<=5&&!this.sightBlocked){this.beginRamEvade();return {events,speed:0};}
  const chosen=WOLF_V02_BY_ID[this.plannedId],ramEntry=chosen.momentumRam?(this.ramReach??2.5)+(this.approachSpeed??WOLF_V02_GAIT.runSpeed)*whipElapsedAt(chosen,chosen.contactStart)/(this.attackSettings?.speed??1)+.10:chosen.maxDistance,approach=distance>ramEntry+1e-5||this.sightBlocked;
  if(approach){
   const changed=this.state!==WOLF_CLIPS.run||this.mode!=='move';this.startIfChanged(WOLF_CLIPS.run,'move');
   // The glTF adds a duplicate first-frame hold. Only 0.2 skips that hold,
   // looping the preserved gallop keys from frame 1 through frame 18.
   const desired=distance>12?WOLF_V02_GAIT.farRunSpeed:WOLF_V02_GAIT.runSpeed,previous=changed?WOLF_V02_GAIT.runSpeed:this.approachSpeed??WOLF_V02_GAIT.runSpeed,change=WOLF_V02_GAIT.runAcceleration*dt;
   this.approachSpeed=previous+clamp(desired-previous,-change,change);this.approachPlaybackRate=this.approachSpeed/(WOLF_V02_GAIT.runSourceSpeed*WOLF_SCALE);
   this.gaitClock=(changed?0:this.gaitClock??Math.max(0,this.time-WOLF_V02_GAIT.runSourceStart))+dt*this.approachPlaybackRate;
   this.time=WOLF_V02_GAIT.runSourceStart+this.gaitClock%WOLF_V02_GAIT.runSourceDuration;
   return {events,speed:this.approachSpeed,retreat:false,stopDistance:this.sightBlocked||chosen.momentumRam?0:chosen.preferredDistance};
  }
  this.planIndex++;if(this.attackSettings?.custom)this.customAttackIndex=(this.customAttackIndex??0)+1;this.startAction(chosen.id,{distance});
  if(chosen.momentumRam)return this.updateMomentumRam(dt);
  return {events,speed:0};
 }
 get label(){return this.hp<=0?'격파':this.stagger?'경직':this.behavior==='recovery'?'빈틈 · 반격 기회':this.action?.label??({flank:'측면 압박',position:'거리 조절',observe:'경계'}[this.behavior]??super.label);}
}
