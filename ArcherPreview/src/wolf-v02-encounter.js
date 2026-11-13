import {Vector3} from '@babylonjs/core';
import {WolfEncounter} from './wolf-encounter.js';
import {WolfV02Brain,WOLF_V02_COMBAT_PROFILES,WOLF_V02_KNOCKBACK_SCALE,WOLF_V02_ORBIT,WOLF_V02_GAIT,WOLF_V02_BRACE,WOLF_V02_DEATH,WOLF_V02_BACK_RUN,WOLF_V02_AIR_REACTION} from './wolf-v02-spec.js';
import {WOLF_CLIPS} from './wolf-spec.js';
import {playerDimensions} from './player-dimensions.js';
import {installWolfV02AttackClips} from './wolf-v02-authored-clips.js';
import {segmentDistanceSquared} from './melee-collision.js';
import {WolfV02LocomotionPose} from './wolf-v02-locomotion.js';
import {WolfGrab} from './wolf-grab.js';
import {WolfRamSequence,wolfRamContactTime} from './wolf-v02-ram.js';
import {rearDamage,facingYaw} from './combat-damage.js';
import {WolfV02HurtVolumes,WolfV02ContactGate} from './wolf-v02-hurt.js';
import {WolfV02ShieldSweep} from './wolf-v02-shield.js';
import {prepareWolfV02Telegraph} from './wolf-v02-telegraph.js';
import {WolfV02Support} from './wolf-v02-support.js';
import {wolfContactShape} from './wolf-v02-contact-shapes.js';
import {WolfV02PlayerImpact} from './wolf-v02-momentum.js';
import {WolfV02AirReaction} from './wolf-v02-air-reaction.js';
import {WolfV02RunRamLayer,WolfV02ForepawBrace,WOLF_V02_RUN_RAM_OVERLAY} from './wolf-v02-run-ram.js';

// These are the physical part envelopes; player capsule radius is added once.
// Their centres always come from the post-navigation, authored skeletal pose.
const CONTACT_PARTS=Object.freeze([
  Object.freeze({name:'jaw',radius:.60}),
  Object.freeze({name:'head',radius:.60}),
  Object.freeze({name:'fore.L.paw',radius:.75}),
  Object.freeze({name:'fore.R.paw',radius:.75}),
]);
const FALLBACK_COMMIT=Object.freeze({
  [WOLF_CLIPS.pin]:.85,
  [WOLF_CLIPS.lunge]:1.65,
});
const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const ORBIT_CLIPS=new Set(Object.values(WOLF_V02_ORBIT));

function sampleRoot(clip,time){
  const frames=clip.rootTrack,f=Math.max(0,Math.min(frames.length-1,time*clip.fps));
  const i=Math.floor(f),j=Math.min(i+1,frames.length-1),t=f-i;
  return frames[i].map((v,k)=>v+(frames[j][k]-v)*t);
}

function sampleYaw(clip,time){
  const frames=clip.yawTrack;
  if(!frames?.length)return 0;
  const f=Math.max(0,Math.min(frames.length-1,time*clip.fps));
  const i=Math.floor(f),j=Math.min(i+1,frames.length-1);
  return frames[i]+angleDelta(frames[j],frames[i])*(f-i);
}

// Capture follows the accelerated source action, not repeated pose-pass dt.
// The player keeps its real position and can escape until the authored bite.
class WolfV02Grab extends WolfGrab{
  constructor(encounter,original){super(original.onControl,original.onImpact);this.encounter=encounter;this.maulHolding=false;this.contactPass=false;this.tapTimes=new Float64Array(5);this.maulHits=0;this.tapCount=0;}
  get active(){return super.active&&!this.contactPass;}
  get holding(){return this.maulHolding||super.holding;}
  get canEscape(){return this.maulHolding||this.active&&!this.impacted;}
  get escapePrompt(){return this.maulHolding?'회피를 눌러 탈출하세요':'';}
  get escapeProgress(){return this.maulHolding?Math.min(1,this.tapCount/5):0;}
  start(...args){const started=super.start(...args);if(started)this.captureClock=this.encounter.brain.actionElapsed;return started;}
  startMaul(player){
    const e=this.encounter,b=e.brain;
    if(this.phase||e.combat.grabOwner||!e.v02Ram.authorized||!e.v02Ram.proneValid||!b.ramPawBraced||!e.playerAlive)return false;
    this.maulHolding=true;this.maulHits=0;this.tapCount=0;this.lastTapClock=-Infinity;this.escapeQueued=false;
    this.holdBrain=b;this.holdScene=e.world.scene;this.holdMap=e.world.mapId;b.ramMaulHold=true;
    if(super.start(player,e.playerNodes,b.serial))return true;
    this.maulHolding=false;b.ramMaulHold=false;return false;
  }
  releaseEscaped(){const b=this.encounter.brain;this.reset();b.lastOutcome='miss';b.requestRetreat('escape');b.abortRam('maul-escape');}
  escape(){
    if(this.maulHolding){
      const now=this.encounter.brain.combatClock;if(now===this.lastTapClock)return false;this.lastTapClock=now;
      let count=0;for(let i=0;i<this.tapCount;i++)if(now-this.tapTimes[i]<=1.5)this.tapTimes[count++]=this.tapTimes[i];
      if(count<5)this.tapTimes[count++]=now;this.tapCount=count;
      if(count>=5)this.escapeQueued=true;
      if(this.escapeQueued&&this.maulHits>=2){this.releaseEscaped();return true;}return false;
    }
    const escaped=super.escape();if(escaped){this.encounter.brain.lastOutcome='miss';this.encounter.brain.requestRetreat('escape');}return escaped;
  }
  noteMaulHit(){if(!this.maulHolding)return;this.maulHits++;if(!this.encounter.playerAlive)this.reset();else if(this.maulHits>=2&&this.escapeQueued)this.releaseEscaped();}
  reset(){
    if(!this.phase)return;
    this.phase=null;this.player=null;this.maulHolding=false;this.tapCount=0;this.escapeQueued=false;this.holdBrain=null;this.holdScene=null;this.holdMap=null;
    this.encounter.brain.ramMaulHold=false;this.onControl(false);
  }
  update(dt,{interrupted,state,serial,clipTime}){
    if(this.maulHolding){const e=this.encounter,b=e.brain;if(interrupted||!e.active||!e.playerAlive||serial!==this.serial||b!==this.holdBrain||this.player!==e.player||this.holdScene!==e.world.scene||this.holdMap!==e.world.mapId||e.combat.grabOwner!==e||b.mode!=='attack'||!b.action?.momentumRam)this.reset();return;}
    if(!this.active)return;
    const brain=this.encounter.brain;
    if(interrupted||serial!==this.serial||state!==WOLF_CLIPS.pin){this.reset();return;}
    this.time=Math.max(this.time,(brain.actionElapsed-this.captureClock)/Math.max(.5,brain.castSpeed??1));
    if(!this.impacted&&clipTime>=1.85){this.impacted=true;this.onImpact();}
    if(this.active&&clipTime>=3.35)this.reset();
  }
}

