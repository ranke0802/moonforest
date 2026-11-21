import {Matrix,Quaternion,Vector3,VertexBuffer} from '@babylonjs/core';
import {segmentDistanceSquared} from './melee-collision.js';
import {playerDimensions,playerHurtRadius} from './player-dimensions.js';
import {refreshPoseMatrices} from './pose-matrices.js';
import {segmentBoxHit} from './player-strikes.js';

const hands=['rightHand','leftHand'],feet=['rightFoot','leftFoot'];
export const BEAR_ATTACK_PARTS=Object.freeze({
 Axe_Spin_Attack:hands,Flying_Fist_Kick:feet,Left_Hook_from_Guard:['leftHand'],Left_Uppercut_from_Guard:['leftHand'],
 Lunge_Spin_Kick:feet,Right_Jab_from_Guard:['rightHand'],Rising_Flying_Kick:feet,Shield_Push_Left:['leftHand'],
 Skill_01:hands,Skill_02:['rightHand'],Skill_03:[...hands,...feet],Weapon_Combo:[...hands,...feet],
});
const cluster=name=>/Right(ForeArm|Hand)/.test(name)?'rightHand':/Left(ForeArm|Hand)/.test(name)?'leftHand':/Right(Leg|Foot|Toe)/.test(name)?'rightFoot':/Left(Leg|Foot|Toe)/.test(name)?'leftFoot':null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Heading of the active distal part at the unchanged source impact pose.
const heading={Axe_Spin_Attack:-.73,Flying_Fist_Kick:.02,Left_Hook_from_Guard:1.62,Left_Uppercut_from_Guard:-.05,Lunge_Spin_Kick:-.44,Right_Jab_from_Guard:.10,Rising_Flying_Kick:.14,Shield_Push_Left:-1.49,Skill_01:1.46,Skill_02:.58,Skill_03:-1.49,Weapon_Combo:.05};

