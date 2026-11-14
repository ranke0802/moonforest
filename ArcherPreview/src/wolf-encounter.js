import {Quaternion,Vector3} from '@babylonjs/core';
import {BossEncounter} from './boss-encounter.js';
import {WolfAnimator} from './wolf-animation.js';
import {WolfGrab} from './wolf-grab.js';
import {WolfBrain,WOLF_BALANCE,WOLF_BY_NAME,WOLF_SCALE} from './wolf-spec.js';
import {applyMonsterToon} from './monster-toon.js';
import {playerDimensions} from './player-dimensions.js';

export class WolfEncounter extends BossEncounter{
 constructor(...args){super(...args);this.kind='wolf';this.displayName='우두머리 늑대';this.retainAnimatorForPool=true;this.balance=WOLF_BALANCE;this.radius=this.balance.radius;this.separationRadius=this.balance.separationRadius;this.stopDistance=this.balance.stopDistance;this.renderRangePadding=3*WOLF_SCALE;this.inverseRoot=Quaternion.Identity();this.offset=new Vector3();
  this.grab=new WolfGrab(captured=>{if(captured)this.combat.grabOwner=this;else if(this.combat.grabOwner===this)this.combat.grabOwner=null;this.playerReaction.cancelRecoil();this.gate.reset();this.onPlayerHit(0,{captured});},()=>{this.hitPlayer(this.balance.pinDamage,this.actor.position,{grabImpact:true});if(!this.playerAlive)this.grab.reset();});
 }
 createBrain(durations){return new WolfBrain(durations,this.balance);}
 createAnimator(){return new WolfAnimator(this.asset,this.config);}
 preparePaint(){applyMonsterToon(this.asset);for(const mesh of this.asset.meshes)mesh.metadata={...mesh.metadata,characterStyleOverrideGroup:'wolf'};}
 motionSpec(name){return WOLF_BY_NAME[name];}
 attackRange(spec){return spec?.range??this.balance.biteRange;}
 attackDamage(){return this.balance.biteDamage;}
 isHeavyAttack(){return false;}
 async findSummonPosition(position,radius,limit,occupied,preparation){
  const navigation=this.movementNavigation;
  try{return navigation.findFree(position,radius,limit,occupied);}
  catch(error){
   // Large manual groups can fill the nearby cave passage. Extend only spawn
   // lookup, never movement/constrain (which must not teleport a live actor).
   if(!this.world.cave&&this.world.mapId!=='witch-cave')throw error;
   const work=this.extendedSpawnWork(position,radius,limit,occupied);
   return preparation.run(work);
  }
 }
 *extendedSpawnWork(center,radius,limit,occupied){
  const navigation=this.movementNavigation,spacing=radius*2+.12;let checked=0;
  for(let ring=23;ring<=2*limit+Math.hypot(center.x,center.z);ring+=Math.max(1,radius)){
   const count=Math.min(512,Math.max(48,Math.ceil(2*Math.PI*ring/spacing)));
   for(let i=0;i<count;i++){
    const angle=2*Math.PI*i/count,q={x:center.x+Math.cos(angle)*ring,z:center.z+Math.sin(angle)*ring};
    if(navigation.free(q,radius,limit)&&occupied.every(o=>Math.hypot(q.x-o.x,q.z-o.z)>=radius+(o.radius??radius)+.12))return q;
    if(++checked%64===0)yield;
   }
  }
  throw new Error('우두머리 늑대를 놓을 안전한 동굴 공간이 없습니다. 소환 수를 줄여 주세요.');
 }
 movementPlan(player,result){
  if(!result.retreat)return super.movementPlan(player,result);
  this.retreatTarget??=new Vector3();this.retreatTarget.copyFrom(this.actor.position).subtractInPlace(player.position);this.retreatTarget.y=0;
  if(this.retreatTarget.lengthSquared()<1e-8)this.retreatTarget.set(-Math.sin(this.actor.rotation.y),0,-Math.cos(this.actor.rotation.y));
  this.retreatTarget.normalize().scaleInPlace(this.balance.lungeDistance).addInPlace(player.position);return {target:this.retreatTarget,stopDistance:0};
 }
 warningTerrain(){return this.wolfWarningTerrain??={heightAt:(x,z)=>this.world.terrain?.heightAt?.(x,z)??0};}
 update(dt,player){if(this.grab.active&&!this.playerAlive)this.grab.reset();super.update(dt,player);}
 applyMotionRoot(root){
  const clip=this.config.catalog.find(c=>c.name===this.brain.state),time=this.brain.time;
  if(this.lastSerial!==this.brain.serial||this.wolfClip!==clip.name){this.wolfClip=clip.name;this.motionYaw=this.knockTurn?this.knockTurn.start+this.knockTurn.delta:this.actor.rotation.y;this.previousWolfTime=0;this.lastRoot=clip.rootTrack[0];}
  // Locomotion is game-owned at the authored 0.9/4.2 m/s. Other authored
  // planar paths have exactly one owner, with wrap/seek discontinuities reset.
  if(time>=this.previousWolfTime&&this.lastRoot&&!this.brain.stagger&&this.brain.mode!=='move'){
   const x=(root[0]-this.lastRoot[0])*this.config.scale,z=(root[2]-this.lastRoot[2])*this.config.scale,yaw=this.motionYaw;
   this.actor.position.x+=x*Math.cos(yaw)+z*Math.sin(yaw);this.actor.position.z+=z*Math.cos(yaw)-x*Math.sin(yaw);
  }
  const yawTrack=clip.yawTrack;if(yawTrack?.length&&this.brain.mode!=='move'&&!this.knockTurn){const f=Math.max(0,Math.min(yawTrack.length-1,time*clip.fps)),i=Math.floor(f),j=Math.min(i+1,yawTrack.length-1),a=yawTrack[i],b=yawTrack[j];this.actor.rotation.y=this.motionYaw+a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*(f-i)-yawTrack[0];}
  this.previousWolfTime=time;
 }
 alignPose(){
  // Cancel ONLY the sampled root's planar transform in a carrier. Preserve
  // every pelvis/chest translation, including R8's authored airborne height.
  const root=this.animator.root,q=root.rotationQuaternion,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));Quaternion.RotationYawPitchRollToRef(-yaw,0,0,this.inverseRoot);this.carrier.rotationQuaternion??=Quaternion.Identity();this.carrier.rotationQuaternion.copyFrom(this.inverseRoot);
  this.offset.set(-root.position.x,0,-root.position.z);this.offset.rotateByQuaternionToRef(this.inverseRoot,this.offset);this.carrier.position.copyFrom(this.offset);this.actor.computeWorldMatrix(true);this.carrier.computeWorldMatrix(true);
  // Babylon's imported __root__ is a Mesh, not a TransformNode. Refresh it
  // before bone nodes when correcting twice within one engine render frame.
  this.animator.ensurePoseCurrent();
  return true;
 }
 hurtCapsules(){const pairs=[['pelvis','chest',.34],['chest','neck',.32],['neck','head',.28],['fore.L.upper','fore.L.lower',.14],['fore.R.upper','fore.R.lower',.14],['hind.L.upper','hind.L.lower',.18],['hind.R.upper','hind.R.lower',.18]];return pairs.map(([a,b,r])=>({points:[this.nodes[a].getAbsolutePosition().asArray(),this.nodes[b].getAbsolutePosition().asArray()],radius:r*this.config.scale}));}
 damageNumberPosition(){this.damageAnchor.copyFrom(this.nodes.chest.getAbsolutePosition());this.damageAnchor.y+=.45*this.config.scale;return this.damageAnchor;}
 attackContactPoints(aim){return ['jaw','head','fore.L.paw','fore.R.paw'].map(n=>this.nodes[n].getAbsolutePosition()).sort((a,b)=>Vector3.DistanceSquared(a,aim)-Vector3.DistanceSquared(b,aim));}
 attackBodyContact(event,aim,points){const low=this.player.position.y+.15,high=this.player.position.y+playerDimensions(this.player).headHeight;return points.some(p=>Math.hypot(p.x-aim.x,p.z-aim.z,Math.max(low-p.y,p.y-high,0))<=this.balance.biteContactRadius);}
 receiveBossHit(options){
  if(options.event?.capture&&options.bodyContact){
   const action=options.action,defended=action?.state==='dodge'||action?.state==='shieldPush'||options.shieldContact;
   if(defended)return super.receiveBossHit({...options,damage:0,grab:false});
   if(this.playerInvulnerable||!this.playerAlive||this.combat.grabOwner)return false;
   return this.grab.start(this.player,this.playerNodes,this.brain.serial);
  }
  return super.receiveBossHit(options);
 }
 hide(){super.hide();this.wolfClip=null;this.previousWolfTime=0;}
 inspect(){return {...super.inspect(),assetVersion:this.config?.version,animation:this.animator?.inspectBindingCache(),source:'wolf-attack-r8'};}
}