// The 0.2 variant owns decisions, movement and bounded post-sampler attention /
// fixed-length foot support. R8's sampler, model library, shared paint/ink,
// preparation, pool and death lifecycle remain the implementation used by 0.1.
export class WolfV02Encounter extends WolfEncounter{
  constructor(...args){
    super(...args);
    this.combatVersion='moonforest-0.2';
    // Only this alpha-boss profile breaks guard; regular canines remain blockable.
    this.combatProfile=WOLF_V02_COMBAT_PROFILES.alphaWolf;
    this.combat.v02Impact??=new WolfV02PlayerImpact(this.world,this.combat);
    this.v14Air=new WolfV02AirReaction(this);
    this.v14Before=new Vector3();this.v14HeadingSerial=null;this.v14Yaw=0;
    this.v02MotionSpecs=new Map();this.v14StrikePoint=new Vector3();
    this.gate=new WolfV02ContactGate();
    this.v02Shield=new WolfV02ShieldSweep();
    this.v02MoveTarget=new Vector3();
    this.v02ContactParts=CONTACT_PARTS.map(part=>({...part,point:new Vector3()}));
    this.v02ContactPoints=[];
    this.v02LastContact=null;
    this.v02LastOutcome=null;
    this.v02PinBiteContact=null;
    this.v02PreviousPlayer=new Vector3();
    for(const part of this.v02ContactParts)part.previous=new Vector3();
    this.v02ContactSerial=null;
    this.v02ResolvedSerial=null;
    this.grab=new WolfV02Grab(this,this.grab);
    this.grab.onImpact=()=>{
      if(this.pinBiteContact())this.hitPlayer(this.balance.pinDamage,this.actor.position,{grabImpact:true,knockdown:true});
      else{this.brain.lastOutcome='miss';this.brain.requestRetreat('miss');this.grab.reset();}
      if(!this.playerAlive)this.grab.reset();
    };
    this.v02Ram=new WolfRamSequence(this);this.v02RamPhase=null;
    this.v02RamReaction=(duration,options)=>{
      const accepted=this.v02RamOriginalReaction(duration,options);
      if(options?.knockdown&&this.v02Ram.matches())this.v02RamAcceptedKnockdown=accepted===true;
      return accepted;
    };
  }

  createBrain(durations){const brain=new WolfV02Brain(durations);brain.ramReach=Math.max(...WOLF_V02_RUN_RAM_OVERLAY.contactCenter.phasePoints.map(point=>point[2]*this.config.scale))+.55;return brain;}
  createAnimator(){
    const animator=super.createAnimator(),transition=animator.transition.bind(animator);
    animator.transition=(state,options={})=>{const b=this.brain;if(b?.action?.momentumRam&&state===WOLF_CLIPS.run&&animator.current===WOLF_CLIPS.run)return transition(state,{...options,blendDuration:0});if(b?.action?.momentumRam&&b.ramStage==='settle')return transition(state,{...options,blendDuration:.20});if(b?.ramMaulHold&&b.ramLoopPoseKey)return transition(state,{...options,actionId:b.ramLoopPoseKey,blendDuration:.10});return transition(state,options);};return animator;
  }
  prepareAsset(){this.config=installWolfV02AttackClips(this.asset,this.config);}
  async prepareAuxiliary(preparation){await prepareWolfV02Telegraph(this,preparation);this.warningRing.update=()=>{if(this.brain?.action?.momentumRam)this.ring.isVisible=false;else this.v02Telegraph.update();};if(this.playerNodes?.Bunnyguard_Shield)await preparation.step('wolf-shield-profile',()=>this.v02Shield.warm(this.playerNodes.Bunnyguard_Shield));}
  hurtCapsules(){this.v02Hurt??=new WolfV02HurtVolumes(this.nodes,this.config.scale);return this.v02Hurt.sample();}
  skillHurtCapsule(){return null;}

