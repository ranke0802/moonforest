import {Quaternion,Vector3} from '@babylonjs/core';
import {playerDimensions} from './player-dimensions.js';
import {WOLF_V02_GAIT,WOLF_V02_BRACE} from './wolf-v02-spec.js';

const up=new Vector3(0,1,0),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const RUN_STANCE=Object.freeze({'fore.L':[.58-17/30,.72-17/30],'fore.R':[.1216666667,.2616666667],'hind.L':[.2916666667,.3916666667],'hind.R':[.3583333333,.4583333333]});
function braceSupport(clip,name){
 const phases=clip?.supportPhases;
 if(Array.isArray(phases))return phases.filter(phase=>phase.feet.includes(name+'.paw')).map(phase=>[phase.start,phase.end]);
 return phases?.[name]??((name==='fore.R'||name==='hind.L')?[[0,.04],[.40,.90]]:[[0,.43],[.82,.90]]);
}

// A single post-sampler pose owner. All vectors, quaternions and original-pose
// slots live with the actor. The next animation sample always starts from its
// unadjusted pose, including when a transition captures its blend origin.
export class WolfV02LocomotionPose{
 constructor(encounter){
  this.e=encounter;this.slots=new Map();this.edited=false;this.sample=-1;
  this.parent=Quaternion.Identity();this.world=Quaternion.Identity();this.delta=Quaternion.Identity();this.local=Quaternion.Identity();this.desired=Quaternion.Identity();
  this.a=new Vector3();this.b=new Vector3();this.c=new Vector3();this.d=new Vector3();this.v=new Vector3();this.bend=new Vector3();this.knee=new Vector3();this.from=new Vector3();this.to=new Vector3();this.forward=new Vector3();this.right=new Vector3();
  for(const name of ['neck','head',...['fore.L','fore.R','hind.L','hind.R'].flatMap(n=>[n+'.upper',n+'.lower',n.startsWith('hind')?n+'.metatarsal':n+'.paw',n+'.paw'])]){
   const node=encounter.nodes[name];if(node&&!this.slots.has(node))this.slots.set(node,{node,original:Quaternion.Identity(),changed:false,branch:[]});
  }
  // The sampler already orders this actor's imported nodes parent first. Cache
  // only the descendants each editable joint can affect; a knee/head change
  // must not invalidate the other legs, torso or imported root every time.
  for(const slot of this.slots.values())for(const node of encounter.animator.nodes){
   for(let ancestor=node;ancestor;ancestor=ancestor.parent)if(ancestor===slot.node){slot.branch.push(node);break;}
  }
  const brace=encounter.config.catalog.find(clip=>clip.name===WOLF_V02_BRACE);
  this.legs=['fore.L','fore.R','hind.L','hind.R'].map(name=>({name,upper:encounter.nodes[name+'.upper'],lower:encounter.nodes[name+'.lower'],end:encounter.nodes[name+(name.startsWith('hind')?'.metatarsal':'.paw')],foot:encounter.nodes[name+'.paw'],anchor:new Vector3(),previous:new Vector3(),offset:new Vector3(),endWorld:Quaternion.Identity(),footWorld:Quaternion.Identity(),planted:false,braceSupport:braceSupport(brace,name)}));
  this.maxReachError=0;this.releasedPlants=0;this.serial=null;
 }
 restore(){
  if(this.edited&&this.sample===this.e.animator.samples)for(const slot of this.slots.values())if(slot.changed)slot.node.rotationQuaternion.copyFrom(slot.original);
  for(const slot of this.slots.values())slot.changed=false;
  this.edited=false;
 }
 remember(node){const slot=this.slots.get(node);if(!slot.changed){slot.original.copyFrom(node.rotationQuaternion);slot.changed=true;}this.edited=true;this.sample=this.e.animator.samples;}
 refresh(node){
  // Babylon propagates this invalidation to children. Mark the changed joint
  // once, then refresh its cached descendants parent first without forcing or
  // recursively invalidating the same branch again for every descendant.
  node.markAsDirty();for(const affected of this.slots.get(node).branch)affected.computeWorldMatrix();
 }
 setWorldRotation(node,rotation){
  this.remember(node);node.parent.getWorldMatrix().decompose(undefined,this.parent);this.parent.conjugateInPlace();this.parent.multiplyToRef(rotation,this.local);node.rotationQuaternion.copyFrom(this.local).normalize();this.refresh(node);
 }
 rotateWorld(node,rotation){node.getWorldMatrix().decompose(undefined,this.world);rotation.multiplyToRef(this.world,this.desired);this.setWorldRotation(node,this.desired);}
 turnToward(node,radians){Quaternion.RotationAxisToRef(up,radians,this.delta);this.rotateWorld(node,this.delta);}
 aimJoint(node,head,player,height,yawLimit,pitchLimit,fraction=1){
  let p=head.getAbsolutePosition();Vector3.TransformNormalToRef(up,head.getWorldMatrix(),this.forward);
  let yaw=Math.atan2(this.forward.x,this.forward.z),target=Math.atan2(player.x-p.x,player.z-p.z);
  this.turnToward(node,clamp(angleDelta(target,yaw)*fraction,-yawLimit,yawLimit));
  p=head.getAbsolutePosition();Vector3.TransformNormalToRef(up,head.getWorldMatrix(),this.forward);
  yaw=Math.atan2(this.forward.x,this.forward.z);this.right.set(Math.cos(yaw),0,-Math.sin(yaw));
  const pitch=Math.atan2(this.forward.y,Math.hypot(this.forward.x,this.forward.z)),targetPitch=Math.atan2(player.y+height-p.y,Math.hypot(player.x-p.x,player.z-p.z));
  Quaternion.RotationAxisToRef(this.right,-clamp((targetPitch-pitch)*fraction,-pitchLimit,pitchLimit),this.delta);this.rotateWorld(node,this.delta);
 }
 aim(){
  const e=this.e,b=e.brain;
  if(!e.player||b.hp<=0||b.stagger||['down','recover'].includes(b.mode)||b.behavior==='rest')return;
  if(b.mode==='attack'&&b.action?.authoredAttention)return;
  const head=e.nodes.head,neck=e.nodes.neck,player=e.player.position;
  const height=playerDimensions(e.player).bodyAimHeight;
  if(b.mode==='attack'){
   // Counter-aim only the head while the authored neck/chest carry the diagonal
   // strike. Applying bounded yaw/pitch to the sampled quaternion keeps its
   // authored roll; no look-at basis, root turn or changed charge path is used.
   this.aimJoint(head,head,player,height,.70,.35);return;
  }
  this.aimJoint(neck,head,player,height,.72,.55,.6);this.aimJoint(head,head,player,height,.72,.60);
 }
 resetPlants(){for(const leg of this.legs)leg.planted=false;this.serial=null;}
 capturePreviousFeet(){for(const leg of this.legs)leg.previous.copyFrom(leg.foot.getAbsolutePosition());this.hasPreviousFeet=true;}
 plantRun(){
  const e=this.e,b=e.brain;
  const firstSample=this.serial!==b.serial;
  if(firstSample){this.resetPlants();this.serial=b.serial;}
  for(const leg of this.legs){
   const range=RUN_STANCE[leg.name],phase=b.time-WOLF_V02_GAIT.runSourceStart,stance=phase>=range[0]&&phase<=range[1];
   if(!stance){leg.planted=false;continue;}
   this.plant(leg,firstSample||e.animator.blend<1);this.solveLeg(leg);
  }
 }
 plantBrace(){
  const e=this.e,b=e.brain,firstSample=this.serial!==b.serial;
  if(firstSample){this.resetPlants();this.serial=b.serial;}
  for(const leg of this.legs){
   let stance=false;for(const range of leg.braceSupport)if(b.time>=range[0]&&b.time<=range[1]){stance=true;break;}
   if(!stance){leg.planted=false;continue;}
   this.plant(leg,firstSample);this.solveLeg(leg);
  }
 }
 plant(leg,usePrevious=false){
  if(leg.planted)return;
  leg.anchor.copyFrom(usePrevious&&this.hasPreviousFeet?leg.previous:leg.foot.getAbsolutePosition());leg.offset.copyFrom(leg.foot.getAbsolutePosition()).subtractInPlace(leg.end.getAbsolutePosition());
  leg.end.getWorldMatrix().decompose(undefined,leg.endWorld);leg.foot.getWorldMatrix().decompose(undefined,leg.footWorld);leg.planted=true;
 }
 plantOrbit(left){
  const e=this.e,b=e.brain,duration=e.animator.durations[b.state],phase=b.time/duration;
  const firstSample=this.serial!==b.serial;
  if(firstSample){this.resetPlants();this.serial=b.serial;}
  for(const leg of this.legs){
   const first=left?(leg.name==='fore.L'||leg.name==='hind.R'):(leg.name==='fore.R'||leg.name==='hind.L');
   const stance=first?phase<.5:phase>=.5&&phase<1;
   if(!stance){leg.planted=false;continue;}
   this.plant(leg,firstSample);
   this.solveLeg(leg);
  }
 }
 solveLeg(leg){
  this.a.copyFrom(leg.upper.getAbsolutePosition());this.b.copyFrom(leg.lower.getAbsolutePosition());this.c.copyFrom(leg.end.getAbsolutePosition());
  leg.anchor.subtractToRef(leg.offset,this.d);this.d.subtractToRef(this.a,this.v);
  const l1=Vector3.Distance(this.a,this.b),l2=Vector3.Distance(this.b,this.c),requested=this.v.length(),maximum=l1+l2-1e-5,minimum=Math.abs(l1-l2)+1e-5;
  const excess=Math.max(0,requested-maximum,minimum-requested);this.maxReachError=Math.max(this.maxReachError,excess);
  // A moving target can pull an old plant outside the fixed-length chain.
  // Release it and let the authored lift finish; never stretch a leg to chase.
  if(excess>.025){leg.planted=false;this.releasedPlants++;this.e.brain.stalkBlocked=true;return;}
  const distance=clamp(requested,minimum,maximum);this.v.scaleInPlace(1/Math.max(requested,1e-8));
  this.b.subtractToRef(this.a,this.bend);this.v.scaleToRef(Vector3.Dot(this.bend,this.v),this.from);this.bend.subtractInPlace(this.from);
  if(this.bend.lengthSquared()<1e-10)return;
  this.bend.normalize();const along=(distance*distance+l1*l1-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  this.v.scaleToRef(along,this.knee);this.knee.addInPlace(this.a);this.bend.scaleToRef(height,this.from);this.knee.addInPlace(this.from);
  this.b.subtractToRef(this.a,this.from).normalize();this.knee.subtractToRef(this.a,this.to).normalize();Quaternion.FromUnitVectorsToRef(this.from,this.to,this.delta);this.rotateWorld(leg.upper,this.delta);
  this.b.copyFrom(leg.lower.getAbsolutePosition());this.c.copyFrom(leg.end.getAbsolutePosition());this.c.subtractToRef(this.b,this.from).normalize();this.d.subtractToRef(this.b,this.to).normalize();Quaternion.FromUnitVectorsToRef(this.from,this.to,this.delta);this.rotateWorld(leg.lower,this.delta);
  this.setWorldRotation(leg.end,leg.endWorld);if(leg.end!==leg.foot)this.setWorldRotation(leg.foot,leg.footWorld);
 }
}
