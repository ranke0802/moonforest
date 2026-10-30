import {Quaternion,Vector3} from '@babylonjs/core';
import {orderPoseNodes,refreshPoseMatrices} from './pose-matrices.js';
import {haloSpeedAt,windAt,shotWeight,smooth01,mourningMotionWeights,deathHaloSpeedAt,deathHaloAdvance,MOURNING_DEATH_SECONDS,MOURNING_DEATH_BLEND_SECONDS} from './mourning-motion-v2.js';

const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>v*v*(3-2*v),TAU=Math.PI*2;
const REACH=[[0,0],[.25,.08],[.72,.48],[1.18,1],[1.82,1],[2.08,.97],[2.60,.42],[3,0]];
export function castReach(t){for(let i=1;i<REACH.length;i++)if(t<=REACH[i][0]){const a=REACH[i-1],b=REACH[i];return a[1]+(b[1]-a[1])*smooth(clamp((t-a[0])/(b[0]-a[0])));}return 0;}
export function mourningMorphs({castTime=0,casting=false,castWeight,walkTime=0,gaitSeconds=2.4,gaitBlend=0,breathClock=0,breathing=true,dying=false,deathTime=0}={},out={}){
  const weight=Number.isFinite(castWeight)?castWeight:casting?smooth(clamp(Math.min(castTime/.18,(3-castTime)/.25))):0,reach=castReach(castTime),theta=walkTime/gaitSeconds*TAU,alive=dying?1-smooth01(deathTime/MOURNING_DEATH_BLEND_SECONDS):1;
  out.Cast_Palm_Cleanup=reach*weight;out.Cast_Elbow_Form=clamp((reach-.48)/.52)*weight;out.Hair_Cast_Wind=windAt(castTime)*weight;
  out.Breath_Rise=breathing?(.5+.5*Math.sin(breathClock*TAU/5.5))*alive:0;
  out.Bust_Settle=breathing?(.5+.5*Math.sin(theta*2-.6))*gaitBlend*alive:0;
  out.Bust_ArmFollow=breathing?(.5+.5*Math.sin(theta-.65))*gaitBlend*alive:0;
  const cry=dying?smooth01((deathTime-.30)/.65)*(1-smooth01((deathTime-2.10)/1)):0,settle=dying?smooth01((deathTime-2)/1.9):0;
  out.Death_Scream=cry;out.Death_Hair_Cry=cry*(1-settle);out.Death_Hair_Settle=settle;
  out.Death_Ground_Contact=dying?(.055*smooth01(deathTime/.65)+.13*smooth01((deathTime-.60)/2.5))/.185:0;
  out.Death_Ground_Early=dying?smooth01(deathTime/.65)*(1-smooth01((deathTime-1.5)/1.4)):0;return out;
}

// Varying transform channels are LINEAR. Cache constant channels and sample
// into reusable vectors: no AnimationGroup instances or per-frame key searches.
export function makeTrack(animation){
  const keys=animation.getKeys(),quaternion=animation.targetProperty==='rotationQuaternion';
  const constant=keys.every(k=>k.value.equals(keys[0].value));
  return {keys,quaternion,constant,fps:animation.framePerSecond,index:0,value:keys[0].value.clone(),
    sample(time){
      if(this.constant)return this.keys[0].value;
      const f=time*this.fps,k=this.keys;
      if(f<k[this.index].frame)this.index=0;
      while(this.index<k.length-2&&f>k[this.index+1].frame)this.index++;
      const a=k[this.index],b=k[this.index+1],t=clamp((f-a.frame)/Math.max(1e-9,b.frame-a.frame));
      if(this.quaternion)Quaternion.SlerpToRef(a.value,b.value,t,this.value);else Vector3.LerpToRef(a.value,b.value,t,this.value);
      return this.value;
    }};
}
function channels(group){return group.targetedAnimations.filter(t=>['position','rotationQuaternion','scaling'].includes(t.animation.targetProperty)).map(({target,animation})=>({target,property:animation.targetProperty,track:makeTrack(animation)}));}
const key=c=>c.target.uniqueId+':'+c.property;
const MIX_ORDER=['walk','cast','idle','hit'];
const HIT_PULSE_SECONDS=.38,HIT_PULSE_SOURCE_SECONDS=.65;
function applyWeighted(channel,times,weights,hair=false){
  const out=channel.target[channel.property];let total=0;
  // Match the reference action order: walk, cast, idle, hit. Zero-weight tracks
  // do not sample or allocate, including the two new clips during a full cast.
  for(const name of MIX_ORDER){
    const weight=weights[name];if(weight<=0)continue;
    const value=channel[name].sample(hair&&name==='walk'?times.hairTime:times[name+'Time']);
    if(total===0)out.copyFrom(value);
    else if(channel.property==='rotationQuaternion')Quaternion.SlerpToRef(out,value,weight/(total+weight),out);
    else Vector3.LerpToRef(out,value,weight/(total+weight),out);
    total+=weight;
  }
}