  async summon(...args){
    const result=await super.summon(...args),duration=this.animator?.durations[WOLF_V02_DEATH];
    if(duration)this.death.reset({holdPose:true,clipSeconds:duration,holdSeconds:.65});
    return result;
  }

  update(dt,player){
    this.v02Pose?.capturePreviousFeet();
    this.v02Pose?.restore();
    this.v02HeldYaw=this.actor?.rotation.y;
    // A stationary watch keeps its support feet fixed. During the freely
    // interruptible observation, use a real step before the neck reaches its
    // turn limit. A punishable recovery always retains its full timer.
    const b=this.brain,p=this.actor?.position;
    const navigation=this.world.navigation;
    this.v02SightRemaining=Math.max(0,(this.v02SightRemaining??0)-Math.max(0,dt));
    if(b&&p&&player&&(navigation!==this.v02SightNavigation||!this.v02SightRemaining)){
      this.v02SightNavigation=navigation;this.v02SightRemaining=.15;
      b.sightBlocked=!!navigation&&!navigation.segmentClear(p,player.position,0,true);
    }
    if(b?.behavior==='observe'&&b.state===WOLF_CLIPS.watch&&p&&player){
      const target=Math.atan2(player.position.x-p.x,player.position.z-p.z);
      if(Math.abs(angleDelta(target,this.v02HeldYaw))>.24)b.observation=0;
    }
    const priorClock=b?.state===WOLF_CLIPS.run?(b?.action?.momentumRam?b.ramRunClock:b?.gaitClock??0):0,priorBody=b?.state;this.v14Before.copyFrom(this.actor?.position??player.position);
    if(b?.action?.momentumRam&&b.ramAccepted){
      const dx=player.position.x-p.x,dz=player.position.z-p.z,gap=Math.hypot(dx,dz),impact=this.combat.v02Impact,flightSpeed=gap>1e-6?(impact.velocity.x*dx+impact.velocity.z*dz)/gap:0;
      b.ramChaseSpeed=Math.max(0,flightSpeed+(gap-1.90)*8);b.ramCatchReady=gap<=2.05&&(b.ramActualSpeed??b.ramRunSpeed)<=1.25&&(!impact.active||impact.velocity.lengthSquared()<.01&&impact.elapsed>.08);
    }
    super.update(dt,player);
    if(b?.action?.momentumRam&&b.state===WOLF_CLIPS.run){
      const travelled=Math.hypot(this.actor.position.x-this.v14Before.x,this.actor.position.z-this.v14Before.z);b.ramActualSpeed=travelled/Math.max(1e-9,dt);b.ramRunClock=priorClock+travelled/(WOLF_V02_GAIT.runSourceSpeed*this.config.scale);b.time=WOLF_V02_GAIT.runSourceStart+b.ramRunClock%WOLF_V02_GAIT.runSourceDuration;if(this.animator.current!==b.state||Math.abs(this.animator.time-b.time)>1e-7){this.animator.transition(b.state,{clipTime:b.time,actionId:b.serial,blendDuration:0});this.animator.update(0);}
    }else if(b?.action?.momentumRam&&priorBody!==b.state)this.v02Pose?.resetPlants();
    this.v14Air.afterMotion();
  }

  alignPose(){
    this.v02Pose??=new WolfV02LocomotionPose(this);
    this.v02Pose.restore();
    if(!this.v14Air.alignWithHeight())super.alignPose();
    const orbit=(this.brain.behavior==='flank'||this.brain.mode==='ramEvade')&&ORBIT_CLIPS.has(this.brain.state);
    this.v02Support??=new WolfV02Support(this);
    this.v14RunLayer??=new WolfV02RunRamLayer(this);
    this.v14PawBrace??=new WolfV02ForepawBrace(this);
    if(orbit)this.v02Pose.alertCrouch();
    this.v02Pose.attackEmphasis();
    if(orbit)this.v02Pose.plantOrbit(this.brain.state===WOLF_V02_ORBIT.left);
    else if(this.brain.state===WOLF_V02_BRACE)this.v02Pose.plantBrace();
    else if((this.brain.mode==='move'||this.brain.action?.momentumRam)&&this.brain.state===WOLF_CLIPS.run)this.v02Pose.plantRun();
    else if(!this.v02Support.apply())this.v02Pose.resetPlants();
    if(orbit)this.v02Pose.groundAlertFeet();
    if(!(this.brain.mode==='ramRecover'&&this.brain.ramAccepted&&this.brain.action?.authoredAttention))this.v02Pose.aim();
    this.v14RunLayer.apply();
    this.v14PawBrace.apply();
  }

  motionSpec(name){
    if(this.brain?.mode==='attack'&&this.brain.action){
      const action=this.brain.action;let clips=this.v02MotionSpecs.get(action);if(!clips){clips=new Map();this.v02MotionSpecs.set(action,clips);}let spec=clips.get(name);if(!spec){spec=Object.freeze({...action,name,kind:'melee',role:'attack'});clips.set(name,spec);}return spec;
    }
    return super.motionSpec(name);
  }

