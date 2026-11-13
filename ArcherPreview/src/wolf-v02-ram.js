import {Vector3} from '@babylonjs/core';
import {segmentDistanceSquared} from './melee-collision.js';
import {playerDimensions} from './player-dimensions.js';
import {WOLF_V02_RAM,WOLF_V02_RAM_PHASES} from './wolf-v02-spec.js';

// Per-actor attack authorization and a bounded actual-pose capsule history.
// The normal standing capsule is never a substitute for a prone victim.
export class WolfRamSequence{
 constructor(encounter){
  this.e=encounter;this.a=new Vector3();this.b=new Vector3();this.previousA=new Vector3();this.previousB=new Vector3();this.aim=new Vector3();
  this.point=[0,0,0];this.capsuleA=[0,0,0];this.capsuleB=[0,0,0];
  this.phases=WOLF_V02_RAM_PHASES.map(config=>({config,key:null,resolved:false,hit:false,damage:0,sourceTime:null,blocked:false,acceptedKnockdown:false}));
  this.reset();
 }
 reset(){
  this.brain=null;this.serial=null;this.active=false;this.current=null;this.authorized=false;this.critical=null;this.cancelReason=null;this.historyValid=false;this.historyKey=null;this.targetPlayer=null;this.patternScene=null;this.patternMap=null;this.sourceHistory=false;this.lastSource=0;
  this.leaseBrain=null;this.leasePlayer=null;this.leaseScene=null;this.leaseMap=null;this.proneValid=false;this.geometryValid=false;
  for(const phase of this.phases){phase.key=null;phase.resolved=phase.hit=phase.blocked=phase.acceptedKnockdown=false;phase.damage=0;phase.sourceTime=null;}
 }
 matches(){const b=this.e.brain;return this.e.active&&!this.e.world.scene?.isDisposed&&this.active&&b===this.brain&&b.serial===this.serial&&b.mode==='attack'&&b.action?.sourceClip===WOLF_V02_RAM&&this.targetPlayer===this.e.player&&this.patternScene===this.e.world.scene&&this.patternMap===this.e.world.mapId;}
 begin(brain,player){
  this.brain=brain;this.serial=brain.serial;this.active=true;this.authorized=false;this.critical=null;this.cancelReason=null;this.historyValid=false;this.historyKey=null;
  this.targetPlayer=player;this.patternScene=this.e.world.scene;this.patternMap=this.e.world.mapId;
  this.sourceHistory=false;this.lastSource=0;
  for(const phase of this.phases){phase.key=`${brain.serial}:${phase.config.id}`;phase.resolved=phase.hit=phase.blocked=phase.acceptedKnockdown=false;phase.damage=0;phase.sourceTime=null;}
 }
 readTarget(player,result){
  this.result=result;this.proneValid=false;this.geometryValid=false;this.targetStanding=!!result&&typeof result.state==='string'&&!result.knockedDown&&!result.captured&&!['knockdown','getUp'].includes(result.state)&&!this.e.combat.grabOwner&&this.e.playerAlive;
  const nodes=this.e.playerNodes,hips=nodes?.['mixamorig:Hips'],chest=nodes?.['mixamorig:Spine2'];
  if(!hips||!chest||hips.isDisposed?.()||chest.isDisposed?.())return;
  this.a.copyFrom(hips.getAbsolutePosition());this.b.copyFrom(chest.getAbsolutePosition());
  this.aim.copyFrom(this.a).addInPlace(this.b).scaleInPlace(.5);this.bodyRadius=playerDimensions(player).moveRadius;
  this.geometryValid=this.a.y-player.position.y<.45&&this.b.y-player.position.y<.45;
  this.proneValid=this.geometryValid&&result?.state==='knockdown'&&result.knockedDown===true&&!result.captured&&!this.e.combat.grabOwner&&this.e.playerAlive;
 }
 prepare(player,result){
  const b=this.e.brain,pattern=b.mode==='attack'&&b.action?.sourceClip===WOLF_V02_RAM;
  this.readTarget(player,result);
  if(this.leaseBrain&&(this.leaseBrain!==b||this.leasePlayer!==player||this.leaseScene!==this.e.world.scene||this.leaseMap!==this.e.world.mapId||b.hp<=0))this.clearLease();
  if(!pattern){this.active=false;this.current=null;this.authorized=false;this.historyValid=false;return null;}
  if(this.brain!==b||this.serial!==b.serial)this.begin(b,player);
  if(this.targetPlayer!==player||this.patternScene!==this.e.world.scene||this.patternMap!==this.e.world.mapId){this.cancel('context-changed');this.active=false;this.current=null;return null;}
  this.active=true;
  this.current=b.time<=this.phases[0].config.contactEnd?this.phases[0]:b.time<=this.phases[1].config.contactEnd?this.phases[1]:b.time<=this.phases[2].config.contactEnd?this.phases[2]:null;
  if(this.sourceHistory&&b.time>=this.lastSource&&b.time-this.lastSource<=.1500001){
   for(const phase of this.phases)if(!phase.resolved&&this.lastSource<=phase.config.contactEnd&&b.time>=phase.config.contactStart){this.current=phase;break;}
  }
  if(b.time>this.phases[0].config.contactEnd&&!this.authorized&&this.current!==this.phases[0])this.cancel('ram-not-confirmed');
  if(this.authorized&&this.current?.config.kind==='maul'&&(result?.state==='getUp'||result?.captured||!this.e.playerAlive||this.e.combat.grabOwner))this.cancel('victim-unavailable');
  return this.current;
 }
 canAttempt(){
  if(!this.matches()||!this.current||this.current.resolved||this.cancelReason)return false;
  return this.current.config.kind==='ram'?this.targetStanding:this.authorized&&this.proneValid;
 }
 cancel(reason){this.cancelReason??=reason;this.authorized=false;this.historyValid=false;this.e.brain.abortRam(reason);}
 clearLease(){this.leaseBrain=null;this.leasePlayer=null;this.leaseScene=null;this.leaseMap=null;}
 hasClearanceLease(){
  const e=this.e;
  if(this.leaseBrain!==e.brain||this.leasePlayer!==e.player||this.leaseScene!==e.world.scene||this.leaseMap!==e.world.mapId||e.brain.hp<=0){this.clearLease();return false;}
  if(e.brain.mode==='attack'&&e.brain.action?.sourceClip!==WOLF_V02_RAM){this.clearLease();return false;}
  const distance=Math.hypot(e.actor.position.x-e.player.position.x,e.actor.position.z-e.player.position.z),normal=e.radius+playerDimensions(e.player).standingClearance;
  if(distance>=normal+1e-5){this.clearLease();return false;}
  return true;
 }
 resolve(phase,{before,after,blocked=false,acceptedKnockdown=false,sourceTime=this.e.brain.time}){
  if(!phase||phase.resolved||!this.active||!phase.key)return;
  phase.resolved=true;phase.hit=after<before;phase.damage=Math.max(0,before-after);phase.blocked=blocked;phase.sourceTime=sourceTime;phase.acceptedKnockdown=acceptedKnockdown===true;
  if(phase.config.kind==='ram'){
   this.authorized=this.matches()&&this.targetStanding&&phase.hit&&!blocked&&phase.acceptedKnockdown&&this.e.playerAlive&&!this.e.combat.grabOwner;
   if(this.authorized){this.e.brain.ramAccepted=true;this.leaseBrain=this.e.brain;this.leasePlayer=this.e.player;this.leaseScene=this.e.world.scene;this.leaseMap=this.e.world.mapId;}
   else this.cancel(blocked?'ram-blocked':'ram-not-confirmed');
  }
 }
 finish(){
  const phase=this.current;
  if(this.matches()){this.lastSource=this.e.brain.time;this.sourceHistory=true;}else this.sourceHistory=false;
  if(this.matches()&&phase?.config.kind==='maul'&&this.proneValid){this.previousA.copyFrom(this.a);this.previousB.copyFrom(this.b);this.historyKey=phase.key;this.historyValid=true;}
  else this.historyValid=false;
 }
 maulContact(points,previousTime,time){
  if(!this.canAttempt())return false;
  const e=this.e,phase=this.current,config=phase.config,fromTime=Math.max(config.contactStart,previousTime),toTime=Math.min(config.contactEnd,time);
  const sweep=this.historyValid&&this.historyKey===phase.key&&e.v02ContactSerial===phase.key&&time>=previousTime&&time-previousTime<.25;
  if(!sweep&&time>config.contactEnd)return false;
  const from=sweep?Math.max(0,Math.min(1,(fromTime-previousTime)/Math.max(1e-9,time-previousTime))):1,to=sweep?Math.max(0,Math.min(1,(toTime-previousTime)/Math.max(1e-9,time-previousTime))):1;
  let best=Infinity,bestPart=null,bestTime=time,contact=false;
  for(const point of points){
   const part=e.v02ContactParts.find(item=>item.point===point),radius=(part?.radius??.60)+this.bodyRadius,old=sweep?part.previous:point,a=sweep?this.previousA:this.a,b=sweep?this.previousB:this.b;
   // Nine samples of the actual moving point AND both moving torso endpoints.
   // The source post-ram clock is 1x, so this is bounded independently of cast
   // speed. No upright/ground-height proxy or enlarged capsule is introduced.
   for(let sample=0;sample<=8;sample++){
    const alpha=from+(to-from)*sample/8;
    this.point[0]=old.x+(point.x-old.x)*alpha;this.point[1]=old.y+(point.y-old.y)*alpha;this.point[2]=old.z+(point.z-old.z)*alpha;
    this.capsuleA[0]=a.x+(this.a.x-a.x)*alpha;this.capsuleA[1]=a.y+(this.a.y-a.y)*alpha;this.capsuleA[2]=a.z+(this.a.z-a.z)*alpha;
    this.capsuleB[0]=b.x+(this.b.x-b.x)*alpha;this.capsuleB[1]=b.y+(this.b.y-b.y)*alpha;this.capsuleB[2]=b.z+(this.b.z-b.z)*alpha;
    const distance=Math.sqrt(segmentDistanceSquared(this.point,this.point,this.capsuleA,this.capsuleB));
    if(distance<best){best=distance;bestPart=part?.name??'jaw';bestTime=sweep?previousTime+(time-previousTime)*alpha:time;}
    if(distance<=radius)contact=true;
   }
  }
  e.v02LastContact={serial:this.serial,phaseSerial:phase.key,phase:config.id,action:'lunge',sourceTime:bestTime,part:bestPart,distance:best,radius:.60+this.bodyRadius,bodyRadius:this.bodyRadius,prone:true,body:[this.a.asArray(),this.b.asArray()],swept:sweep,contact};
  return contact;
 }
 inspect(){return {serial:this.serial,active:this.matches(),phase:this.current?.config.id??null,ramHit:this.phases[0].hit,authorized:this.authorized,critical:this.critical,cancelReason:this.cancelReason,clearanceLease:!!this.leaseBrain,phases:this.phases.map(phase=>({id:phase.config.id,serial:phase.key,resolved:phase.resolved,hit:phase.hit,damage:phase.damage,sourceTime:phase.sourceTime,blocked:phase.blocked,acceptedKnockdown:phase.acceptedKnockdown}))};}
}
