import {ElenaEncounter} from './elena-encounter.js';
import {ElenaBrain} from './elena-spec.js';
import {MourningElenaAnimator} from './mourning-elena-animation.js';
import {orderPoseNodes} from './pose-matrices.js';

export class MourningElenaEncounter extends ElenaEncounter {
  constructor(...args){super(...args);this.phase=2;this.displayName='비탄의 마녀 엘레나';this.radius=.9;this.stopDistance=3;this.separationRadius=1.1;}
  createBrain(durations){return new ElenaBrain(durations,{mourning:true});}
  prepareAsset(){
    // A stable five-influence shader prevents program recompiles whenever a cast
    // corrective reaches zero. Geometry and all five targets remain unchanged.
    for(const manager of new Set(this.asset.meshes.map(m=>m.morphTargetManager).filter(Boolean))){manager.optimizeInfluencers=false;manager.numMaxInfluencers=manager.numTargets;manager.synchronize();}
  }
  createAnimator(){
    this.poseNodes=orderPoseNodes([...this.asset.transformNodes,...this.asset.meshes]);
    this.nodes['mixamorig:Head']=this.nodes.DEF_Head;
    this.nodes['mixamorig:Hips']=this.nodes.DEF_Abdomen;
    this.nodes['mixamorig:RightHand']=this.nodes['DEF_FrontHand.L_Palm'];
    // Avoid guessing shoulder aliases: rear damage uses the actor's authored yaw.
    if(this.animator instanceof MourningElenaAnimator){
      Object.assign(this.animator,{walkTime:0,hairTime:0,breathClock:0,haloTime:0,gaitBlend:0,castTime:0,current:'idle',clothInitialized:false,disposed:false,accumulator:0});this.animator.sample(0);return this.animator;
    }
    return new MourningElenaAnimator(this.asset,this.config,this.actor);
  }
  async summon(...args){await super.summon(...args);this.contact.mesh.scaling.set(3,1,3);}
  alignPose(){
    const offset=this.config.centerOffset??[0,0,0];this.carrier.position.set(...offset);
    this.actor.computeWorldMatrix();this.carrier.computeWorldMatrix();
  }
  hurtCapsules(){
    const pairs=[['DEF_Abdomen','DEF_Chest',.4],['DEF_Chest','DEF_Head',.3],
      ['DEF_FrontHand.L_UpperArm','DEF_FrontHand.L_Forearm',.22],['DEF_FrontHand.L_Forearm','DEF_FrontHand.L_Palm',.2],
      ['DEF_FrontFoot.R_Thigh','DEF_FrontFoot.R_Shin',.22],['DEF_FrontFoot.R_Shin','DEF_FrontFoot.R_Foot',.22]];
    // Radii are in world metres, unlike the source-unit first-phase rig.
    return pairs.filter(([a,b])=>this.nodes[a]&&this.nodes[b]).map(([a,b,r])=>({points:[this.nodes[a].getAbsolutePosition().asArray(),this.nodes[b].getAbsolutePosition().asArray()],radius:r}));
  }
  updateRenderRange(camera){
    super.updateRenderRange(camera);
    if(this.animator)this.animator.sampleInterval=this.engaged||this.reviewMode?0:this.renderVisible===false?1/15:1/30;
  }
}