  attackDamage(event){
    return Number.isFinite(event?.damage)?event.damage:super.attackDamage(event);
  }

  isHeavyAttack(event){return this.v02RamPhase?this.v02RamPhase.config.kind==='ram':(event?.actionId??this.brain?.action?.id)==='lunge';}

  hitPlayer(damage,source,options={}){
    const phase=this.v02RamPhase;
    if(!phase)return super.hitPlayer(damage,source,options);
    if(!this.v02Ram.matches())return;
    const maul=phase.config.kind==='maul';
    if(this.v02Ram.critical===null)this.v02Ram.critical=rearDamage(damage,source,this.player.position,facingYaw(this.playerNodes,this.player.rotation?.y??0)).critical;
    const scoped={...options,critical:this.v02Ram.critical,grabImpact:maul&&this.grab.maulHolding,knockdown:!maul,superArmor:maul||options.superArmor};
    if(maul)return super.hitPlayer(damage,source,scoped);
    const original=this.onPlayerHit;this.v02RamOriginalReaction=original;this.v02RamAcceptedKnockdown=false;this.onPlayerHit=this.v02RamReaction;
    try{return super.hitPlayer(damage,source,scoped);}finally{this.onPlayerHit=original;this.v02RamOriginalReaction=null;}
  }

  pinBiteContact(){
    const player=this.player.position,d=playerDimensions(this.player),low=player.y+d.moveRadius,high=player.y+d.height-d.moveRadius,radius=.60+d.moveRadius;
    let separation=Infinity,part=null;
    for(const name of ['jaw','head']){
      const point=this.nodes[name].getAbsolutePosition(),distance=Math.hypot(point.x-player.x,point.z-player.z,Math.max(low-point.y,point.y-high,0));
      if(distance<separation){separation=distance;part=name;}
    }
    this.v02PinBiteContact={serial:this.brain.serial,sourceTime:this.brain.time,separation,radius,part,contact:separation<=radius};
    return separation<=radius;
  }

  movementPlan(player,result){
    if(result.momentumRam){
      const b=this.brain,p=this.actor.position,target=Math.atan2(player.position.x-p.x,player.position.z-p.z);
      if(this.v14HeadingSerial!==b.serial){this.v14HeadingSerial=b.serial;this.v14Yaw=target;}
      else if(b.ramStage==='chase'||b.ramStage==='charge'&&b.ramLayerTime<b.action.commitTime){const limit=1.8*Math.max(0,this.dt??0);this.v14Yaw+=Math.max(-limit,Math.min(limit,angleDelta(target,this.v14Yaw)));}
      const gap=Math.hypot(player.position.x-p.x,player.position.z-p.z),available=b.ramStage==='chase'?Math.max(0,gap-1.85):100;
      return {target:this.v02MoveTarget.set(p.x+Math.sin(this.v14Yaw)*100,p.y,p.z+Math.cos(this.v14Yaw)*100),stopDistance:100-available,direct:true};
    }
    if(result.flank){
      // The dedicated left/right R10 support gait owns the orbit's stride.
      return {target:player.position,stopDistance:0};
    }
    return {target:player.position,stopDistance:result.stopDistance??result.engageDistance??2.4};
  }

  contactSeparation(){
    if(this.v02Ram?.hasClearanceLease())return this.radius;
    if(this.brain?.mode==='ramRecover')return this.radius+playerDimensions(this.player).moveRadius;
    // Standing clearance is a navigation convenience wider than the player's
    // actual body. During a strike use the same physical movement capsule so
    // separation cannot push an authored paw away before contact is tested.
    if(this.brain?.mode==='attack'&&!this.grab.active){
      return this.radius+playerDimensions(this.player).moveRadius;
    }
    return super.contactSeparation();
  }