/** r9 playback: independent living actions and a real-time, once-only death. */
export class MourningElenaAnimator {
  constructor(asset,config,actor){
    this.asset=asset;this.config=config;this.actor=actor;this.current='idle';this.castTime=0;this.walkTime=0;this.hairTime=0;this.breathClock=0;this.haloTime=0;this.gaitBlend=0;this.gaitRate=2;this.accumulator=0;this.sampleInterval=0;this.samples=0;
    this.deathDuration=MOURNING_DEATH_SECONDS;this.durations={idle:6,walk:2.4,cast:3,hit:1.3,dead:this.deathDuration};this.gaitSeconds=config.gaitSeconds??2.4;
    for(const group of asset.animationGroups)group.stop();
    const group=n=>{const g=asset.animationGroups.find(g=>g.name===n);if(!g)throw new Error('마녀 동작 누락: '+n);return g;};
    const walk=channels(group('Chimera_Organic_Walk_2p4s'));
    const maps=Object.fromEntries([['cast','Chimera_Arcane_Cast_3s'],['idle','Chimera_Prayer_Idle_6s'],['hit','Chimera_Hit_Reaction_1p3s']].map(([name,clip])=>[name,new Map(channels(group(clip)).map(c=>[key(c),c.track]))]));
    const combined=walk.map(c=>({...c,walk:c.track,cast:maps.cast.get(key(c))??c.track,idle:maps.idle.get(key(c))??c.track,hit:maps.hit.get(key(c))??c.track}));
    const dead=channels(group('Chimera_Death_Lament_5p2s'));
    this.deathChannels=dead.map(c=>({...c,from:c.target[c.property].clone()}));
    this.deathFromWeights={walk:0,cast:0,idle:1,hit:0};
    this.hair=combined.filter(c=>c.target.name.startsWith('DEF_Hair_'));
    this.body=combined.filter(c=>!c.target.name.startsWith('DEF_Hair_'));
    // Constant identical translations/scales never need writing again.
    this.fixed=this.body.filter(c=>MIX_ORDER.every(name=>c[name].constant&&c.walk.keys[0].value.equals(c[name].keys[0].value)));
    this.body=this.body.filter(c=>!this.fixed.includes(c));
    // A normal weapon hit is a visual recoil, not a gameplay stagger. Reuse
    // the authored hit's rotational delta; legs, root and arm channels stay on
    // their current action. During a cast only the neck/head receive the delta,
    // preserving the prayer clasp, casting palm and their corrective morphs.
    this.hitOverlay=combined.filter(c=>c.property==='rotationQuaternion'&&['DEF_Spine','DEF_Chest','DEF_Neck','DEF_Head'].includes(c.target.name)&&!c.hit.constant).map(c=>({
      target:c.target,track:c.hit,castSafe:c.target.name==='DEF_Neck'||c.target.name==='DEF_Head',
      inverse:c.hit.keys[0].value.clone().conjugate(),delta:Quaternion.Identity(),weighted:Quaternion.Identity(),
    }));
    this.hitIdentity=Quaternion.Identity();
    this.halo=channels(group('Halo_Slow_Orbit_48s'));
    this.poseNodes=orderPoseNodes([...asset.transformNodes,...asset.meshes]);
    const poseSet=new Set(this.poseNodes);this.poseParents=[...new Set(this.poseNodes.map(n=>n.parent).filter(p=>p&&!poseSet.has(p)))];this.refreshPose();
    const up=new Vector3(0,1,0),down=new Vector3(0,-1,0);
    this.cloth=asset.transformNodes.flatMap(bone=>{
      const m=bone.name.match(/^DEF_HaloCloth_(\d+)_(\d+)$/);if(!m)return [];
      const q=bone.absoluteRotationQuaternion.clone(),direction=up.applyRotationQuaternion(q),tilt=Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(direction,down,tilt);
      const baseWorld=tilt.multiply(q);return [{bone,baseWorld,worldQ:baseWorld.clone(),chain:Number(m[1])-1,segment:Number(m[2])-1}];
    }).sort((a,b)=>a.chain-b.chain||a.segment-b.segment);
    this.morphs=[];
    for(const manager of new Set(asset.meshes.map(m=>m.morphTargetManager).filter(Boolean)))for(let i=0;i<manager.numTargets;i++)this.morphs.push(manager.getTarget(i));
    this.mouthMeshes=asset.meshes.filter(mesh=>mesh.name.includes('Lament_Mouth_Interior')&&!mesh.metadata?.moonforestOutline);
    this.morphState={gaitSeconds:this.gaitSeconds,breathing:true};this.morphValues={};
    this.scratch={direction:new Vector3(),down:new Vector3(0,-1,0),tilt:Quaternion.Identity(),world:Quaternion.Identity(),local:Quaternion.Identity(),inverse:Quaternion.Identity()};
    for(const c of this.fixed)c.target[c.property].copyFrom(c.track.keys[0].value);
    this.reset();
  }
  reset(){
    Object.assign(this,{current:'idle',castTime:0,walkTime:0,hairTime:0,idleTime:0,hitTime:0,breathClock:0,haloTime:0,haloSpeed:1,gaitBlend:0,gaitRate:this.config.motion?.defaultGaitRate??2,accumulator:0,staggerRemaining:0,hitActive:false,hitReleaseWeight:0,hitReleaseTime:0,interruptCastWeight:0,interruptHaloSpeed:1,hitPulseTime:HIT_PULSE_SECONDS,hitPulseWeight:0,hitPulseCount:0,clothInitialized:false,disposed:false,actionId:null,deathTime:0,deathWeight:0,deathStarted:false});
    for(const c of this.fixed)c.target[c.property].copyFrom(c.track.keys[0].value);
    this.sample(0);return this;
  }
  transition(state,{clipTime=0,actionId=null,staggerRemaining=0}={}){
    this.disposed=false;
    if(state==='dead'){
      if(!this.deathStarted){
        for(const c of this.deathChannels)c.from.copyFrom(c.target[c.property]);
        for(const name of MIX_ORDER)this.deathFromWeights[name]=this.weights?.[name]??(name==='idle'?1:0);
        this.deathTime=0;this.deathWeight=0;this.deathStarted=true;this.accumulator=0;
        this.hitActive=false;this.hitReleaseWeight=0;this.hitPulseTime=HIT_PULSE_SECONDS;this.hitPulseWeight=0;this.staggerRemaining=0;
      }
      this.current='dead';this.actionId=actionId;return;
    }
    // Resurrection is explicit: stray living transitions cannot restart a corpse.
    if(this.deathStarted)return;
    const remaining=Math.max(0,Number.isFinite(staggerRemaining)?staggerRemaining:0),explicit=state==='hit';
    const wasBusy=this.current==='cast'||this.hitActive;
    if((remaining>0&&this.staggerRemaining<=0)||(explicit&&!this.hitActive&&this.current!=='hit')){
      this.interruptCastWeight=this.current==='cast'?shotWeight(this.castTime,3,.18,.25):0;
      this.interruptHaloSpeed=this.haloSpeed;this.hitTime=0;this.hitActive=true;this.hitReleaseWeight=0;
      this.hitPulseTime=HIT_PULSE_SECONDS;this.hitPulseWeight=0;
    }else if(this.hitActive&&!explicit&&remaining<=0){
      // The gameplay timer owns recovery. Only a short pose fade remains, never
      // an extra movement/attack lock to finish the full authored hit clip.
      this.hitReleaseWeight=shotWeight(this.hitTime,1.3,.07,.24);this.hitReleaseTime=0;this.hitActive=false;this.interruptCastWeight=0;
    }
    this.staggerRemaining=remaining;
    if(wasBusy&&state!=='cast'&&!this.hitActive)this.walkTime=0;
    this.current=state;if(state==='cast'&&!this.hitActive)this.castTime=clipTime;
    this.actionId=actionId;this.disposed=false;
  }
  reactToHit(){
    if(this.disposed||this.current==='dead'||this.hitActive)return false;
    this.hitPulseTime=0;this.hitPulseCount++;return true;
  }
  update(dt){
    if(this.disposed)return;
    dt=Math.max(0,Number.isFinite(dt)?dt:0);const moving=this.current==='walk'&&!this.hitActive,dead=this.current==='dead';
    if(dead){
      if(this.deathFinished)return;
      const previous=this.deathTime,elapsed=previous+dt;this.deathTime=elapsed>=this.deathDuration-1e-9?this.deathDuration:elapsed;
      this.haloSpeed=deathHaloSpeedAt(this.deathTime);this.haloTime=(this.haloTime+deathHaloAdvance(previous,this.deathTime))%48;
      this.sample(dt);return;
    }
    this.gaitBlend+=(Number(moving)-this.gaitBlend)*(1-Math.exp(-7*dt));if(moving)this.walkTime=(this.walkTime+dt*this.gaitRate)%this.gaitSeconds;
    this.hairTime=(this.hairTime+dt*this.gaitRate)%this.gaitSeconds;this.idleTime=(this.idleTime+dt)%6;this.breathClock+=dt;
    if(this.hitActive)this.hitTime=Math.min(1.3,this.hitTime+dt);else this.hitReleaseTime+=dt;
    const pulsing=this.hitPulseTime<HIT_PULSE_SECONDS;
    this.hitPulseTime=Math.min(HIT_PULSE_SECONDS,this.hitPulseTime+dt);
    this.haloSpeed=this.current==='cast'&&!this.hitActive?haloSpeedAt(this.castTime):this.hitActive?1+(this.interruptHaloSpeed-1)*(1-smooth01(this.hitTime/.25)):1;
    this.haloTime=(this.haloTime+dt*this.haloSpeed)%48;
    this.accumulator+=dt;
    // Engaged/casting characters always sample every frame; distant residents may use 15/30 Hz.
    if(this.current!=='cast'&&!this.hitActive&&!pulsing&&this.accumulator<this.sampleInterval)return;
    const step=this.accumulator;this.accumulator=0;this.sample(step);
  }
  sample(dt){
    if(this.current==='dead'){this.sampleDeath(dt);return;}
    const casting=this.current==='cast'&&!this.hitActive;
    this.weights=mourningMotionWeights(this,casting,this.weights);
    for(const c of this.body)applyWeighted(c,this,this.weights);
    this.applyHitPulse(casting);
    for(const c of this.hair)applyWeighted(c,this,this.weights,true);
    for(const c of this.halo)c.target[c.property].copyFrom(c.track.sample(this.haloTime));
    this.applyMorphs(casting,false);
    this.refreshPose();this.applyCloth(dt);this.samples++;
  }
  applyMorphs(casting,dying){
    const state=this.morphState;state.castTime=this.castTime;state.casting=casting;state.castWeight=this.weights.cast;state.walkTime=this.walkTime;state.gaitBlend=this.gaitBlend;state.breathClock=this.breathClock;state.dying=dying;state.deathTime=this.deathTime;
    const values=mourningMorphs(state,this.morphValues);
    for(const target of this.morphs)if(values[target.name]!==undefined)target.influence=values[target.name];
    // The authored mouth is a degenerate point at rest. Skip its draw entirely;
    // a local enabled gate cannot be undone by range/FoW visibility restoration.
    for(const mesh of this.mouthMeshes)mesh.setEnabled(values.Death_Scream>.0001);
  }
  sampleDeath(dt){
    const weight=this.deathWeight=smooth01(this.deathTime/MOURNING_DEATH_BLEND_SECONDS);
    for(const name of MIX_ORDER)this.weights[name]=this.deathFromWeights[name]*(1-weight);
    for(const c of this.deathChannels){
      const to=c.track.sample(this.deathTime),out=c.target[c.property];
      if(c.property==='rotationQuaternion')Quaternion.SlerpToRef(c.from,to,weight,out);else Vector3.LerpToRef(c.from,to,weight,out);
    }
    for(const c of this.halo)c.target[c.property].copyFrom(c.track.sample(this.haloTime));
    this.applyMorphs(false,true);
    this.refreshPose();this.applyCloth(dt);this.samples++;
  }
  applyHitPulse(casting){
    this.hitPulseWeight=this.hitActive?0:shotWeight(this.hitPulseTime,HIT_PULSE_SECONDS,.04,.10);
    if(this.hitPulseWeight<=0)return;
    const time=this.hitPulseTime/HIT_PULSE_SECONDS*HIT_PULSE_SOURCE_SECONDS;
    for(const c of this.hitOverlay){
      if(casting&&!c.castSafe)continue;
      c.inverse.multiplyToRef(c.track.sample(time),c.delta);
      Quaternion.SlerpToRef(this.hitIdentity,c.delta,this.hitPulseWeight,c.weighted);
      c.target.rotationQuaternion.multiplyToRef(c.weighted,c.target.rotationQuaternion);
      c.target.rotationQuaternion.normalize();
    }
  }
  refreshPose(){
    // AI can relocate the actor within the same render ID. Invalidate the two
    // external anchors as well as the imported hierarchy before world-space cloth.
    this.actor.markAsDirty();this.actor.computeWorldMatrix();
    for(const parent of this.poseParents){parent.markAsDirty();parent.computeWorldMatrix();}
    refreshPoseMatrices(this.poseNodes);
  }
  applyCloth(dt){
    const s=this.scratch,down=s.down,yaw=this.actor.absoluteRotationQuaternion;
    for(const c of this.cloth){
      s.direction.set(.045*Math.sin(this.breathClock*TAU/8-c.segment*.5+c.chain),-1,-.075-.025*Math.sin(this.breathClock*TAU/12-c.segment*.6+c.chain)).normalize();
      Quaternion.FromUnitVectorsToRef(down,s.direction,s.tilt);
      yaw.multiplyToRef(s.tilt,s.world);s.world.multiplyToRef(c.baseWorld,s.world);
      Quaternion.SlerpToRef(c.worldQ,s.world,this.clothInitialized?1-Math.exp(-8*dt):1,c.worldQ);
      // Smooth only the world target. Parent rotation is compensated instantly,
      // including halo changes in the same render ID, as in the r9 viewer.
      c.bone.parent.absoluteRotationQuaternion.conjugateToRef(s.inverse);s.inverse.multiplyToRef(c.worldQ,c.bone.rotationQuaternion);
      c.bone.markAsDirty();c.bone.computeWorldMatrix();
    }
    this.clothInitialized=true;
  }
  dispose(){this.disposed=true;}
  get deathFinished(){return this.deathStarted&&this.deathTime>=this.deathDuration;}
  get finished(){return this.deathFinished;}
  inspect(){return {state:this.current,castTime:this.castTime,walkTime:this.walkTime,idleTime:this.idleTime,hitTime:this.hitTime,hitActive:this.hitActive,hitPulseWeight:this.hitPulseWeight,hitPulseTime:this.hitPulseTime,hitPulseCount:this.hitPulseCount,haloTime:this.haloTime,haloSpeed:this.haloSpeed,deathTime:this.deathTime,deathDuration:this.deathDuration,deathWeight:this.deathWeight,deathFinished:this.deathFinished,finished:this.finished,weights:this.weights,samples:this.samples,dynamicChannels:this.body.length,constantChannels:this.fixed.length,deathChannels:this.deathChannels.length,interval:this.sampleInterval,morphs:Object.fromEntries(this.morphs.map(m=>[m.name,m.influence]))};}
}
