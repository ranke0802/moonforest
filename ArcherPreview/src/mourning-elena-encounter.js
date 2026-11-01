import {ElenaEncounter} from './elena-encounter.js';
import {ElenaBrain,MOURNING_SIZE,MOURNING_SIZE_SCALE} from './elena-spec.js';
import {Vector3} from '@babylonjs/core';
import {MourningElenaAnimator} from './mourning-elena-animation.js';
import {orderPoseNodes} from './pose-matrices.js';
import {MourningHurtVolumes} from './mourning-elena-hurt.js';
import {ENEMY_ARENA_RADIUS} from './world-limits.js';
import {MourningCaveNavigation} from './mourning-cave-navigation.js';
import {CaveNavigation} from './witch-cave-navigation.js';
import {MourningSlamAdvance} from './mourning-slam.js';
import {playerDimensions} from './player-dimensions.js';

// Distance to the player's upright vertical segment without per-limb scratch
// arrays or scanning skinned vertices. The fitted hurt endpoints are reused.
function uprightDistanceSquared(x,z,low,high,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],rx=a[0]-x,rz=a[2]-z,horizontal=dx*dx+dz*dz,length=horizontal+dy*dy;
  const at=t=>{t=Math.max(0,Math.min(1,t));const y=a[1]+dy*t,gap=Math.max(low-y,0,y-high);return (rx+dx*t)**2+(rz+dz*t)**2+gap*gap;};
  return Math.min(at(0),at(1),at(horizontal?-(rx*dx+rz*dz)/horizontal:0),at(length?-(rx*dx+(a[1]-low)*dy+rz*dz)/length:0),at(length?-(rx*dx+(a[1]-high)*dy+rz*dz)/length:0));
}