  applyMotionRoot(root){
    const brain=this.brain,clip=this.config.catalog.find(c=>c.name===brain.state);
    if(!clip)return;
    if(this.v14Air.applyMotion())return;
    if(this.v14Air.valid())this.actor.rotation.y=this.v14Air.yaw;
    if(brain.action?.momentumRam&&brain.state===WOLF_CLIPS.run){this.motionYaw=this.v14Yaw;this.actor.rotation.y=this.v14Yaw;this.previousWolfTime=brain.time;return;}
    const action=brain.mode==='attack'?brain.action:null,time=brain.time;
    if(brain.mode==='ramRecover'&&!this.knockTurn&&Number.isFinite(this.v02HeldYaw))this.actor.rotation.y=this.v02HeldYaw;
    if(this.lastSerial!==brain.serial||this.wolfClip!==clip.name){
      this.wolfClip=clip.name;
      this.motionYaw=this.knockTurn?this.knockTurn.start+this.knockTurn.delta:this.actor.rotation.y;
      // Every action has its own local root origin. A nonzero source start is
      // an origin, never a first-frame world displacement.
      const start=brain.mode==='ramRecover'?brain.ramRecoveryOrigin:action?.momentumRam?brain.ramBodyOrigin??action.maulClipStart:action?.clipStart??0;
      this.previousWolfTime=start;
      this.lastRoot=sampleRoot(clip,start);
      this.v02RootYaw=sampleYaw(clip,start);
      this.v02CommitRoot=action?sampleRoot(clip,action.commitTime):null;
    }
    if((brain.mode==='retreat'||brain.state===WOLF_V02_BRACE||brain.state===WOLF_V02_BACK_RUN)&&!this.knockTurn&&this.player){
      const target=Math.atan2(this.player.position.x-this.actor.position.x,this.player.position.z-this.actor.position.z),limit=1.6*Math.max(0,this.dt??0);
      this.motionYaw+=Math.max(-limit,Math.min(limit,angleDelta(target,this.motionYaw)));
    }
    if(action&&!this.knockTurn&&!brain.stagger){
      const commit=action.commitTime??(action.clipStart>0?1.45:FALLBACK_COMMIT[clip.name]??0);
      if(time<commit&&this.player){
        const dx=this.player.position.x-this.actor.position.x,dz=this.player.position.z-this.actor.position.z;
        if(dx*dx+dz*dz>1e-8){
          let target=Math.atan2(dx,dz);
          // The authored dodge returns from its lateral offset before launch.
          // Aim for that remaining path instead of chasing each intermediate
          // side step, which otherwise leaves a frame-rate-dependent yaw snap.
          if(action.id==='lunge'&&this.v02CommitRoot&&this.lastRoot){
            const sideways=(this.v02CommitRoot[0]-this.lastRoot[0])*this.config.scale;
            target-=Math.asin(Math.max(-.95,Math.min(.95,sideways/Math.hypot(dx,dz))));
          }
          const turn=angleDelta(target,this.motionYaw),limit=1.6*Math.max(0,this.dt??0);
          this.motionYaw+=Math.max(-limit,Math.min(limit,turn));
        }
      }
    }
    const stalking=(brain.behavior==='flank'||brain.mode==='ramEvade')&&ORBIT_CLIPS.has(brain.state),backRunning=brain.state===WOLF_V02_BACK_RUN;
    const watching=brain.state===WOLF_CLIPS.watch||ORBIT_CLIPS.has(brain.state);
    if(watching&&!stalking&&!this.knockTurn&&Number.isFinite(this.v02HeldYaw))this.actor.rotation.y=this.v02HeldYaw;
    if(watching&&!stalking&&!this.knockTurn)this.motionYaw=this.actor.rotation.y-sampleYaw(clip,time)+(this.v02RootYaw??0);
    if((time>=this.previousWolfTime||stalking||backRunning)&&this.lastRoot&&!brain.stagger&&brain.mode!=='move'&&(!watching||stalking)){
      // The large 2.5x body amplified both authored fall travel and impulse.
      // Keep the pose curve intact and shorten only the world displacement.
      const fallScale=brain.state===WOLF_V02_DEATH?1:['down','recover'].includes(brain.mode)?WOLF_V02_KNOCKBACK_SCALE:1;
      if(action&&!this.knockTurn&&this.previousWolfTime<action.commitTime&&time>=action.commitTime){
        // Fast source playback can cross the final dodge and take-off in one
        // simulation tick. Finish that authored dodge before snapshotting the
        // leap heading, rather than aiming from the previous tick's position.
        const commitRoot=this.v02CommitRoot??sampleRoot(clip,action.commitTime),x=(commitRoot[0]-this.lastRoot[0])*this.config.scale,z=(commitRoot[2]-this.lastRoot[2])*this.config.scale,yaw=this.motionYaw;
        this.actor.position.x+=x*Math.cos(yaw)+z*Math.sin(yaw);this.actor.position.z+=z*Math.cos(yaw)-x*Math.sin(yaw);
        const target=Math.atan2(this.player.position.x-this.actor.position.x,this.player.position.z-this.actor.position.z);
        this.motionYaw+=Math.max(-.40,Math.min(.40,angleDelta(target,this.motionYaw)));this.lastRoot=commitRoot;
      }
      const wrappedBack=backRunning&&time<this.previousWolfTime,backEnd=wrappedBack?clip.rootTrack.at(-1):null,backStart=wrappedBack?clip.rootTrack[0]:null;
      const x=(root[0]-this.lastRoot[0]+(wrappedBack?backEnd[0]-backStart[0]:0))*this.config.scale*fallScale,z=(root[2]-this.lastRoot[2]+(wrappedBack?backEnd[2]-backStart[2]:0))*this.config.scale*fallScale;
      const yaw=this.motionYaw;
      const dx=x*Math.cos(yaw)+z*Math.sin(yaw),dz=z*Math.cos(yaw)-x*Math.sin(yaw);
      if(stalking){
        const player=this.player.position,p=this.actor.position;
        const distance=Math.hypot(p.x-player.x,p.z-player.z),navigation=this.movementNavigation;
        this.v02StalkRadius??=brain.orbitTargetRadius??distance;
        // Source arc length, not elapsed time or a generic authored arc, is the
        // movement budget. Recompute the polar origin around the actual player
        // every step; a moving player never leaves an old circle centre behind.
        const sourceRadius=clip.orbitRadius??WOLF_V02_GAIT.orbitRadius;
        const wrapped=time<this.previousWolfTime;
        const yawStep=wrapped?angleDelta(sampleYaw(clip,clip.duration),sampleYaw(clip,this.previousWolfTime))+angleDelta(sampleYaw(clip,time),sampleYaw(clip,0)):angleDelta(sampleYaw(clip,time),sampleYaw(clip,this.previousWolfTime));
        const stride=Math.abs(yawStep)>1e-8?Math.abs(yawStep)*sourceRadius*this.config.scale:Math.hypot(dx,dz);
        const radial=Math.max(-stride*.25,Math.min(stride*.25,this.v02StalkRadius-distance));
        const nextDistance=Math.max(this.radius+playerDimensions(this.player).moveRadius,distance+radial);
        const tangent=Math.sqrt(Math.max(0,stride*stride-radial*radial));
        const angle=Math.atan2(p.x-player.x,p.z-player.z)-brain.flankSide*tangent/Math.max(.25,(distance+nextDistance)*.5);
        const to=this.v02MoveTarget.set(player.x+Math.sin(angle)*nextDistance,p.y,player.z+Math.cos(angle)*nextDistance);
        const clear=!navigation||navigation.segmentClear(p,to,this.radius);
        if(clear&&Math.abs(distance-this.v02StalkRadius)<1.5){
          p.x=to.x;p.z=to.z;const facing=Math.atan2(player.x-p.x,player.z-p.z);this.actor.rotation.y=this.v14Air.valid()?this.v14Air.turnToward(facing,this.dt??0):facing;brain.stalkBlocked=false;
          this.v02OrbitDistance=(this.v02OrbitDistance??0)+stride;
        }else{
          // Reject both the root and its foot phase. Next decision tries the
          // proper opposite gait once, then returns to a reachable attack.
          brain.time=this.previousWolfTime;brain.stalkBlocked=true;
          this.animator.transition(brain.state,{clipTime:brain.time,actionId:brain.serial});this.animator.update(0);
          for(let i=0;i<3;i++)root[i]=this.lastRoot[i];
        }
      }else if(backRunning&&this.movementNavigation&&!this.movementNavigation.segmentClear(this.actor.position,this.v02MoveTarget.set(this.actor.position.x+dx,this.actor.position.y,this.actor.position.z+dz),this.radius)){
        brain.time=this.previousWolfTime;brain.backRunBlocked=true;this.animator.transition(brain.state,{clipTime:brain.time,actionId:brain.serial});this.animator.update(0);for(let i=0;i<3;i++)root[i]=this.lastRoot[i];
      }else{this.actor.position.x+=dx;this.actor.position.z+=dz;}
      if(action?.ramPhases&&!action.momentumRam)this.v02Ram.chaseStep(root,clip);
    }
    if(brain.mode!=='move'&&!this.knockTurn&&!stalking){
      this.actor.rotation.y=this.motionYaw+sampleYaw(clip,time)-(this.v02RootYaw??0);
    }
    this.previousWolfTime=brain.time;
    if(!stalking){this.v02StalkRadius=null;brain.suppressStalkStep=false;}
  }

