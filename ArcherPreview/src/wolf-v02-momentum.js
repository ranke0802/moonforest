import {Vector3} from '@babylonjs/core';

export const WOLF_V02_PLAYER_THROW=Object.freeze({distance:2.6,duration:.40,arc:.40});

// One shared-player impulse, claimed only after an accepted real ram. Ground
// navigation keeps its existing owner; the single model carrier owns visible
// height so later terrain placement cannot erase the airborne pose.
export class WolfV02PlayerImpact{
 constructor(world,combat){
  this.world=world;this.combat=combat;this.direction=new Vector3();this.velocity=new Vector3();this.previous=new Vector3();this.start=new Vector3();this.end=new Vector3();this.reset();
 }
 canBegin(player){return !this.active&&this.combat.hp>0&&!this.combat.grabOwner&&!!player?.metadata?.moonforestV02ImpactCarrier&&!this.world.scene?.isDisposed;}
 begin({owner,serial,player,direction}){
  if(!this.canBegin(player)||!owner?.active||owner.world!==this.world||owner.brain.serial!==serial)return false;
  const carrier=player.metadata.moonforestV02ImpactCarrier;if(carrier.isDisposed?.())return false;
  this.owner=owner;this.serial=serial;this.player=player;this.scene=this.world.scene;this.map=this.world.mapId;this.carrier=carrier;
  this.direction.copyFrom(direction);this.direction.y=0;if(this.direction.lengthSquared()<1e-8){this.reset();return false;}this.direction.normalize();
  this.start.copyFrom(player.position);this.end.copyFrom(player.position);this.elapsed=0;this.travelled=0;this.active=true;this.height=0;
  const matrix=player.getWorldMatrix().m;this.heightScale=Math.max(1e-6,Math.hypot(matrix[4],matrix[5],matrix[6]));
  this.velocity.copyFrom(this.direction).scaleInPlace(2*WOLF_V02_PLAYER_THROW.distance/WOLF_V02_PLAYER_THROW.duration);
  this.combat.reaction.cancelRecoil();carrier.position.y=0;return true;
 }
 advance(dt,player,constrain){
  if(!this.active)return 0;
  if(player!==this.player||this.scene!==this.world.scene||this.map!==this.world.mapId||this.world.scene?.isDisposed||this.combat.hp<=0||this.combat.grabOwner||this.carrier?.isDisposed?.()){this.reset();return 0;}
  let remaining=Math.max(0,Number.isFinite(dt)?dt:0),actual=0;
  // At most four navigation slices for the whole .40s flight. A long frame
  // consumes its full elapsed time alongside the unchanged native fall clock.
  while(remaining>1e-9&&this.active){const step=Math.min(.1,remaining,WOLF_V02_PLAYER_THROW.duration-this.elapsed);actual+=this.advanceStep(step,player,constrain);remaining-=step;}
  return actual;
 }
 advanceStep(step,player,constrain){
  const duration=WOLF_V02_PLAYER_THROW.duration,before=this.elapsed/duration;
  this.elapsed=Math.min(duration,this.elapsed+step);const after=this.elapsed/duration,ease=t=>t*(2-t),distance=WOLF_V02_PLAYER_THROW.distance*(ease(after)-ease(before));
  this.previous.copyFrom(player.position);player.position.x+=this.direction.x*distance;player.position.z+=this.direction.z*distance;
  if(distance>0)constrain?.(this.previous);
  if(!this.active||this.player!==player)return 0;
  const dx=player.position.x-this.previous.x,dz=player.position.z-this.previous.z,actual=Math.hypot(dx,dz);this.travelled+=actual;this.end.copyFrom(player.position);
  this.velocity.set(dx/Math.max(1e-9,step),0,dz/Math.max(1e-9,step));this.height=4*WOLF_V02_PLAYER_THROW.arc*after*(1-after);this.carrier.position.y=this.height/this.heightScale;
  if(this.elapsed>=duration){this.carrier.position.y=0;this.height=0;this.active=false;this.owner=null;this.player=null;this.carrier=null;this.scene=null;this.map=null;this.velocity.setAll(0);}
  return actual;
 }
 reset(){
  if(this.carrier&&!this.carrier.isDisposed?.())this.carrier.position.y=0;
  this.active=false;this.owner=this.player=this.carrier=this.scene=this.map=null;this.serial=null;this.elapsed=this.travelled=this.height=0;this.heightScale=1;this.velocity.setAll(0);
 }
 inspect(){return {active:this.active,owner:this.owner?.id??null,serial:this.serial,elapsed:this.elapsed,distance:this.travelled,height:this.height,velocity:this.velocity.asArray(),start:this.start.asArray(),end:this.end.asArray()};}
}
