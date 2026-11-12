import {WolfBrain,WOLF_CLIPS,WOLF_BALANCE} from './wolf-spec.js';
export const WOLF_V02_KNOCKBACK_SCALE=.8;

// The short snap and braced forward pressure are authored R9 actions on R8's
// unchanged rig. The full lunge and pin retain their approved source clips.
export const WOLF_V02_SNAP='Wolf_Snap_Bite_V02',WOLF_V02_SWIPE='Wolf_Forepaw_Swipe_V02';
const quick={sourceClip:WOLF_V02_SNAP,clipStart:0,clipEnd:.90,impact:.40,commitTime:.30,capture:false,damage:55,range:3.2,minDistance:2.0,maxDistance:2.3,preferredDistance:2.15,recovery:.85,contactParts:['jaw','head'],whip:{source:[0,.30,.48,.90],seconds:[0,.38,.45,.90]}};
export const WOLF_V02_ACTIONS=Object.freeze([
 {id:'quick-bite',label:'짧은 입질',...quick},
 {id:'chain-bite',label:'연속 입질',...quick,damage:45,recovery:1.05,chain:true},
 {id:'paw-swipe',label:'몸 낮춰 압박',sourceClip:WOLF_V02_SWIPE,clipStart:0,clipEnd:1,impact:.43,commitTime:.32,capture:false,damage:65,range:3.2,minDistance:2.2,maxDistance:2.70,preferredDistance:2.4,recovery:.95,contactParts:['fore.L.paw'],whip:{source:[0,.32,.50,1],seconds:[0,.43,.51,1]}},
 {id:'lunge',label:'측면 회피·도약 덮치기',sourceClip:WOLF_CLIPS.lunge,clipStart:0,clipEnd:3.1,impact:2.35,commitTime:1.65,capture:false,damage:100,range:4,minDistance:24.7,maxDistance:25.8,preferredDistance:25.4,recovery:1.35,whip:{source:[0,1.65,2.55,3.1],seconds:[0,1.90,2.10,3.1]}},
 {id:'pin',label:'앞발 제압·물기',sourceClip:WOLF_CLIPS.pin,clipStart:0,clipEnd:3.4,impact:1.20,commitTime:.85,capture:true,damage:120,range:3.2,minDistance:8.7,maxDistance:9.5,preferredDistance:9.1,recovery:1.2,whip:{source:[0,.85,1.20,1.85,3.4],seconds:[0,.90,1.04,1.68,3.4]}},
].map(a=>Object.freeze({...a,contactStart:a.capture?a.impact:a.impact-.05,contactEnd:a.impact+.12,contactParts:a.contactParts?Object.freeze(a.contactParts):undefined,whip:Object.freeze({source:Object.freeze(a.whip.source),seconds:Object.freeze(a.whip.seconds)})})));
export const WOLF_V02_BY_ID=Object.freeze(Object.fromEntries(WOLF_V02_ACTIONS.map(a=>[a.id,a])));
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