  attackRange(spec){
    if(!this.v02EvaluatingContacts)return super.attackRange(spec);
    const origin=this.actor.position,owners=this.v02RamPhase?.config.contactParts??this.brain.action?.contactParts,key=this.v02RamPhase?.key??this.brain.serial;
    let reach=0;
    for(const part of this.v02ContactParts){
      if(owners&&!owners.includes(part.name))continue;
      const shape=wolfContactShape(part.name,this.v02RamPhase?.config.kind),p=Vector3.TransformCoordinatesToRef(shape.offset,this.nodes[part.name].getWorldMatrix(),part.point);part.radius=shape.radius;
      reach=Math.max(reach,Math.hypot(p.x-origin.x,p.z-origin.z)+part.radius+playerDimensions(this.player).moveRadius);
      if(this.v02ContactSerial===key)reach=Math.max(reach,Math.hypot(part.previous.x-origin.x,part.previous.z-origin.z)+part.radius+playerDimensions(this.player).moveRadius);
    }
    // Broad phase follows the actual pose. It never replaces the capsule test.
    return Math.max(super.attackRange(spec),reach);
  }

  attackContactPoints(aim){
    const parts=this.v02ContactParts,points=this.v02ContactPoints;
    points.length=0;
    const owners=this.v02RamPhase?.config.contactParts??this.brain.action?.contactParts;
    if(this.v02RamPhase?.config.kind==='maul'&&this.v02Ram.proneValid)aim.copyFrom(this.v02Ram.aim);
    for(const part of parts){if(owners&&!owners.includes(part.name))continue;const shape=wolfContactShape(part.name,this.v02RamPhase?.config.kind);part.radius=shape.radius;Vector3.TransformCoordinatesToRef(shape.offset,this.nodes[part.name].getWorldMatrix(),part.point);points.push(part.point);}
    points.sort((a,b)=>Vector3.DistanceSquared(a,aim)-Vector3.DistanceSquared(b,aim));
    return points;
  }

