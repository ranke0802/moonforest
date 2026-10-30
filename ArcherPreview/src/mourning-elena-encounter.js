import {ElenaEncounter} from './elena-encounter.js';
import {ElenaBrain,MOURNING_SIZE,MOURNING_SIZE_SCALE} from './elena-spec.js';
import {Vector3} from '@babylonjs/core';
import {MourningElenaAnimator} from './mourning-elena-animation.js';
import {orderPoseNodes} from './pose-matrices.js';
import {MourningHurtVolumes} from './mourning-elena-hurt.js';
import {ENEMY_ARENA_RADIUS} from './world-limits.js';
import {MourningCaveNavigation} from './mourning-cave-navigation.js';
import {CaveNavigation} from './witch-cave-navigation.js';

export class MourningElenaEncounter extends ElenaEncounter {
  constructor(...args){super(...args);this.phase=2;this.displayName='비탄의 마녀 엘레나';this.radius=MOURNING_SIZE.radius;this.stopDistance=MOURNING_SIZE.stopDistance;this.separationRadius=MOURNING_SIZE.separationRadius;this.sizeScale=MOURNING_SIZE_SCALE;this.renderRangePadding=MOURNING_SIZE.renderRangePadding;this.reviewFocusHeight=2.25*MOURNING_SIZE_SCALE;this.meleeAimDistance=4+1.8*(MOURNING_SIZE_SCALE-1);this.healthAnchor=new Vector3();}
  createBrain(durations){return new ElenaBrain(durations,{mourning:true});}
  get movementNavigation(){
    const navigation=this.world.navigation;
    if(!this.world.cave||!(navigation instanceof CaveNavigation))return navigation;
    if(this.clearanceSource!==navigation){this.clearanceSource=navigation;this.clearanceNavigation=new MourningCaveNavigation(navigation.obstacles);}
    return this.clearanceNavigation;
  }
  // The enlarged creature's lower body is hollow and asymmetric. Do not add
  // the bear's 65 cm comfort gap: it keeps a real descending sword out of reach.
  // Use the same physical clearance as a roll; weapon volumes stay unchanged.
  contactSeparation(){return this.radius+.25;}
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
