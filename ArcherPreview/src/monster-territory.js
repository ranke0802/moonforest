import {Vector3} from '@babylonjs/core';
import {PLAINS_ROUTES} from './great-plains-layout.js';
import {MonsterWatchLook} from './monster-watch-look.js';

const reactions=new Set(['down','recover','hit','dead']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const MONSTER_DISENGAGE_SECONDS=2.5;

// Opt-in awareness uses the ordinary encounter clock, walking, navigation and
// incoming hit/death paths. State, targets and movement results stay actor-owned.
export function installMonsterTerritory(encounter,territory,{walkSpeed=1,getPlayer=()=>encounter.player}={}){
  if(!Number.isFinite(walkSpeed)||walkSpeed<=0)throw new Error('Invalid monster territory walk speed');
  const state=encounter.territoryState={enabled:false,phase:'ambient',engaged:false};
  const center={x:0,z:0},home=new Vector3(),target=new Vector3(),motion={target,stopDistance:.25},brains=new WeakSet();
  const walkResult={events:[],speed:walkSpeed},stopResult={events:[],speed:0};
  let radius=0,combatRadius=0,wanderRadius=0,returnRadius=0,reengageRadius=0,ready=false,arrived=false,reason=null;
  let walkState,idleState,restState,riseState,watchState,innerTime=0,ambientTime=3,disengageRemaining=0,ambientMoving=false,lastPlayer=null,rising=false,settling=false,stood=false;
  const originalUpdate=encounter.update,originalMotion=encounter.movementPlan,originalContacts=encounter.poseAndContacts,originalReceive=encounter.receiveBossHit,originalAlign=encounter.alignPose;
  let watchLook;
  const protectedReaction=b=>b.hp<=0||b.stagger>0||reactions.has(b.mode);
  const random=()=>{const value=Number(encounter.brain?.random?.()??Math.random());return Number.isFinite(value)?Math.max(0,Math.min(1,value)):.5;};
  const behavior=()=>state.phase==='ambient'?'rest':'territory-'+state.phase;
  function silence(){
    encounter.pendingEvents.length=0;if(encounter.ring?.isVisible)encounter.ring.isVisible=false;
    encounter.v02Telegraph?.reset();
  }
  function clearAttack(){
    const b=encounter.brain;if(!b)return;
    if(rising&&b.state!==riseState)rising=false;
    if(settling&&b.state!==riseState)settling=false;
    silence();encounter.gate?.reset();encounter.spell?.reset();
    // Release only this actor's capture, never another owner's player control.
    const owner=encounter.combat?.grabOwner;
    if(owner===encounter||(!owner&&encounter.grab?.active))encounter.grab?.reset();
    encounter.v02Ram?.reset();encounter.v02RamPhase=null;encounter.v02ContactSerial=null;encounter.v02ResolvedSerial=null;
    b.cancelBout?.();b.plannedId=b.stalkPlannedId=b.followupId=null;b.followChain=false;b.chainRemaining=0;
    encounter.lastRoot=null;encounter.lastSerial=null;encounter.routeState={};
  }
  function startRise(){
    const b=encounter.brain;
    if(!rising&&!stood&&riseState&&b.state===restState){rising=true;b.start(riseState,'rise');b.behavior=behavior();return true;}
    return rising;
  }
  function noncombatPose(){
    const b=encounter.brain;if(!b||protectedReaction(b)||rising||settling)return;
    const moving=(state.phase==='return'&&!arrived)||(state.phase==='ambient'&&ambientMoving);
    if(moving&&startRise())return;
    const clip=moving?walkState:['watch','disengage'].includes(state.phase)?watchState:stood?idleState:restState;
    if(b.state!==clip||b.mode!==(moving?'move':'idle'))b.start(clip,moving?'move':'idle');
    b.behavior=behavior();
  }
  function changePhase(next){
    if(state.phase===next)return;
    // Watch may finish lying down. A committed fight or homeward walk instead
    // reverses smoothly from the current source pose into the same rise clip.
    if(settling&&(next==='combat'||next==='return')){settling=false;if(!protectedReaction(encounter.brain)){rising=true;encounter.brain.mode='rise';}}
    state.phase=next;state.engaged=next==='combat';innerTime=0;
    if(next!=='combat'){clearAttack();noncombatPose();}
  }
  function nativeCombat(){
    const b=encounter.brain;if(protectedReaction(b))return;
    if(b.beginStalk)b.beginStalk();else{b.start(idleState,'idle');b.wait=Math.max(.35,b.wait??0);}
  }
  function engage(player){
    const b=encounter.brain;
    if(!ready||!state.enabled||!b||b.hp<=0||!player?.position||distance(player.position,center)>radius||distance(encounter.actor.position,center)>radius)return false;
    if(state.phase==='combat')return true;
    changePhase('combat');reason=null;ambientMoving=false;
    if(!protectedReaction(b)&&!startRise())nativeCombat();
    return true;
  }
  function disengage(why){
    watchState=encounter.brain.state===restState&&!stood?restState:idleState;
    ambientMoving=false;arrived=false;reason=why;disengageRemaining=MONSTER_DISENGAGE_SECONDS;
    changePhase('disengage');
  }
  function check(player,dt=0){
    const b=encounter.brain;if(!ready||!state.enabled||!encounter.active||!b||!player?.position)return;
    lastPlayer=player;
    if(b.hp<=0){state.engaged=false;return;}
    const actorOutside=distance(encounter.actor.position,center)>radius,playerDistance=distance(player.position,center);
    // Contact checks run more than once per frame. Only the update's game dt
    // advances this pause; checking a pose must not consume the watch period.
    if(state.phase==='disengage'){
      if(!actorOutside&&playerDistance<=radius){disengageRemaining=0;reason=null;changePhase('watch');return;}
      disengageRemaining=Math.max(0,disengageRemaining-dt);
      if(disengageRemaining<=1e-6&&!protectedReaction(b)){
        arrived=distance(encounter.actor.position,home)<=returnRadius+1e-6;
        if(arrived&&!actorOutside){reason=null;ambientTime=3+random()*3;changePhase('ambient');}
        else{target.copyFrom(home);motion.stopDistance=returnRadius;changePhase('return');}
      }
      return;
    }
    if(state.phase!=='return'&&(actorOutside||state.phase==='combat'&&playerDistance>radius)){
      disengage(actorOutside?'actor-left':'player-left');return;
    }
    if(state.phase==='return'){
      arrived=distance(encounter.actor.position,home)<=returnRadius+1e-6;target.copyFrom(home);motion.stopDistance=returnRadius;
      if(arrived&&!actorOutside&&!protectedReaction(b)){
        reason=null;ambientMoving=false;ambientTime=3;watchState=stood?idleState:restState;
        changePhase(playerDistance<=reengageRadius?'watch':'ambient');
      }
      return;
    }
    if(state.phase==='combat')return;
    if(playerDistance<=radius){
      if(state.phase!=='watch'){watchState=b.state===restState&&!stood?restState:idleState;ambientMoving=false;changePhase('watch');}
      innerTime=playerDistance<=combatRadius?innerTime+dt:0;
      if(innerTime+1e-6>=1){
        // An inner circle on the other side of a cliff/wall is not an
        // invitation to fight. Test only at confirmation, not every frame.
        innerTime=0;const navigation=encounter.movementNavigation;
        if(!navigation?.segmentClear||navigation.segmentClear(encounter.actor.position,player.position,0,true))engage(player);
      }
    }else if(state.phase!=='ambient')disengage('player-left');
  }
  function clearRoad(p){
    if(encounter.world.mapId!=='great-plains')return true;
    const body=encounter.radius??0;
    for(const road of PLAINS_ROUTES){const gap=road.width*.5+body+.25,limit=gap*gap;for(const sample of road.samples){const dx=p.x-sample[0],dz=p.z-sample[1];if(dx*dx+dz*dz<=limit)return false;}}
    return true;
  }
  function chooseWander(){
    const navigation=encounter.movementNavigation,body=encounter.radius??0;
    const available=Math.min(wanderRadius,Math.max(0,radius-distance(home,center)-body-.25));
    if(available<.25)return false;
    // At most six candidates at a rest/walk boundary, never a scene inventory.
    for(let i=0;i<6;i++){
      const angle=random()*Math.PI*2,reach=available*(.35+.65*random());target.set(home.x+Math.sin(angle)*reach,home.y,home.z+Math.cos(angle)*reach);
      if(!clearRoad(target)||navigation?.free&&!navigation.free(target,body)||navigation?.segmentClear&&!navigation.segmentClear(encounter.actor.position,target,body))continue;
      target.y=encounter.world.terrain?.heightAt?.(target.x,target.z)??home.y;motion.stopDistance=.25;return true;
    }
    return false;
  }
  const controller={
    get returning(){return state.enabled&&state.phase==='return';},
    configure(value){
      state.enabled=state.engaged=ready=arrived=false;state.phase='ambient';reason=null;innerTime=disengageRemaining=0;ambientMoving=rising=settling=stood=false;lastPlayer=null;if(!value)return;
      const {x,z}=value;radius=value.radius;combatRadius=value.combatRadius??radius*.55;wanderRadius=value.wanderRadius??Math.min(2,radius*.2);
      if(![x,z,radius,combatRadius,wanderRadius].every(Number.isFinite)||radius<=0||combatRadius<=0||combatRadius>radius||wanderRadius<0||wanderRadius>radius)throw new Error('Invalid monster territory');
      returnRadius=value.returnRadius??Math.min(2,radius*.25);reengageRadius=value.reengageRadius??Math.max(0,radius-1.5);
      if(![returnRadius,reengageRadius].every(v=>Number.isFinite(v)&&v>=0&&v<=radius))throw new Error('Invalid monster territory thresholds');
      center.x=x;center.z=z;state.enabled=true;
    },
    reset(position){
      if(!state.enabled)return;
      if(!position||![position.x,position.z].every(Number.isFinite)||distance(position,center)>radius+1e-6)throw new Error('Monster home must be inside its territory');
      home.copyFrom(position);target.copyFrom(position);ready=true;arrived=false;reason=null;innerTime=disengageRemaining=0;ambientTime=3+random()*2;ambientMoving=rising=settling=false;
      stood=encounter.brain.state!==restState;watchState=stood?idleState:restState;state.phase='ambient';state.engaged=false;noncombatPose();
    },
    bindBrain(brain){
      if(brains.has(brain))return;brains.add(brain);
      idleState=Number.isFinite(brain.durations.Circle_Watch_R5)?'Circle_Watch_R5':brain.state;
      walkState=[encounter.config?.animations?.walk,'Wolf_Walk_R5','Walking'].find(clip=>clip&&Number.isFinite(brain.durations[clip]));
      if(!walkState)throw new Error('Monster territory requires an existing walk clip');
      restState=encounter.regularWolfId!=='boar'&&Number.isFinite(brain.durations.Rest_Lie_R5)?'Rest_Lie_R5':idleState;
      riseState=restState==='Rest_Lie_R5'&&Number.isFinite(brain.durations.Rise_From_Lie_R5)?'Rise_From_Lie_R5':null;watchState=restState;
      const update=brain.update,hit=brain.hit;
      brain.hit=function(options){const hp=this.hp,accepted=hit.call(this,options);if(accepted&&this.hp<hp&&this.hp>0){if(settling){settling=false;if(!protectedReaction(this)&&this.state===riseState){rising=true;this.mode='rise';}}if(protectedReaction(this)||this.state!==riseState)rising=false;engage(lastPlayer??getPlayer());}return accepted;};
      brain.update=function(dt,range,alive){
        if(!state.enabled||!ready)return update.call(this,dt,range,alive);
        dt=Number.isFinite(dt)?Math.max(0,dt):0;
        if(protectedReaction(this)){
          rising=settling=false;const result=update.call(this,dt,range,true);
          if(state.phase!=='combat'){result.events.length=0;result.speed=0;noncombatPose();}
          return result;
        }
        if(rising){
          this.time=Math.min(this.durations[riseState],this.time+dt);this.flash=Math.max(0,(this.flash??0)-dt);
          if(this.time>=this.durations[riseState]){rising=false;stood=true;watchState=idleState;if(state.phase==='combat')nativeCombat();else noncombatPose();}
          return stopResult;
        }
        if(settling){
          this.time=Math.max(0,this.time-dt);this.flash=Math.max(0,(this.flash??0)-dt);
          if(this.time<=0){settling=false;stood=false;watchState=restState;noncombatPose();}
          return stopResult;
        }
        if(state.phase==='combat')return update.call(this,dt,range,alive);
        if(state.phase==='ambient'){
          ambientTime-=dt;
          if(ambientMoving&&(distance(encounter.actor.position,target)<=.25+1e-6||ambientTime<=0)){
            ambientMoving=false;ambientTime=3+random()*3;
            if(riseState&&stood&&random()<.65){
              // Reuse the existing rise keys in reverse only for peaceful
              // settling. Boar/bear never have riseState and keep standing.
              settling=true;this.start(riseState,'settle');this.time=this.durations[riseState];this.behavior='rest';encounter.lastRoot=null;encounter.lastSerial=null;
            }
          }
          else if(!ambientMoving&&ambientTime<=0){ambientMoving=chooseWander();ambientTime=ambientMoving?Math.max(4,wanderRadius/walkSpeed+2):2+random()*2;}
        }
        noncombatPose();this.flash=Math.max(0,(this.flash??0)-dt);
        if(rising||settling)return stopResult;
        const moving=this.mode==='move'&&!encounter.combat?.grabOwner;
        this.time=(this.time+dt*(moving?(encounter.balance?.locomotionPlaybackRate??1):1))%Math.max(.001,this.durations[this.state]??1);
        return moving?walkResult:stopResult;
      };
    },
    inspect:()=>({enabled:state.enabled,phase:state.phase,engaged:state.engaged,returning:controller.returning,arrived,reason,innerTime,disengageRemaining,ambientMoving,rising,settling,home:{x:home.x,y:home.y,z:home.z},target:{x:target.x,y:target.y,z:target.z},x:center.x,z:center.z,radius,combatRadius,wanderRadius,returnRadius,reengageRadius}),
  };
  encounter.update=function(dt,player){
    watchLook?.restore();
    const step=Number.isFinite(dt)?Math.max(0,dt):0,beforeYaw=this.actor?.rotation.y;check(player,step);
    const result=originalUpdate.call(this,dt,player);check(player);
    if(state.enabled&&ready&&state.phase!=='combat'){
      silence();
      // The native encounter faces an idle actor toward the player. Restore
      // the resting body heading; the existing neck/head pose owns its gaze.
      if(!protectedReaction(this.brain)&&this.brain.mode!=='move'&&Number.isFinite(beforeYaw))this.actor.rotation.y=beforeYaw;
    }
    return result;
  };
  encounter.alignPose=function(){
    watchLook?.restore();const result=originalAlign.call(this);
    if(state.enabled&&ready&&this.kind==='bear'&&this.bearSize)watchLook??=new MonsterWatchLook(this);
    watchLook?.apply();return result;
  };
  encounter.movementPlan=function(player,result,range){return state.enabled&&state.phase!=='combat'?motion:originalMotion.call(this,player,result,range);};
  encounter.poseAndContacts=function(player,result,sample,shield){check(player);if(state.enabled&&!state.engaged)silence();const hitStop=originalContacts.call(this,player,result,sample,shield);check(player);if(state.enabled&&!state.engaged)silence();return hitStop;};
  encounter.receiveBossHit=function(options){return state.enabled&&!state.engaged?false:originalReceive.call(this,options);};
  const startGrab=encounter.grab.start;encounter.grab.start=function(player,nodes,serial,critical){return state.enabled&&!state.engaged?false:startGrab.call(this,player,nodes,serial,critical);};
  controller.configure(territory);return controller;
}