export class MourningElenaEncounter extends ElenaEncounter {
  constructor(...args){super(...args);this.phase=2;this.displayName='비탄의 마녀 엘레나';this.radius=MOURNING_SIZE.radius;this.stopDistance=MOURNING_SIZE.stopDistance;this.separationRadius=MOURNING_SIZE.separationRadius;this.sizeScale=MOURNING_SIZE_SCALE;this.renderRangePadding=MOURNING_SIZE.renderRangePadding;this.reviewFocusHeight=2.25*MOURNING_SIZE_SCALE;this.meleeAimDistance=4+1.8*(MOURNING_SIZE_SCALE-1);this.healthAnchor=new Vector3();this.slamAdvance=new MourningSlamAdvance();}
  update(dt,player){super.update(dt,player);this.slamAdvance.update(this,player);}
  hide(){this.slamAdvance?.reset();super.hide();}
  createBrain(durations){return new ElenaBrain(durations,{mourning:true});}
  get movementNavigation(){
    const navigation=this.world.navigation;
    if(!this.world.cave||!(navigation instanceof CaveNavigation))return navigation;
    if(this.clearanceSource!==navigation){this.clearanceSource=navigation;this.clearanceNavigation=new MourningCaveNavigation(navigation.obstacles);}
    return this.clearanceNavigation;
  }
  // The environment still needs the full1.9m root envelope. Inside that broad
  // contact range, however, the planted limbs leave genuine gaps below the
  // abdomen. A solid root cylinder would keep the160cm sword out of reach.
  contactSeparation(){
    const player=this.player,dimensions=playerDimensions(player),broad=this.radius+dimensions.rollRadius;
    if(!player||this.renderVisible===false||this.fogVisible===false||!this.nodes)return broad;
    const p=player.position,root=this.actor.position,dx=p.x-root.x,dz=p.z-root.z,distance=Math.hypot(dx,dz);
    if(distance>=broad||distance<.001)return broad;
    const cached=this.bodyContactCache;
    // Casting arms are attack volumes. When both actors stand still their
    // independent animation must not pump the boss root back and forth.
    if(cached&&cached.brain===this.brain&&cached.player===player&&Math.abs(cached.px-p.x)<.003&&Math.abs(cached.py-p.y)<.003&&Math.abs(cached.pz-p.z)<.003&&Math.abs(cached.x-root.x)<.003&&Math.abs(cached.y-root.y)<.003&&Math.abs(cached.z-root.z)<.003&&Math.abs(cached.yaw-this.actor.rotation.y)<.003)return cached.separation;
    this.animator?.ensurePoseCurrent?.();
    const capsules=this.hurtCapsules(),radius=dimensions.moveRadius,low=p.y+radius,high=p.y+dimensions.height-radius,ux=dx/distance,uz=dz/distance;
    const overlaps=trial=>{const x=root.x+ux*trial,z=root.z+uz*trial;for(const capsule of capsules){const [a,b]=capsule.points,r=capsule.radius+radius+.015;if(Math.min(a[1],b[1])-r>high||Math.max(a[1],b[1])+r<low)continue;if(uprightDistanceSquared(x,z,low,high,a,b)<r*r)return true;}return false;};
    // The real160cm sword's three authored attacks share a measured .9–1.2m
    // close range. Keep its middle1.1m as comfort clearance so held movement
    // cannot carry the player through the hollow core and behind the blade.
    const comfort=Math.min(broad,dimensions.height*(1.1/1.6));
    let separation=comfort;
    if(overlaps(distance)){
      let lo=distance,hi=distance;
      // Find the first free outward interval. Keep the previous broad contact
      // bound, rather than extending the body's reach or changing nav safety.
      while(hi<broad&&overlaps(hi))hi=Math.min(broad,hi+.06);
      if(overlaps(hi))separation=broad;
      else {lo=Math.max(distance,hi-.06);for(let i=0;i<8;i++){const mid=(lo+hi)/2;if(overlaps(mid))lo=mid;else hi=mid;}separation=Math.max(comfort,hi);}
    }
    const state=this.bodyContactCache??={};Object.assign(state,{brain:this.brain,player,px:p.x,py:p.y,pz:p.z,x:root.x,y:root.y,z:root.z,yaw:this.actor.rotation.y,separation});
    return separation;
  }
  prepareAsset(){
    // Keep stable shader slots for the authored targets while texture-mode
    // shaders skip zero-weight targets, including the r9 death corrections.
    // The attribute fallback needs all slots bound; keep the loader's texture.
    for(const manager of new Set(this.asset.meshes.map(m=>m.morphTargetManager).filter(Boolean))){manager.areUpdatesFrozen=true;manager.optimizeInfluencers=manager.isUsingTextureForTargets;manager.numMaxInfluencers=manager.numTargets;manager.areUpdatesFrozen=false;}
  }
  createAnimator(){
    // Absolute assignment also makes repeated summons immune to scale growth.
    this.actor.scaling.setAll(this.config.scale*MOURNING_SIZE_SCALE);
    this.poseNodes=orderPoseNodes([...this.asset.transformNodes,...this.asset.meshes]);
    this.nodes['mixamorig:Head']=this.nodes.DEF_Head;
    this.nodes['mixamorig:Hips']=this.nodes.DEF_Abdomen;
    this.nodes['mixamorig:RightHand']=this.nodes['DEF_FrontHand.L_Palm'];
    // Avoid guessing shoulder aliases: rear damage uses the actor's authored yaw.
    if(this.animator instanceof MourningElenaAnimator){
      return this.animator.reset();
    }
    return new MourningElenaAnimator(this.asset,this.config,this.actor);
  }
  async summon(player,options={}){
    this.slamAdvance.reset();
    const position=(options.position??player.position.add(new Vector3(Math.sin(player.rotation.y)*2.8,0,Math.cos(player.rotation.y)*2.8))).clone(),navigation=this.movementNavigation;
    if(navigation&&(!navigation.free(position,this.radius)||Math.hypot(position.x-player.position.x,position.z-player.position.z)<this.radius+.8)){
      const safe=navigation.findFree(position,this.radius,ENEMY_ARENA_RADIUS,[{x:player.position.x,z:player.position.z,radius:.8}]);position.x=safe.x;position.z=safe.z;
    }
    await super.summon(player,{...options,position});this.contact.mesh.scaling.set(MOURNING_SIZE.contactScale,1,MOURNING_SIZE.contactScale);
  }
  healthBarPosition(){return this.healthAnchor.copyFrom(this.actor.position).addInPlaceFromFloats(0,MOURNING_SIZE.bodyHeight+.3,0);}
  alignPose(){
    const offset=this.config.centerOffset??[0,0,0];this.carrier.position.set(...offset);
    this.actor.computeWorldMatrix();this.carrier.computeWorldMatrix();
  }
  hurtCapsules(){
    this.hurtVolumes??=new MourningHurtVolumes(this.nodes,MOURNING_SIZE_SCALE);
    return this.hurtVolumes.sample();
  }
  updateRenderRange(camera){
    super.updateRenderRange(camera);
    if(this.animator)this.animator.sampleInterval=this.engaged||this.reviewMode?0:this.renderVisible===false?1/15:1/30;
  }
}
