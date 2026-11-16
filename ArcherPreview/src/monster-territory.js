import {Vector3} from '@babylonjs/core';

const reactions=new Set(['down','recover','hit','dead']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Opt-in authored territories use normal encounter locomotion/navigation. They
// own no clock, player transform, health reset, model change or global AI rule.
export function installMonsterTerritory(encounter,territory,{walkSpeed=1}={}){
  if(!Number.isFinite(walkSpeed)||walkSpeed<=0)throw new Error('Invalid monster territory walk speed');
  const center={x:0,z:0},home=new Vector3(),motion={target:home,stopDistance:0},brains=new WeakSet(),walkResult={events:[],speed:walkSpeed},stopResult={events:[],speed:0};
  let enabled=false,radius=0,returnRadius=0,reengageRadius=0,returning=false,ready=false,arrived=false,reason=null,walkState,idleState;
  const originalUpdate=encounter.update,originalMotion=encounter.movementPlan,originalContacts=encounter.poseAndContacts,originalReceive=encounter.receiveBossHit;
  function protectedReaction(brain){return brain.hp<=0||brain.stagger>0||reactions.has(brain.mode);}
  function clearAttack(){
    const b=encounter.brain;if(!b)return;
    encounter.pendingEvents.length=0;encounter.gate?.reset();encounter.spell?.reset();
    if(encounter.ring)encounter.ring.isVisible=false;
    // Reset only this actor's capture. Another actor owns its own shared
    // control/reaction lease and must never be released by a territory exit.
    const owner=encounter.combat?.grabOwner;
    if(owner===encounter||(!owner&&encounter.grab?.active))encounter.grab?.reset();
    encounter.v02Ram?.reset();encounter.v02RamPhase=null;encounter.v02ContactSerial=null;encounter.v02ResolvedSerial=null;
    b.cancelBout?.();b.plannedId=b.stalkPlannedId=b.followupId=null;b.followChain=false;b.chainRemaining=0;
    if(!protectedReaction(b)){b.start(walkState,'move');b.behavior='territory-return';}
    encounter.lastRoot=null;encounter.lastSerial=null;encounter.routeState={};
  }
  function check(player){
    const b=encounter.brain;if(!ready||!encounter.active||!b||b.hp<=0||!player?.position)return returning;
    const actorOutside=distance(encounter.actor.position,center)>radius,playerOutside=distance(player.position,center)>radius;
    if(!returning&&(actorOutside||playerOutside)){returning=true;arrived=false;reason=actorOutside?'actor-left':'player-left';clearAttack();}
    if(returning){
      arrived=distance(encounter.actor.position,home)<=returnRadius+1e-6;
      if(arrived&&!actorOutside&&distance(player.position,center)<=reengageRadius&&!protectedReaction(b)){
        returning=false;reason=null;encounter.routeState={};encounter.lastRoot=null;encounter.lastSerial=null;
        if(b.beginStalk)b.beginStalk();else{b.start(idleState,'idle');b.wait=Math.max(.35,b.wait??0);}
      }
    }
    return returning;
  }
  const controller={
    get returning(){return returning;},
    configure(value){
      enabled=ready=returning=arrived=false;reason=null;if(!value)return;
      const {x,z}=value;radius=value.radius;
      if(![x,z,radius].every(Number.isFinite)||radius<=0)throw new Error('Invalid monster territory');
      returnRadius=value.returnRadius??Math.min(2,radius*.25);reengageRadius=value.reengageRadius??Math.max(0,radius-1.5);
      if(![returnRadius,reengageRadius].every(v=>Number.isFinite(v)&&v>=0&&v<=radius))throw new Error('Invalid monster territory thresholds');
      center.x=x;center.z=z;motion.stopDistance=returnRadius;enabled=true;
    },
    reset(position){
      if(!enabled)return;
      if(!position||![position.x,position.z].every(Number.isFinite)||distance(position,center)>radius+1e-6)throw new Error('Monster home must be inside its territory');
      home.copyFrom(position);ready=true;returning=arrived=false;reason=null;
    },
    bindBrain(brain){
      if(brains.has(brain))return;brains.add(brain);idleState=brain.state;
      walkState=[encounter.config?.animations?.walk,'Wolf_Walk_R5','Walking'].find(state=>state&&Number.isFinite(brain.durations[state]));
      if(!walkState)throw new Error('Monster territory requires an existing walk clip');
      const update=brain.update;
      brain.update=function(dt,range,alive){
        if(!returning)return update.call(this,dt,range,alive);
        dt=Number.isFinite(dt)?Math.max(0,dt):0;
        if(protectedReaction(this)){
          const result=update.call(this,dt,range,true);result.events.length=0;result.speed=0;
          // A completed get-up may normally choose a player-centred orbit.
          // Keep that one transition frame under homeward movement ownership.
          if(!protectedReaction(this)){this.start(arrived?idleState:walkState,arrived?'idle':'move');this.behavior='territory-return';}
          return result;
        }
        this.flash=Math.max(0,(this.flash??0)-dt);
        const moving=!arrived&&!encounter.combat?.grabOwner,state=moving?walkState:idleState,mode=moving?'move':'idle';
        if(this.state!==state||this.mode!==mode)this.start(state,mode);
        this.behavior='territory-return';
        this.time=(this.time+dt*(moving?(encounter.balance?.locomotionPlaybackRate??1):1))%Math.max(.001,this.durations[state]??1);
        return moving?walkResult:stopResult;
      };
    },
    inspect:()=>({enabled,returning,arrived,reason,home:{x:home.x,y:home.y,z:home.z},x:center.x,z:center.z,radius,returnRadius,reengageRadius}),
  };
  encounter.update=function(dt,player){check(player);const result=originalUpdate.call(this,dt,player);check(player);return result;};
  encounter.movementPlan=function(player,result,range){return returning?motion:originalMotion.call(this,player,result,range);};
  encounter.poseAndContacts=function(player,result,sample,shield){check(player);if(returning)this.pendingEvents.length=0;const hitStop=originalContacts.call(this,player,result,sample,shield);if(!returning)check(player);return hitStop;};
  encounter.receiveBossHit=function(options){return returning?false:originalReceive.call(this,options);};
  controller.configure(territory);
  return controller;
}