  attackBodyContact(event,aim,points){
    if(this.v02RamPhase){
      if(!this.v02Ram.canAttempt())return false;
      if(this.v02RamPhase.config.kind==='maul')return this.v02Ram.maulContact(points,this.v02PreviousContactTime??wolfRamContactTime(this.brain),wolfRamContactTime(this.brain));
    }
    const dimensions=playerDimensions(this.player),bodyRadius=dimensions.moveRadius;
    const low=bodyRadius,high=dimensions.height-bodyRadius,player=this.player.position;
    const action=this.v02RamPhase?.config??this.brain.action,time=this.v02RamPhase?wolfRamContactTime(this.brain):this.brain.time,previousTime=this.v02PreviousContactTime,key=this.v02RamPhase?.key??this.brain.serial;
    const maxPlayerStep=Math.min(2,Math.max(.8,32*Math.max(0,this.dt??0)));
    const sweep=this.v02ContactSerial===key&&time>=previousTime&&time-previousTime<.65&&Vector3.DistanceSquared(player,this.v02PreviousPlayer)<=maxPlayerStep*maxPlayerStep;
    const start=action?.contactStart??action?.impact??time,end=action?.contactEnd??time;
    const alpha=t=>Math.max(0,Math.min(1,(t-previousTime)/Math.max(1e-9,time-previousTime)));
    const from=sweep?alpha(Math.max(start,previousTime)):1,to=sweep?alpha(Math.min(end,time)):1;
    let best=null;
    for(const point of points){
      const part=this.v02ContactParts.find(p=>p.point===point);
      const radius=(part?.radius??.6)+bodyRadius;
      const now=[point.x-player.x,point.y-player.y,point.z-player.z];
      const old=sweep?[part.previous.x-this.v02PreviousPlayer.x,part.previous.y-this.v02PreviousPlayer.y,part.previous.z-this.v02PreviousPlayer.z]:now;
      const at=t=>now.map((v,i)=>old[i]+(v-old[i])*t);
      const distance=Math.sqrt(segmentDistanceSquared(at(from),at(to),[0,low,0],[0,high,0]));
      if(!best||distance-radius<best.distance-best.radius){best={part:part?.name??'jaw',point:point.asArray(),distance,radius};}
      if(distance<=radius){
        this.v02LastContact={serial:this.brain.serial,action:event.id??this.brain.action?.id,sourceTime:time,...best,bodyRadius,swept:sweep,contact:true};
        return true;
      }
    }
    this.v02LastContact={serial:this.brain.serial,action:event.id??this.brain.action?.id,sourceTime:time,...best,contact:false};
    return false;
  }

  receiveBossHit(options){
    const serial=this.brain.serial,before=this.playerHp,wasCaptured=this.grab.active,phase=this.v02RamPhase,key=phase?.key??serial,sourceTime=phase?wolfRamContactTime(this.brain):this.brain.time;
    if(phase&&!this.v02Ram.matches())return false;
    const ignoresGuard=phase?.config.kind==='ram'&&this.combatProfile.ramIgnoresGuard===true;
    // Wait for real forehead/body contact, not shield-only contact through air.
    // Dodge, invulnerability and shared capture ownership retain their checks.
    if(ignoresGuard&&!options.bodyContact)return false;
    if(this.v02ResolvedSerial===key)return false;
    if(options.bodyContact||options.shieldContact)this.v02ResolvedSerial=key;
    if(phase?.config.kind==='ram')this.v02RamAcceptedKnockdown=false;
    // A subsection of the Pin animation is still an ordinary bite. Only the
    // dedicated full Pin action may acquire input/capture ownership.
    const capture=options.event?.capture===true&&this.brain.action?.capture===true;
    const event={...options.event,capture};
    const action=ignoresGuard&&options.action?.state==='shieldPush'?{...options.action,state:'idle'}:options.action;
    const resolved=super.receiveBossHit({...options,event,grab:false,action,shieldContact:ignoresGuard?false:options.shieldContact});
    const captured=!wasCaptured&&this.grab.active;
    const blocked=resolved&&!captured&&!ignoresGuard&&(options.shieldContact||options.action?.state==='shieldPush');
    if(phase&&(options.bodyContact||options.shieldContact))this.v02Ram.resolve(phase,{before,after:this.playerHp,blocked:!!blocked,acceptedKnockdown:phase.config.kind==='ram'&&this.v02RamAcceptedKnockdown,sourceTime});
    const guardBroken=ignoresGuard&&(options.shieldContact||options.action?.state==='shieldPush')&&this.playerHp<before&&this.v02RamAcceptedKnockdown;
    if(guardBroken)this.onDamage(this.player.position.add(new Vector3(0,playerDimensions(this.player).feedbackHeight+.4,0)),'BREAK',false,'guard-break');
    this.v02ImpactOutcome={serial,hit:this.playerHp<before||captured,blocked:!!blocked,captured};
    return resolved;
  }