// Collision points are vertices of the existing skinned limb surface, not an
// actor-wide attack sphere. Geometry, weights, texture, keys and scale stay intact.
export class BearCombatContact{
 constructor(encounter){
  this.e=encounter;this.points=[];this.rotations=[];this.branches=new Map();this.prepared=new Set();this.end=[0,0,0];this.axis=new Vector3();this.localAxis=new Vector3();this.from=new Vector3();this.to=new Vector3();this.inverse=Matrix.Identity();this.delta=Quaternion.Identity();this.target=new Vector3();this.serial=null;this.previousTime=0;this.currentTime=0;this.valid=false;this.closest=new Vector3();this.bodyA=[0,0,0];this.bodyB=[0,0,0];this.lastContact=null;
  this.shieldFrom=[0,0,0];this.shieldTo=[0,0,0];
  for(const name of ['Spine','Spine1','Spine2','RightArm','RightForeArm','LeftArm','LeftForeArm','RightUpLeg','LeftUpLeg','RightLeg','LeftLeg','RightFoot','LeftFoot']){const node=encounter.nodes['mixamorig:'+name];if(node)this.branches.set(node,{branch:node.getDescendants(false).filter(n=>n.computeWorldMatrix),value:Quaternion.Identity()});}
  for(const mesh of encounter.asset.meshes){
   if(!mesh.skeleton||mesh.metadata?.moonforestOutline)continue;
   const p=mesh.getVerticesData(VertexBuffer.PositionKind),w=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind),j=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind),extraW=mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind),extraJ=mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind);if(!p||!w||!j)continue;
   const slots=mesh.numBoneInfluencers>4&&extraW&&extraJ?8:4;
   const buckets={rightHand:[],leftHand:[],rightFoot:[],leftFoot:[]};
   for(let v=0;v<p.length/3;v++){let best=0,bone=-1;for(let k=0;k<slots;k++){const weight=(k<4?w:extraW)[v*4+k%4];if(weight>best){best=weight;bone=(k<4?j:extraJ)[v*4+k%4];}}const part=cluster(mesh.skeleton.bones[bone]?.name??'');if(part&&best>=.45)buckets[part].push(v);}
   for(const [part,vertices]of Object.entries(buckets)){
    const chosen=new Set();for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){let best=-Infinity,index;for(const v of vertices)if(p[v*3+axis]*sign>best){best=p[v*3+axis]*sign;index=v;}if(index!==undefined)chosen.add(index);}
    for(let k=0;k<42&&vertices.length;k++)chosen.add(vertices[Math.floor(k*vertices.length/42)]);
    for(const v of chosen){const weights=Array.from(w.slice(v*4,v*4+4)),joints=Array.from(j.slice(v*4,v*4+4));if(slots===8){weights.push(...extraW.slice(v*4,v*4+4));joints.push(...extraJ.slice(v*4,v*4+4));}this.points.push({mesh,vertex:v,part,p:[p[v*3],p[v*3+1],p[v*3+2]],weights,joints,now:[0,0,0],old:[0,0,0]});}
   }
  }
 }
 restore(){for(const node of this.rotations){node.rotationQuaternion.copyFrom(this.branches.get(node).value);node.markAsDirty();}this.rotations.length=0;}
 reset(){this.restore();this.serial=null;this.valid=false;this.previousTime=this.currentTime=0;this.lastContact=null;}
 rotate(node,axis,angle){
  if(!node?.rotationQuaternion||Math.abs(angle)<1e-5)return;
  const cached=this.branches.get(node);if(!cached)return;if(!this.rotations.includes(node)){cached.value.copyFrom(node.rotationQuaternion);this.rotations.push(node);}node.parent.getWorldMatrix().invertToRef(this.inverse);Vector3.TransformNormalToRef(axis,this.inverse,this.localAxis);this.localAxis.normalize();if(node.parent.getWorldMatrix().determinant()<0)this.localAxis.scaleInPlace(-1);
  Quaternion.RotationAxisToRef(this.localAxis,angle,this.delta);this.delta.multiplyToRef(node.rotationQuaternion,node.rotationQuaternion);node.markAsDirty();node.computeWorldMatrix();refreshPoseMatrices(cached.branch);
 }
 aim(node,end,limit,weight){
  if(!node||!end)return;const pivot=node.getAbsolutePosition();end.getAbsolutePosition().subtractToRef(pivot,this.from);this.target.subtractToRef(pivot,this.to);if(this.from.lengthSquared()<1e-8||this.to.lengthSquared()<1e-8)return;this.from.normalize();this.to.normalize();Vector3.CrossToRef(this.from,this.to,this.axis);if(this.axis.lengthSquared()<1e-8)return;this.axis.normalize();this.rotate(node,this.axis,Math.min(limit,Math.acos(clamp(Vector3.Dot(this.from,this.to),-1,1)))*weight);
 }
 applyPose(player){
  const e=this.e,b=e.brain,parts=BEAR_ATTACK_PARTS[b.state];
  if(b.mode!=='attack'||b.stagger||b.hp<=0||!parts)return;
  if(this.serial!==b.serial){this.serial=b.serial;this.valid=false;this.target.copyFrom(player.position);this.target.y+=playerDimensions(player).height*.86;this.baseYaw=Math.atan2(player.position.x-e.actor.position.x,player.position.z-e.actor.position.z);}
  const spec=e.motionSpec(b.state),at=b.durations[b.state]*spec.impact,weight=clamp(b.time/Math.max(.08,at*.65),0,1)*clamp((b.durations[b.state]-b.time)/Math.max(.08,b.durations[b.state]-at),0,1);
  e.actor.rotation.y=this.baseYaw+(heading[b.state]??0)*weight;e.actor.markAsDirty();e.actor.computeWorldMatrix();refreshPoseMatrices(e.poseNodes);
  if(parts.some(p=>p.endsWith('Hand'))){
   const lowest=Math.min(...parts.filter(p=>p.endsWith('Hand')).map(p=>e.nodes['mixamorig:'+(p==='rightHand'?'RightHand':'LeftHand')].getAbsolutePosition().y));
   const bend=lowest>player.position.y+playerDimensions(player).height+.2?.4:0;
   this.axis.set(Math.cos(e.actor.rotation.y),0,-Math.sin(e.actor.rotation.y));for(const name of ['Spine','Spine1','Spine2'])this.rotate(e.nodes['mixamorig:'+name],this.axis,bend*weight);
   for(const side of ['Right','Left'])if(parts.includes(side.toLowerCase()+'Hand')){
    const hand=e.nodes['mixamorig:'+side+'Hand'];
    for(let pass=0;pass<(['Left_Hook_from_Guard','Shield_Push_Left','Skill_02'].includes(b.state)?3:2);pass++){
     this.aim(e.nodes['mixamorig:'+side+'ForeArm'],hand,pass?.35:1.2,weight);
     this.aim(e.nodes['mixamorig:'+side+'Arm'],hand,pass?.35:1.2,weight);
     if(['Left_Hook_from_Guard','Shield_Push_Left'].includes(b.state))for(const name of ['Spine2','Spine1','Spine'])this.aim(e.nodes['mixamorig:'+name],hand,.28,weight);
    }
   }
  }
  for(const side of ['Right','Left'])if(parts.includes(side.toLowerCase()+'Foot')){
   const foot=e.nodes['mixamorig:'+side+'Foot'];this.aim(e.nodes['mixamorig:'+side+'UpLeg'],foot,.8,weight);this.aim(e.nodes['mixamorig:'+side+'Leg'],foot,.65,weight);this.aim(foot,e.nodes['mixamorig:'+side+'ToeBase'],.9,weight);
  }
  refreshPoseMatrices(e.poseNodes);
 }
 sample(){
  const e=this.e,b=e.brain,parts=BEAR_ATTACK_PARTS[b.state];if(b.mode!=='attack'||!parts){this.valid=false;return;}
  this.previousTime=this.currentTime;this.currentTime=b.time;const prepared=this.prepared;prepared.clear();
  for(const a of this.points){if(!parts.includes(a.part))continue;if(!prepared.has(a.mesh.skeleton)){a.mesh.skeleton.prepare(true);prepared.add(a.mesh.skeleton);}const matrices=a.mesh.skeleton.getTransformMatrices(a.mesh),world=a.mesh.getWorldMatrix().m;for(let k=0;k<3;k++)a.old[k]=a.now[k];let x=0,y=0,z=0;
   for(let slot=0;slot<a.weights.length;slot++){const weight=a.weights[slot],offset=a.joints[slot]*16,p=a.p;if(!weight)continue;x+=(p[0]*matrices[offset]+p[1]*matrices[offset+4]+p[2]*matrices[offset+8]+matrices[offset+12])*weight;y+=(p[0]*matrices[offset+1]+p[1]*matrices[offset+5]+p[2]*matrices[offset+9]+matrices[offset+13])*weight;z+=(p[0]*matrices[offset+2]+p[1]*matrices[offset+6]+p[2]*matrices[offset+10]+matrices[offset+14])*weight;}
   a.now[0]=x*world[0]+y*world[4]+z*world[8]+world[12];a.now[1]=x*world[1]+y*world[5]+z*world[9]+world[13];a.now[2]=x*world[2]+y*world[6]+z*world[10]+world[14];if(!this.valid)for(let k=0;k<3;k++)a.old[k]=a.now[k];
  }
  this.valid=true;
 }
 contact(event,player){
  const parts=BEAR_ATTACK_PARTS[event.name];if(!parts||!this.valid)return false;const d=playerDimensions(player),p=player.position,r=playerHurtRadius(player);
  this.bodyA[0]=this.bodyB[0]=p.x;this.bodyA[2]=this.bodyB[2]=p.z;this.bodyA[1]=p.y+r;this.bodyB[1]=p.y+d.height-r;
  let best=Infinity;const at=this.e.brain.durations[event.name]*event.impact,span=this.currentTime-this.previousTime,t=span>1e-8?clamp((at-this.previousTime)/span,0,1):1;
  for(const a of this.points){if(!parts.includes(a.part))continue;const end=this.end;for(let k=0;k<3;k++)end[k]=a.old[k]+(a.now[k]-a.old[k])*t;const gap=segmentDistanceSquared(a.old,end,this.bodyA,this.bodyB);if(gap<best){best=gap;this.closest.copyFromFloats(...end);}}
  const hit=best<=(r+.015)**2;this.lastContact={serial:this.e.brain.serial,attack:event.name,hit,surfaceGap:Math.sqrt(best)-r};return hit;
 }
 shieldContact(event,shield){
  if(!shield||!this.valid)return false;const parts=BEAR_ATTACK_PARTS[event.name];if(!parts)return false;
  shield.computeWorldMatrix(true);shield.getWorldMatrix().invertToRef(this.inverse);
  for(const a of this.points){if(!parts.includes(a.part))continue;Vector3.FromArrayToRef(a.old,0,this.from);Vector3.FromArrayToRef(a.now,0,this.to);Vector3.TransformCoordinatesToRef(this.from,this.inverse,this.from);Vector3.TransformCoordinatesToRef(this.to,this.inverse,this.to);
   if(this.from.z<.10||this.to.z>this.from.z)continue;this.from.toArray(this.shieldFrom);this.to.toArray(this.shieldTo);
   if(segmentBoxHit(this.shieldFrom,this.shieldTo,[-.69,-1.04,-.03],[.69,1.04,.42]))return true;
  }return false;
 }
}
