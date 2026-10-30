import {Quaternion,Vector3} from '@babylonjs/core';
import {orderPoseNodes,refreshPoseMatrices} from './pose-matrices.js';

const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>v*v*(3-2*v),TAU=Math.PI*2;
const REACH=[[0,0],[.25,.08],[.72,.48],[1.18,1],[1.82,1],[2.08,.97],[2.60,.42],[3,0]];
export function castReach(t){for(let i=1;i<REACH.length;i++)if(t<=REACH[i][0]){const a=REACH[i-1],b=REACH[i];return a[1]+(b[1]-a[1])*smooth(clamp((t-a[0])/(b[0]-a[0])));}return 0;}
export function mourningMorphs({castTime=0,casting=false,walkTime=0,gaitSeconds=2.4,gaitBlend=0,breathClock=0,breathing=true}={}){
  const weight=casting?smooth(clamp(Math.min(castTime/.18,(3-castTime)/.25))):0,reach=castReach(castTime),theta=walkTime/gaitSeconds*TAU;
  return {Cast_Palm_Cleanup:reach*weight,Cast_Elbow_Form:clamp((reach-.48)/.52)*weight,
    Breath_Rise:breathing?.5+.5*Math.sin(breathClock*TAU/5.5):0,
    Bust_Settle:breathing?(.5+.5*Math.sin(theta*2-.6))*gaitBlend:0,
    Bust_ArmFollow:breathing?(.5+.5*Math.sin(theta-.65))*gaitBlend:0};
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
function applyBlend(channel,a,b,weight){const out=channel.target[channel.property];if(channel.property==='rotationQuaternion')Quaternion.SlerpToRef(a,b,weight,out);else Vector3.LerpToRef(a,b,weight,out);}

/** Port of tripo-move.js r7, with separate gait, cast, hair, morph and gravity clocks. */
export class MourningElenaAnimator {
  constructor(asset,config,actor){
    this.asset=asset;this.config=config;this.actor=actor;this.current='idle';this.castTime=0;this.walkTime=0;this.hairTime=0;this.breathClock=0;this.haloTime=0;this.gaitBlend=0;this.gaitRate=2;this.accumulator=0;this.sampleInterval=0;this.samples=0;
    this.durations={idle:2.4,walk:2.4,cast:3,dead:2.4};this.gaitSeconds=config.gaitSeconds??2.4;
    for(const group of asset.animationGroups)group.stop();
    const group=n=>{const g=asset.animationGroups.find(g=>g.name===n);if(!g)throw new Error('마녀 동작 누락: '+n);return g;};
    const walk=channels(group('Chimera_Organic_Walk_2p4s')),cast=channels(group('Chimera_Arcane_Cast_3s')),casts=new Map(cast.map(c=>[key(c),c]));
    this.hair=walk.filter(c=>c.target.name.startsWith('DEF_Hair_')).map(c=>({...c,rest:c.target[c.property].clone()}));
    this.body=walk.filter(c=>!c.target.name.startsWith('DEF_Hair_')).map(c=>({...c,cast:casts.get(key(c))?.track??c.track}));
    // Constant identical translations/scales never need writing again.
    this.fixed=this.body.filter(c=>c.track.constant&&c.cast.constant&&c.track.keys[0].value.equals(c.cast.keys[0].value));
    this.body=this.body.filter(c=>!this.fixed.includes(c));
    this.halo=channels(group('Halo_Slow_Orbit_48s'));
    this.poseNodes=orderPoseNodes([...asset.transformNodes,...asset.meshes]);
    const poseSet=new Set(this.poseNodes);this.poseParents=[...new Set(this.poseNodes.map(n=>n.parent).filter(p=>p&&!poseSet.has(p)))];this.refreshPose();
    const up=new Vector3(0,1,0),down=new Vector3(0,-1,0);
    this.cloth=asset.transformNodes.flatMap(bone=>{
      const m=bone.name.match(/^DEF_HaloCloth_(\d+)_(\d+)$/);if(!m)return [];
      const q=bone.absoluteRotationQuaternion.clone(),direction=up.applyRotationQuaternion(q),tilt=Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(direction,down,tilt);
      return [{bone,baseWorld:tilt.multiply(q),chain:Number(m[1])-1,segment:Number(m[2])-1}];
    }).sort((a,b)=>a.chain-b.chain||a.segment-b.segment);
    this.morphs=[];
    for(const manager of new Set(asset.meshes.map(m=>m.morphTargetManager).filter(Boolean)))for(let i=0;i<manager.numTargets;i++)this.morphs.push(manager.getTarget(i));
    this.scratch={direction:new Vector3(),down:new Vector3(0,-1,0),tilt:Quaternion.Identity(),world:Quaternion.Identity(),local:Quaternion.Identity(),inverse:Quaternion.Identity()};
    this.clothInitialized=false;this.disposed=false;
    for(const c of this.fixed)c.target[c.property].copyFrom(c.track.keys[0].value);
    this.sample(0);
  }
  transition(state,{clipTime=0,actionId=null}={}){
    if(this.current==='cast'&&state!=='cast')this.walkTime=0;
    this.current=state;this.castTime=clipTime;this.actionId=actionId;this.disposed=false;
  }
  update(dt){
    if(this.disposed)return;
    dt=Math.max(0,Number.isFinite(dt)?dt:0);const moving=this.current==='walk',dead=this.current==='dead';
    if(!dead){this.gaitBlend+=(Number(moving)-this.gaitBlend)*(1-Math.exp(-7*dt));if(moving)this.walkTime=(this.walkTime+dt*this.gaitRate)%this.gaitSeconds;this.hairTime=(this.hairTime+dt*this.gaitRate)%this.gaitSeconds;this.breathClock+=dt;this.haloTime=(this.haloTime+dt)%48;}
    this.accumulator+=dt;
    // Engaged/casting characters always sample every frame; distant residents may use 15/30 Hz.
    if(this.current!=='cast'&&this.accumulator<this.sampleInterval)return;
    const step=this.accumulator;this.accumulator=0;this.sample(step);
  }
  sample(dt){
    const casting=this.current==='cast',w=casting?smooth(clamp(Math.min(this.castTime/.18,(3-this.castTime)/.25))):0;
    for(const c of this.body)applyBlend(c,c.track.sample(this.walkTime),c.cast.sample(this.castTime),w);
    for(const c of this.hair)applyBlend(c,c.rest,c.track.sample(this.hairTime),.3+.7*this.gaitBlend);
    for(const c of this.halo)c.target[c.property].copyFrom(c.track.sample(this.haloTime));
    const values=mourningMorphs({castTime:this.castTime,casting,walkTime:this.walkTime,gaitSeconds:this.gaitSeconds,gaitBlend:this.gaitBlend,breathClock:this.breathClock});
    for(const target of this.morphs)if(values[target.name]!==undefined)target.influence=values[target.name];
    this.refreshPose();this.applyCloth(dt);this.samples++;
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
      c.bone.parent.absoluteRotationQuaternion.conjugateToRef(s.inverse);s.inverse.multiplyToRef(s.world,s.local);
      Quaternion.SlerpToRef(c.bone.rotationQuaternion,s.local,this.clothInitialized?1-Math.exp(-8*dt):1,c.bone.rotationQuaternion);
      c.bone.markAsDirty();c.bone.computeWorldMatrix();
    }
    this.clothInitialized=true;
  }
  dispose(){this.disposed=true;}
  inspect(){return {state:this.current,castTime:this.castTime,walkTime:this.walkTime,samples:this.samples,dynamicChannels:this.body.length,constantChannels:this.fixed.length,interval:this.sampleInterval,morphs:Object.fromEntries(this.morphs.map(m=>[m.name,m.influence]))};}
}