  poseAndContacts(player,result,sample,shield){
    if(!this.active||this.corpseGone)return;
    this.player=player;
    sample=this.v02Shield.sample(sample,result,shield);
    this.brain.playerAttackThreat=result.actionId!=null&&!result.shieldPending&&!result.guarding&&!result.captured&&!result.staggered&&['attack','slash','judgment','shieldPush'].includes(result.state);
    this.brain.playerThreatActionId=result.actionId;
    const ramPattern=this.brain.mode==='attack'&&!!this.brain.action?.ramPhases,phase=this.v02Ram.prepare(player,result);this.v02RamPhase=ramPattern?phase:null;
    const serial=this.brain?.serial;
    const attack=this.brain.action,time=ramPattern?wolfRamContactTime(this.brain):this.brain.time,key=phase?.key??serial,window=ramPattern?phase?.config:attack,previous=this.v02ContactSerial===key?this.v02PreviousContactTime:time;
    const inWindow=window&&this.brain.mode==='attack'&&!this.brain.stagger&&this.brain.hp>0&&time>=(window.contactStart??window.impact)&&previous<=(window.contactEnd??window.impact)&&this.v02ResolvedSerial!==key&&(!ramPattern||this.v02Ram.canAttempt());
    if(ramPattern)this.pendingEvents=[];
    if(inWindow&&!this.pendingEvents.some(e=>e.type==='attack'))this.pendingEvents.push({type:'attack',name:attack.sourceClip,actionId:attack.id,phaseId:phase?.config.id,range:attack.range,kind:'melee',damage:window.damage,capture:attack.capture});
    if(!inWindow)this.pendingEvents=[];
    const hasImpact=this.pendingEvents.some(event=>event.type==='attack');
    const heavyBefore=this.heavyCount,groundedBefore=['down','recover'].includes(this.brain.mode);
    const action=this.brain?.action?.id??null;
    this.v02ImpactOutcome=null;
    this.v02EvaluatingContacts=true;
    let hitStop;
    this.grab.contactPass=this.grab.maulHolding;
    try{hitStop=super.poseAndContacts(player,result,sample,shield);}finally{this.grab.contactPass=false;this.v02EvaluatingContacts=false;this.v02RamPhase=null;}
    if(this.heavyCount>heavyBefore){
      if(this.brain.state===WOLF_V02_AIR_REACTION&&!groundedBefore){this.knockVelocity.setAll(0);this.knockTurn=null;const blade=sample?.contacts?.[0]?.blade??sample?.blade;if(blade)this.v14StrikePoint.set((blade[0][0]+blade[1][0])*.5,(blade[0][1]+blade[1][1])*.5,(blade[0][2]+blade[1][2])*.5);else this.v14StrikePoint.copyFrom(player.position);this.v14Air.begin(player.position,this.v14StrikePoint);}
      else if(this.brain.hp>0&&this.brain.mode==='down'&&!groundedBefore){this.knockVelocity.scaleInPlace(.5);this.knockTurn=null;}
      else if(this.brain.hp>0||this.brain.state===WOLF_V02_DEATH){this.knockVelocity.setAll(0);this.knockTurn=null;}
      else this.knockVelocity.scaleInPlace(WOLF_V02_KNOCKBACK_SCALE);
    }
    if(hasImpact){
      const outcome=this.v02ImpactOutcome??{serial,hit:false,blocked:false,captured:false};
      this.v02LastOutcome={...outcome,action};
      this.brain.noteAttackResult?.(outcome);
    }
    if(this.brain.mode==='attack'&&!this.brain.stagger&&this.brain.hp>0){
      this.v02ContactSerial=key;this.v02PreviousContactTime=ramPattern?wolfRamContactTime(this.brain):this.brain.time;
      this.v02PreviousPlayer.copyFrom(player.position);
      for(const part of this.v02ContactParts){const shape=wolfContactShape(part.name,phase?.config.kind);Vector3.TransformCoordinatesToRef(shape.offset,this.nodes[part.name].getWorldMatrix(),part.previous);}
    }else this.v02ContactSerial=null;
    this.v02Ram.finish();this.v02RamPhase=null;
    if(!this.v14RunLayer?.updateWarning())this.v02Telegraph?.update();
    return hitStop;
  }

  hide(){
    this.v02Pose?.restore();this.v02Pose?.resetPlants();
    this.v02Ram?.reset();this.v02RamPhase=null;
    this.v02Shield?.reset(true);
    this.v02Telegraph?.reset();
    this.v14Air?.reset();
    if(this.combat.v02Impact?.owner===this)this.combat.v02Impact.reset();
    this.v02RamAcceptedKnockdown=false;this.v02RamOriginalReaction=null;
    super.hide();
    this.v02ImpactOutcome=null;
    this.v02LastContact=null;
    this.v02LastOutcome=null;
    this.v02PinBiteContact=null;
    this.v02ContactSerial=null;this.v02ResolvedSerial=null;this.v02StalkRadius=null;this.v02OrbitDistance=0;
    this.v02SightRemaining=0;this.v02SightNavigation=null;
  }

  inspect(){
    return {...super.inspect(),combatVersion:this.combatVersion,action:this.brain?.action?.id??null,
      phase:this.brain?.phase??null,behavior:this.brain?.behavior??null,contact:this.v02LastContact,bite:this.v02PinBiteContact,outcome:this.v02LastOutcome,
      observation:{target:this.brain?.circleTarget??0,elapsed:this.brain?.circleElapsed??0,remaining:this.brain?.flankRemaining??0},retreat:{reason:this.brain?.retreatReason??null,cooldown:this.brain?.retreatCooldown??0},ram:this.v02Ram?.inspect(),
      plan:{selected:this.brain?.plannedId??this.brain?.stalkPlannedId??null,approachVariant:this.brain?.ramApproachVariant??null,ramStartDistance:this.brain?.ramStartDistance??null},tactics:{recentDamage:this.brain?.recentDamage??0,cooldown:this.brain?.tacticalCooldown??0,targetDistance:this.brain?.backRunTarget??null,cycles:this.brain?.backRunCycles??0},
      telegraph:this.v02Telegraph?.inspect(),
      locomotion:{orbitSourceDistance:this.v02OrbitDistance??0,plantReachError:this.v02Pose?.maxReachError??0,releasedPlants:this.v02Pose?.releasedPlants??0}};
  }
}
