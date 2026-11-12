import {WolfBrain,WOLF_CLIPS,WOLF_BALANCE} from './wolf-spec.js';

// These are runtime excerpts/time remaps of approved R8 channels. No new rig,
// bone scale, vertex data, texture or animation channel is authored here.
const quick={sourceClip:WOLF_CLIPS.pin,clipStart:1.10,clipEnd:2.05,impact:1.55,commitTime:1.45,capture:false,damage:55,range:3.2,minDistance:2.2,maxDistance:2.8,preferredDistance:2.4,recovery:.85,whip:{source:[1.10,1.45,1.78,2.05],seconds:[0,.45,.57,.85]}};
export const WOLF_V02_ACTIONS=Object.freeze([
 {id:'quick-bite',label:'견제 물기',...quick},
 {id:'chain-bite',label:'두 번 압박 물기',...quick,damage:45,recovery:1.05,chain:true},
 {id:'lunge',label:'측면 회피·도약 덮치기',sourceClip:WOLF_CLIPS.lunge,clipStart:0,clipEnd:3.1,impact:2.35,commitTime:1.65,capture:false,damage:100,range:4,minDistance:24.7,maxDistance:26.2,preferredDistance:25.4,recovery:1.35,whip:{source:[0,1.65,2.55,3.1],seconds:[0,1.85,2.16,3.1]}},
 {id:'pin',label:'앞발 제압·물기',sourceClip:WOLF_CLIPS.pin,clipStart:0,clipEnd:3.4,impact:1.20,commitTime:.85,capture:true,damage:120,range:3.2,minDistance:8.7,maxDistance:9.5,preferredDistance:9.1,recovery:1.2,whip:{source:[0,.85,1.20,1.85,3.4],seconds:[0,.8,.98,1.85,3.4]}},
].map(a=>Object.freeze({...a,whip:Object.freeze({source:Object.freeze(a.whip.source),seconds:Object.freeze(a.whip.seconds)})})));
export const WOLF_V02_BY_ID=Object.freeze(Object.fromEntries(WOLF_V02_ACTIONS.map(a=>[a.id,a])));
const aliases={[WOLF_CLIPS.lunge]:'lunge',[WOLF_CLIPS.pin]:'pin'};
const deck1=['quick-bite','pin','quick-bite','chain-bite'],deck2=['chain-bite','pin','quick-bite','chain-bite','pin'];
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
  super(durations,balance);this.behavior='rest';this.phase=1;this.planIndex=0;this.flankSide=1;this.lastOutcome=null;this.recoveryRemaining=0;this.observation=.55;this.positionElapsed=0;
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
  this.chainRemaining=action.chain&&!continuation?1:0;this.plannedId=null;this.positionElapsed=0;
  return action;
 }
 noteAttackResult({serial=this.serial,hit=false,blocked=false,captured=false}={}){
  if(serial!==this.serial||this.resolvedSerial===serial||!this.action)return false;
  this.resolvedSerial=serial;this.lastOutcome=captured?'captured':hit?'hit':blocked?'blocked':'miss';
  if(blocked)this.chainRemaining=0;
  return true;
 }
 hit(options={}){
  const accepted=super.hit(options);
  if(accepted&&(this.stagger||this.mode!=='attack')){this.chainRemaining=0;this.plannedId=null;this.behavior=this.hp<=0?'dead':this.mode;}
  return accepted;
 }
 parry(){const result=super.parry();if(result){this.chainRemaining=0;this.plannedId=null;this.behavior='stagger';}return result;}
 chooseAction(distance){
  if(this.attackSettings?.custom)return this.attackSettings.sequence[(this.customAttackIndex??0)%this.attackSettings.sequence.length];
  if(distance>=20)return 'lunge';
  if(distance>=6&&distance<=16&&this.previousAction!=='pin')return 'pin';
  const deck=this.phase===2?deck2:deck1;return deck[this.planIndex%deck.length];
 }
 beginRecovery(){
  const action=this.action,outcome=this.lastOutcome??'miss';this.previousAction=action.id;this.previousOutcome=outcome;
  this.followChain=this.chainRemaining>0&&outcome!=='blocked';
  this.chainRemaining=0;this.start(WOLF_CLIPS.watch,'idle');this.behavior='recovery';
  // A telegraphed attack always has a punishable ending, even when its custom
  // attack-speed setting is 2x. A missed leap leaves the longest opening.
  this.recoveryRemaining=this.followChain?.30:action.recovery+(outcome==='miss'?(action.id==='lunge'?.5:.18):0);
 }
 update(dt,distance,playerAlive=true){
  dt=Number.isFinite(dt)?Math.max(0,dt):0;distance=Number.isFinite(distance)?Math.max(0,distance):Infinity;this.phase=this.hp<=this.maxHp*.5?2:1;
  const events=[];this.flash=Math.max(0,this.flash-dt);
  if(this.stagger>0&&this.hp>0){this.stagger=Math.max(0,this.stagger-dt);this.behavior='stagger';if(!this.stagger){this.start(WOLF_CLIPS.brace,'hit');this.wait=this.balance.cooldown;}return {events,speed:0};}
  if(['down','recover'].includes(this.mode)){
   this.time=Math.min(this.durations[this.state]??1,this.time+dt);this.behavior=this.hp<=0?'dead':this.mode;
   if(this.time>=(this.durations[this.state]??1)&&this.hp>0){if(this.mode==='down')this.start(WOLF_CLIPS.recover,'recover');else{this.start(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.observation=.65;}}
   return {events,speed:0};
  }
  if(!playerAlive){
   this.chainRemaining=0;this.followChain=false;this.plannedId=null;
   if(this.mode==='attack')this.start(WOLF_CLIPS.watch,'idle');
   this.behavior='observe';return {events,speed:0};
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
   this.time=(this.time+dt)%(this.durations[this.state]??1);this.recoveryRemaining=Math.max(0,this.recoveryRemaining-dt);
   if(!this.recoveryRemaining){
    if(this.followChain&&distance<=3.5){this.followChain=false;this.startAction('chain-bite',{continuation:true});}
    else{this.followChain=false;this.behavior='observe';this.observation=this.phase===2?.28:.5;}
   }
   return {events,speed:0};
  }
  if(this.behavior==='observe'||!['flank','position'].includes(this.behavior)){
   this.startIfChanged(WOLF_CLIPS.watch,'idle');this.behavior='observe';this.time=(this.time+dt)%(this.durations[this.state]??1);this.observation-=dt;
   if(this.observation<=0){this.plannedId=this.chooseAction(distance);this.flankSide*=-1;this.behavior='flank';this.flankRemaining=this.phase===2?.5:.75;}
   return {events,speed:0};
  }
  if(this.behavior==='flank'){
   this.startIfChanged(WOLF_CLIPS.run,'move');this.time=(this.time+dt*this.balance.locomotionPlaybackRate)%(this.durations[this.state]??1);this.flankRemaining-=dt;
   if(this.flankRemaining<=0){this.behavior='position';this.positionElapsed=0;}
   return {events,speed:this.balance.runSpeed,flank:{side:this.flankSide,radius:Math.max(3,distance),angle:.5}};
  }
  const action=WOLF_V02_BY_ID[this.plannedId??=this.chooseAction(distance)];this.positionElapsed+=dt;
  if(this.positionElapsed>6&&!this.attackSettings?.custom){this.plannedId=distance<5?'quick-bite':distance<18?'pin':'lunge';this.positionElapsed=0;}
  const chosen=WOLF_V02_BY_ID[this.plannedId],retreat=distance<chosen.minDistance,approach=distance>chosen.maxDistance;
  if(retreat||approach){
   const difference=Math.abs(distance-chosen.preferredDistance),fast=difference>2;
   this.startIfChanged(fast?WOLF_CLIPS.run:WOLF_CLIPS.walk,'move');this.time=(this.time+dt*this.balance.locomotionPlaybackRate)%(this.durations[this.state]??1);
   return {events,speed:fast?this.balance.runSpeed:this.balance.walkSpeed,retreat,retreatDistance:chosen.preferredDistance,stopDistance:chosen.preferredDistance};
  }
  this.planIndex++;if(this.attackSettings?.custom)this.customAttackIndex=(this.customAttackIndex??0)+1;this.startAction(chosen.id);
  return {events,speed:0};
 }
 get label(){return this.hp<=0?'격파':this.stagger?'경직':this.behavior==='recovery'?'빈틈 · 반격 기회':this.action?.label??({flank:'측면 압박',position:'거리 조절',observe:'경계'}[this.behavior]??super.label);}
}