export class WolfV02Brain extends WolfBrain{
 constructor(durations,balance=WOLF_BALANCE){
  super(durations,balance);this.behavior='rest';this.phase=1;this.planIndex=0;this.flankSide=1;this.lastOutcome=null;this.recoveryRemaining=0;this.observation=.55;this.positionElapsed=0;this.boutStrikes=0;this.lastDistance=Infinity;
 }
 configureAttacks(value={}){
  const sequence=(Array.isArray(value.sequence)?value.sequence:[]).map(id=>aliases[id]??id).filter(id=>WOLF_V02_BY_ID[id]).slice(0,12),custom=value.custom===true&&sequence.length>0,speed=Number(value.speed),old=this.attackSettings;
  if(old?.custom!==custom||old?.sequence.join('|')!==sequence.join('|')){this.customAttackIndex=0;this.plannedId=null;}
  this.attackSettings={custom,sequence,speed:Number.isFinite(speed)?clamp(speed,.5,2):1};
 }
 start(state,mode){
  super.start(state,mode);
  if(mode!=='attack'){this.action=null;this.actionId=null;}
 }
 startAction(id,{continuation=false}={}){
  const action=WOLF_V02_BY_ID[aliases[id]??id];if(!action)throw new Error('알 수 없는 늑대 공격: '+id);
  this.start(action.sourceClip,'attack');this.action=action;this.actionId=action.id;this.time=action.clipStart;this.actionElapsed=0;this.behavior='anticipation';this.attackCount++;this.lastOutcome=null;this.resolvedSerial=null;this.pinImpactPassed=false;
  this.boutStrikes=continuation?this.boutStrikes+1:1;
  this.chainRemaining=action.chain&&this.boutStrikes<3&&!continuation?1:0;this.plannedId=null;this.positionElapsed=0;this.followupId=null;this.followChain=false;
  return action;
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
 hit(options={}){
  const accepted=super.hit(options);
  if(accepted&&(this.stagger||this.mode!=='attack')){this.chainRemaining=0;this.followupId=null;this.followChain=false;this.boutStrikes=0;this.plannedId=null;this.behavior=this.hp<=0?'dead':this.mode;}
  return accepted;
 }
 parry(){const result=super.parry();if(result){this.chainRemaining=0;this.followupId=null;this.followChain=false;this.boutStrikes=0;this.plannedId=null;this.behavior='stagger';}return result;}
 chooseAction(distance){
  if(this.attackSettings?.custom){
   const requested=this.attackSettings.sequence[(this.customAttackIndex??0)%this.attackSettings.sequence.length];
   if(distance>=WOLF_V02_BY_ID[requested].minDistance||!['lunge','pin'].includes(requested))return requested;
   // A custom order may request a long attack at point-blank range. Keep the
   // saved order intact, but substitute a reachable attack for this turn.
  }
  if(distance>=WOLF_V02_BY_ID.lunge.minDistance)return 'lunge';
  if(distance>=WOLF_V02_BY_ID.pin.minDistance&&this.previousAction!=='pin')return 'pin';
  const deck=this.phase===2?deck2:deck1;return deck[this.planIndex%deck.length];
 }
 followupInReach(id,distance){return distance<=WOLF_V02_BY_ID[id].maxDistance;}
 chooseFollowup(distance){
  if(this.lastOutcome!=='hit'||this.boutStrikes>=3)return null;
  // Explicit editor sequences keep their order. An explicitly chosen chain
  // retains its two bites even in phase 1; default phase 1 never selects it.
  if(this.chainRemaining&&this.followupInReach('chain-bite',distance))return 'chain-bite';
  if(this.attackSettings?.custom||this.phase!==2)return null;
  const next=['quick-bite','chain-bite'].includes(this.action.id)?'paw-swipe':this.action.id==='paw-swipe'?'chain-bite':'quick-bite';
  return this.followupInReach(next,distance)?next:null;
 }
 beginStalk(){
  this.followupId=null;this.followChain=false;this.boutStrikes=0;this.plannedId=null;this.flankSide*=-1;this.suppressStalkStep=false;
  this.start(WOLF_CLIPS.watch,'idle');this.behavior='flank';
  this.flankRemaining=this.phase===2?.55:1.35+(this.planIndex%3)*.15;
 }
 beginRecovery(){
  const action=this.action,outcome=this.lastOutcome??'miss';this.previousAction=action.id;this.previousOutcome=outcome;
  this.followupId=this.chooseFollowup(this.lastDistance);this.followChain=this.followupId==='chain-bite';
  this.recoveryFull=action.recovery+(outcome==='miss'?(action.id==='lunge'?.5:.18):0);this.recoveryElapsed=0;
  this.chainRemaining=0;this.start(WOLF_CLIPS.watch,'idle');this.behavior='recovery';
  // A telegraphed attack always has a punishable ending, even when its custom
  // attack-speed setting is 2x. A missed leap leaves the longest opening.
  this.recoveryRemaining=this.followupId?(this.followChain?.30:.42):this.recoveryFull;
 }
 update(dt,distance,playerAlive=true){
  dt=Number.isFinite(dt)?Math.max(0,dt):0;distance=Number.isFinite(distance)?Math.max(0,distance):Infinity;this.lastDistance=distance;this.phase=this.hp<=this.maxHp*.5?2:1;
  const events=[];this.flash=Math.max(0,this.flash-dt);
  if(this.stagger>0&&this.hp>0){this.stagger=Math.max(0,this.stagger-dt);this.behavior='stagger';if(!this.stagger){this.start(WOLF_CLIPS.brace,'hit');this.wait=this.balance.cooldown;}return {events,speed:0};}
  if(['down','recover'].includes(this.mode)){
   this.time=Math.min(this.durations[this.state]??1,this.time+dt);this.behavior=this.hp<=0?'dead':this.mode;
   if(this.time>=(this.durations[this.state]??1)&&this.hp>0){if(this.mode==='down')this.start(WOLF_CLIPS.recover,'recover');else{this.start(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.observation=.65;}}
   return {events,speed:0};
  }
  if(!playerAlive){
   this.chainRemaining=0;this.followChain=false;this.followupId=null;this.boutStrikes=0;this.plannedId=null;
   if(this.mode==='attack')this.start(WOLF_CLIPS.watch,'idle');
   this.behavior='observe';if(this.state===WOLF_CLIPS.watch)this.time=0;return {events,speed:0};
  }
  if(this.mode==='attack'&&this.action){
   const action=this.action,previous=this.time,next=Math.min(actionDuration(action),this.actionElapsed+dt*this.castSpeed);let source=sampleWhipTime(action,next);
   if(!this.impacted&&previous<=action.impact&&source>=action.impact){
    source=action.impact;this.actionElapsed=whipElapsedAt(action,source);this.impacted=true;
    events.push({type:'attack',name:action.sourceClip,actionId:action.id,range:action.range,kind:'melee',damage:action.damage,capture:action.capture});
   }else if(action.capture&&!this.pinImpactPassed&&previous<1.85&&source>=1.85){source=1.85;this.actionElapsed=whipElapsedAt(action,source);this.pinImpactPassed=true;}
   else this.actionElapsed=next;
   this.time=source;this.behavior=source<action.commitTime?'anticipation':source<=action.impact?'strike':'followthrough';
   if(this.actionElapsed>=actionDuration(action)&&!events.length)this.beginRecovery();
   return {events,speed:0};
  }
  if(['alert','rise','hit'].includes(this.mode)){
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
    if(follow&&this.followupInReach(follow,distance)){this.startAction(follow,{continuation:true});}
    else if(follow&&this.recoveryElapsed<this.recoveryFull)this.recoveryRemaining=this.recoveryFull-this.recoveryElapsed;
    else this.beginStalk();
   }
   return {events,speed:0};
  }
  if(this.behavior==='observe'||!['flank','position'].includes(this.behavior)){
   this.startIfChanged(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.time=0;this.observation-=dt;
   if(this.observation<=0)this.beginStalk();
   return {events,speed:0};
  }
  if(this.behavior==='flank'){
   // Use the authored circling gait/root together. Moving a forward-running
   // clip sideways while fixing its chest towards the player would slide feet.
   this.time=(this.time+(this.suppressStalkStep?0:dt))%(this.durations[this.state]??1);this.flankRemaining-=dt;
   if(this.suppressStalkStep||this.flankRemaining<=0){this.behavior='position';this.positionElapsed=0;this.plannedId=this.chooseAction(distance);}
   return {events,speed:0,flank:{authored:true,facePlayer:true,side:this.flankSide,radius:distance,angle:.4}};
  }
  this.plannedId=this.chooseAction(distance);this.positionElapsed+=dt;
  const chosen=WOLF_V02_BY_ID[this.plannedId],approach=distance>chosen.maxDistance;
  if(approach){
   const difference=distance-chosen.preferredDistance,fast=difference>2;
   this.startIfChanged(fast?WOLF_CLIPS.run:WOLF_CLIPS.walk,'move');this.time=(this.time+dt*this.balance.locomotionPlaybackRate)%(this.durations[this.state]??1);
   return {events,speed:fast?this.balance.runSpeed:this.balance.walkSpeed,retreat:false,stopDistance:chosen.preferredDistance};
  }
  this.planIndex++;if(this.attackSettings?.custom)this.customAttackIndex=(this.customAttackIndex??0)+1;this.startAction(chosen.id);
  return {events,speed:0};
 }
 get label(){return this.hp<=0?'격파':this.stagger?'경직':this.behavior==='recovery'?'빈틈 · 반격 기회':this.action?.label??({flank:'측면 압박',position:'거리 조절',observe:'경계'}[this.behavior]??super.label);}
}
