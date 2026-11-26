import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {createLandingCape} from './riding-landing-cape.js';

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const sides=['Left','Right'];
const back=[['Spine','Spine1',.38],['Spine1','Spine2',.34],['Spine2','Neck',.28]];
// Saddle-local metres: +X is the near (left) flank on the shipped rider,
// +Z the horse's head. Each track starts on the real idle pose and ends on
// the fitted mounted pose. The tread is at x=.41, y=-.405, z=.166.
const tracks={
 Hips:[[.19,.77,-.64,-.03],[.35,.65,-.46,-.035],[.53,.48,.12,-.045],[.64,.37,.38,-.045],[.73,.22,.40,-.035],[.82,.06,.375,-.025],[.9,0,.35,-.01]],
 LeftFoot:[[.16,.76,-1.26,.11],[.25,.60,-.81,.12],[.36,.462,-.31,.065],[.60,.462,-.31,.065],[.81,.46,-.30,.066],[.91,.47,-.30,.066]],
 RightFoot:[[.19,.74,-1.34,-.10],[.35,.72,-1.34,-.10],[.5,.78,-.76,-.23],[.61,.75,-.07,-.40],[.68,.54,.19,-.52],[.74,.20,.30,-.58],[.79,-.16,.30,-.50],[.84,-.41,.13,-.32],[.91,-.48,-.16,-.05]],
 LeftHand:[[.15,.70,-.33,.22],[.31,.35,-.045,.195],[.48,.28,.075,.17],[.60,.25,.12,.17],[.75,.19,.18,.26]],
 RightHand:[[.15,.65,-.36,-.15],[.31,.35,-.045,-.16],[.48,.30,.085,-.155],[.61,.27,.13,-.15],[.77,.035,.18,.055],[.88,-.12,.27,.20]]
};
// Hip-relative azimuth sweeps round the back of the saddle in either direction;
// elevation and knee flexion keep the boot travelling past the croup until
// the thigh reaches the opposite side. All three angles are in degrees.
const swingArc=[
 [.56,27,-52,1.9],[.61,34,-31,16],[.665,48,-15,21],[.715,68,-10,16],
 [.77,100,-10,14],[.815,132,-15,19],[.855,151,-24,30],
 [.90,165,-42,42],[.965,185,-60,40]
];
const radians=Math.PI/180;
// On the way down the near ankle first lifts out of the iron. Both boots
// drop together; the pelvis settles into bent knees after ground contact.
const landing={
 Hips:[[.12,0,0,0],[.19,0,0,0],[.29,.76,-.30,-.04],[.42,.63,-.11,-.06],[.53,.50,.13,-.05],[.63,.39,.36,-.045]],
 LeftFoot:[[.19,0,0,0],[.28,0,0,0],[.40,.86,-.80,-.08],[.50,.64,-.54,-.085],[.565,.53,-.31,-.055],[.60,.49,-.245,.005],[.655,.462,-.31,.065]],
 RightFoot:[[.19,0,0,0],[.28,0,0,0],[.40,.76,-.80,-.15],[.50,.76,-.54,-.23],[.565,.76,-.31,-.32],[.615,.75,-.04,-.405],[.68,.54,.19,-.52]]
};
function track(points){return [[0,0,0,0],...points.map(p=>p.slice()),[1,0,0,0]];}
function endpoint(row,p){row[1]=p.x;row[2]=p.y;row[3]=p.z;}
function curve(rows,t,out){
 let k=0;while(k<rows.length-2&&t>rows[k+1][0])k++;
 const a=rows[k],b=rows[k+1],prev=rows[Math.max(0,k-1)],next=rows[Math.min(rows.length-1,k+2)];
 const span=b[0]-a[0],u=clamp((t-a[0])/span),u2=u*u,u3=u2*u;
 const v=i=>a[i]===b[i]?a[i]:(2*u3-3*u2+1)*a[i]+(u3-2*u2+u)*span*(prev[i]!==a[i]?(b[i]-prev[i])/(b[0]-prev[0]):0)
  +(-2*u3+3*u2)*b[i]+(u3-u2)*span*(next[i]!==b[i]?(next[i]-a[i])/(next[0]-a[0]):0);
 return out.set(v(1),v(2),v(3));
}

// A two-link solve rotates the original bones. No bone translations, scales
// or mesh vertices are changed. Targets outside anatomical reach are clamped.
export function createRiderTransferPose(actor){
 const lift=actor?.metadata?.saddleOffset;
 const byName=new Map((actor?.getDescendants?.(false)??[]).map(n=>[n.name,n]));
 const bones={},initial=new Map(),seated=new Map(),ground={};
 const names=['Hips','Spine','Spine1','Spine2','Neck','Head',...sides.flatMap(side=>['Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'].map(n=>side+n))];
 for(const name of names)bones[name]=byName.get('mixamorig:'+name);
 if(!lift||!actor.computeWorldMatrix||names.some(n=>!bones[n]?.rotationQuaternion)){
  return {ready:false,apply(_amount,_saddle,_standing,fitSeat){fitSeat?.();},reset(){}};
 }
 // These are the only joints changed by the ordinary seat or this transfer.
 for(const n of byName.values())if(n.rotationQuaternion&&(names.includes(n.name.replace('mixamorig:',''))||/^DEF-Cape\.0[1-3]\.[LCR]$/.test(n.name))){
  initial.set(n,n.rotationQuaternion.clone());seated.set(n,Quaternion.Identity());
 }
 for(const side of sides)bones[side+'Fingers']=byName.get('mixamorig:'+side+'HandMiddle1');
 const sweep=new Vector3(),sweptFoot=new Vector3(),sweptPole=new Vector3();
 const armEnd=new Vector3(),up=new Vector3(),wristLine=new Vector3();
 const seatInv=new Matrix(),actorInv=new Matrix(),p=new Vector3(),goal=new Vector3(),pole=new Vector3(),
  delta=new Vector3(),local=new Vector3(),axis=new Vector3(),axis2=new Vector3(),mid=new Vector3(),unit=new Vector3(),bend=new Vector3(),
  rootPos=new Vector3(),worldRot=new Quaternion(),turn=new Quaternion(),parentInv=new Quaternion();
 const path=Object.fromEntries(Object.entries(tracks).map(([k,keys])=>[k,track(keys)])),pathNames=Object.keys(path);
 const descent=Object.fromEntries(Object.entries(landing).map(([name,keys])=>[name,track(keys)]));
 const landingNames=Object.keys(descent);
 const startPole=new Vector3(),startToe=new Vector3(),landingTarget=new Vector3();
 actor.computeWorldMatrix(true).invertToRef(actorInv);
 for(const name of [...pathNames,...sides.flatMap(s=>[s+'Leg',s+'ForeArm',s+'ToeBase'])]){
  const n=bones[name];n.computeWorldMatrix(true);ground[name]=Vector3.TransformCoordinates(n.absolutePosition,actorInv);
 }
 let changed=false,landingCape;
 function rotateTo(bone,child,target){
  bone.computeWorldMatrix();child.computeWorldMatrix();
  child.absolutePosition.subtractToRef(bone.absolutePosition,axis);target.subtractToRef(bone.absolutePosition,axis2);
  if(axis.lengthSquared()<1e-10||axis2.lengthSquared()<1e-10)return;
  Quaternion.FromUnitVectorsToRef(axis.normalize(),axis2.normalize(),turn);
  turn.multiplyToRef(bone.absoluteRotationQuaternion,worldRot);bone.parent.absoluteRotationQuaternion.conjugateToRef(parentInv);
  parentInv.multiplyToRef(worldRot,bone.rotationQuaternion);bone.markAsDirty();bone.computeWorldMatrix();
 }
 function ik(a,b,c,target,bendToward,arm=false){
  a.computeWorldMatrix();b.computeWorldMatrix();c.computeWorldMatrix();
  const upper=Vector3.Distance(a.absolutePosition,b.absolutePosition),lower=Vector3.Distance(b.absolutePosition,c.absolutePosition);
  target.subtractToRef(a.absolutePosition,unit);const len=unit.length();if(len<.0001)return;unit.scaleInPlace(1/len);
  const d=arm?Math.max(.40*(upper+lower),Math.min(.955*(upper+lower),len)):
   Math.max(Math.abs(upper-lower)+.0001,Math.min(upper+lower-.0001,len));
  const along=(upper*upper-lower*lower+d*d)/(2*d);
  if(arm){armEnd.copyFrom(a.absolutePosition);unit.scaleAndAddToRef(d,armEnd);target=armEnd;}
  bendToward.subtractToRef(a.absolutePosition,bend);unit.scaleAndAddToRef(-Vector3.Dot(bend,unit),bend);
  if(bend.lengthSquared()<1e-9)return;bend.normalize();
  mid.copyFrom(a.absolutePosition);unit.scaleAndAddToRef(along,mid);bend.scaleAndAddToRef(Math.sqrt(Math.max(0,upper*upper-along*along)),mid);
  rotateTo(a,b,mid);rotateTo(b,c,target);
 }
 function groundLift(position){
  lift.rotation.set(0,0,0);Vector3.FromFloatsToRef(position.x-actor.position.x,position.y-actor.position.y,position.z-actor.position.z,delta);
  Vector3.TransformNormalToRef(delta,actorInv,lift.position);lift.markAsDirty();
 }
 function reset(force=false){
  landingCape?.reset();
  if(!changed&&!force)return;
  for(const [node,q] of initial){node.rotationQuaternion.copyFrom(q);node.markAsDirty();}
  lift.position.set(0,0,0);lift.rotation.set(0,0,0);lift.markAsDirty();changed=false;
 }
 function standingPoint(name,standing,out){
  Vector3.TransformNormalToRef(ground[name],actor.getWorldMatrix(),out);
  out.addInPlaceFromFloats(standing.x,standing.y,standing.z);
 }
 function worldPoint(name,t,seat,out,landingWeight=0){
  curve(path[name],t,local);
  if(landingWeight&&descent[name]){
   curve(descent[name],t,landingTarget);Vector3.LerpToRef(local,landingTarget,landingWeight,local);
  }
  Vector3.TransformCoordinatesToRef(local,seat,out);
 }
 function apply(amount,saddle,standing,fitSeat,dismounting=false){
  const t=clamp(amount);changed=true;
  if(!dismounting||t===0||t>=.46)landingCape?.reset();
  actor.computeWorldMatrix().invertToRef(actorInv);
  if(t===0){for(const [node,q] of initial){node.rotationQuaternion.copyFrom(q);node.markAsDirty();}groundLift(standing);return;}
  // fitSeat supplies the actual pad/contact height and the original seated
  // arm/leg/cape pose. Keep this exact result at progress 1 and in normal ride.
  lift.rotation.set(0,0,0);lift.markAsDirty();fitSeat();
  if(t===1||!saddle)return;
  const seat=saddle.computeWorldMatrix(true);seat.invertToRef(seatInv);
  for(const [n,q] of seated)q.copyFrom(n.rotationQuaternion);
  for(const name of pathNames){
   const rows=path[name];standingPoint(name,standing,p);Vector3.TransformCoordinatesToRef(p,seatInv,p);endpoint(rows[0],p);
   bones[name].computeWorldMatrix();Vector3.TransformCoordinatesToRef(bones[name].absolutePosition,seatInv,p);endpoint(rows.at(-1),p);
  }
  // Keep the far boot planted through the lift, using the actual slope and
  // the standing footprint. A high-side mount must not sink below the ground.
  const farBoot=path.RightFoot,nearBoot=path.LeftFoot,pelvis=path.Hips;
  for(let i=1;i<=2;i++)for(let j=1;j<=3;j++)farBoot[i][j]=farBoot[0][j];
  pelvis[1][1]=pelvis[0][1]-.14;pelvis[1][2]=pelvis[0][2]-.035;
  nearBoot[1][2]=nearBoot[0][2]+.13;
  const landingWeight=dismounting?smooth((.66-t)/.07):0;
  if(landingWeight){
   for(const name of landingNames){
    const groundRow=path[name][0],rows=descent[name];
    // Resolve the landing and compression against this side of the actual slope.
    for(let i=0;i<=2;i++)for(let j=1;j<=3;j++)rows[i][j]=groundRow[j];
    if(name==='Hips'){rows[1][1]-=.035;rows[1][2]-=.11;rows[2][1]-=.075;rows[2][2]-=.025;}
    else{rows[2][1]+=(name==='LeftFoot'?-.11:.025);rows[2][2]+=.16;rows[2][3]-=.045;}
   }
  }
  const fromStand=1-smooth(t/.18),toSeat=smooth((t-.88)/.12);
  if(fromStand)for(const [node,start] of initial){Quaternion.SlerpToRef(node.rotationQuaternion,start,fromStand,node.rotationQuaternion);node.markAsDirty();}
  const reach=smooth(t/.25)*(1-smooth((t-.69)/.26));
  lift.rotation.y=-.62*reach;lift.markAsDirty();
  // Turn the chest to face the saddle before taking weight. Distribute the
  // turn along the ribcage so reaching forward does not tip one shoulder
  // up beside the ear. Forward inclination builds as the rider pushes up.
  const press=smooth((t-.30)/.26)*(1-smooth((t-.67)/.22)),lean=.10*reach+.32*press;
  Vector3.TransformNormalToRef(Vector3.UpReadOnly,seat,up);up.normalize();
  for(const [a,b,share] of back){
   const joint=bones[a];joint.rotationQuaternion.copyFrom(initial.get(joint));joint.markAsDirty();joint.computeWorldMatrix();
   Quaternion.RotationAxisToRef(up,-.74*reach*share,turn);
   turn.multiplyToRef(joint.absoluteRotationQuaternion,worldRot);joint.parent.absoluteRotationQuaternion.conjugateToRef(parentInv);
   parentInv.multiplyToRef(worldRot,joint.rotationQuaternion);joint.markAsDirty();joint.computeWorldMatrix();
   local.set(-lean,1,.19*press);Vector3.TransformNormalToRef(local,seat,p);p.addInPlace(joint.absolutePosition);rotateTo(joint,bones[b],p);
  }
  bones.Neck.computeWorldMatrix();local.set(-.09*press,1,.15*reach);Vector3.TransformNormalToRef(local,seat,p);
  p.addInPlace(bones.Neck.absolutePosition);rotateTo(bones.Neck,bones.Head,p);
  worldPoint('Hips',t,seat,rootPos,landingWeight);bones.Hips.computeWorldMatrix();rootPos.subtractToRef(bones.Hips.absolutePosition,delta);
  Vector3.TransformNormalToRef(delta,actorInv,p);lift.position.addInPlace(p);lift.markAsDirty();
  // Near knee stays outside the barrel; the far knee sweeps aft with the
  // boot, above the croup, before turning forward onto the far flank.
  for(const [i,side] of sides.entries()){
   const near=i===0;worldPoint(side+'Foot',t,seat,goal,landingWeight);
   if(near)local.set(1.02,-.19,.31);
   else{
    const cross=smooth((t-.68)/.15),over=smooth((t-.48)/.17)*(1-smooth((t-.81)/.13));
    local.set(1.02-1.77*cross,-.25+.99*over,.28-.46*over);
   }
   Vector3.TransformCoordinatesToRef(local,seat,pole);
   const swing=near?0:smooth((t-.56)/.07)*(1-smooth((t-.87)/.095));
   if(swing){
    const hip=bones.RightUpLeg;hip.computeWorldMatrix();bones.RightLeg.computeWorldMatrix();bones.RightFoot.computeWorldMatrix();
    const thigh=Vector3.Distance(hip.absolutePosition,bones.RightLeg.absolutePosition),shin=Vector3.Distance(bones.RightLeg.absolutePosition,bones.RightFoot.absolutePosition);
    curve(swingArc,t,sweep);
    // On dismount the boot meets the released near leg beside the horse.
    // Carry a soft knee into that descent instead of straightening for the
    // ground push used when mounting.
    const join=dismounting?1-smooth((t-.56)/.13):0;
    const flex=sweep.z+(36-sweep.z)*join;
    const arcReach=Math.sqrt(thigh*thigh+shin*shin+2*thigh*shin*Math.cos(flex*radians));
    const azimuth=sweep.x*radians,elevation=sweep.y*radians,horizontal=Math.cos(elevation)*arcReach;
    local.set(horizontal*Math.cos(azimuth),Math.sin(elevation)*arcReach,-horizontal*Math.sin(azimuth));
    Vector3.TransformNormalToRef(local,seat,sweptFoot);sweptFoot.addInPlace(hip.absolutePosition);
    const spanWeight=smooth((t-.56)/.018)*(1-smooth((t-.87)/.095));
    const baseSpan=Math.min(thigh+shin,Vector3.Distance(goal,hip.absolutePosition));
    const legReach=baseSpan+(arcReach-baseSpan)*spanWeight;
    Vector3.LerpToRef(goal,sweptFoot,swing,goal);goal.subtractInPlace(hip.absolutePosition).normalize().scaleInPlace(legReach).addInPlace(hip.absolutePosition);
    // Follow the travelling femur, giving the knee a little outward rotation
    // while it is on the near side, then letting it drop on the far flank.
    const flank=smooth((t-.815)/.065);
    local.set(.45*Math.cos(azimuth)-.88*flank,-.95+.92*flank,.28+.22*flank);
    Vector3.TransformNormalToRef(local,seat,sweptPole);sweptPole.addInPlace(hip.absolutePosition);
    Vector3.LerpToRef(pole,sweptPole,swing,pole);
   }
   if(fromStand){standingPoint(side+'Leg',standing,startPole);Vector3.LerpToRef(pole,startPole,fromStand,pole);}
   ik(bones[side+'UpLeg'],bones[side+'Leg'],bones[side+'Foot'],goal,pole);
   const ankle=bones[side+'Foot'];ankle.computeWorldMatrix();
   local.set(near?.02:.17*(1-smooth((t-.62)/.16)),-.22,.94);
   if(swing){
    // Turn the toes *around* the outside, through backward into the off-side
    // stirrup. Interpolating opposed direction vectors flips the sole halfway.
    const out=smooth((t-.56)/.16),down=smooth((t-.79)/.175);
    const restYaw=Math.atan2(local.x,local.z),restPitch=Math.atan2(local.y,Math.hypot(local.x,local.z));
    const around=Math.PI/2+sweep.x*radians,yaw=restYaw+(around-restYaw)*out+(2*Math.PI+restYaw-around)*down;
    const pitch=restPitch+(-.70-restPitch)*out*(1-down);
    local.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
   }
   Vector3.TransformNormalToRef(local,seat,p);
   if(fromStand){ground[side+'ToeBase'].subtractToRef(ground[side+'Foot'],startToe);Vector3.TransformNormalToRef(startToe,actor.getWorldMatrix(),startToe);Vector3.LerpToRef(p,startToe.normalize(),fromStand,p);}
   p.addInPlace(ankle.absolutePosition);rotateTo(ankle,bones[side+'ToeBase'],p);
   const shoulder=bones[side+'Arm'],elbow=bones[side+'ForeArm'],hand=bones[side+'Hand'];
   shoulder.computeWorldMatrix();worldPoint(side+'Hand',t,seat,goal);
   // The pole follows its shoulder down and out, rather than sitting above
   // the head when the rider is still standing below the pad.
   local.set(.38,-.85,near?.56:-.56);Vector3.TransformNormalToRef(local,seat,pole);pole.addInPlace(shoulder.absolutePosition);
   if(fromStand){standingPoint(side+'ForeArm',standing,startPole);Vector3.LerpToRef(pole,startPole,fromStand,pole);}
   ik(shoulder,elbow,hand,goal,pole,true);
   const fingers=bones[side+'Fingers'];
   if(fingers){
    hand.computeWorldMatrix();hand.absolutePosition.subtractToRef(elbow.absolutePosition,wristLine);wristLine.normalize();
    local.set(-1,.06,near?.19:-.08);Vector3.TransformNormalToRef(local,seat,p);
    Vector3.LerpToRef(wristLine,p.normalize(),.45*reach,p);p.addInPlace(hand.absolutePosition);rotateTo(hand,fingers,p);
   }
  }
  if(toSeat)for(const [node,rotation] of seated){
   Quaternion.SlerpToRef(node.rotationQuaternion,rotation,toSeat,node.rotationQuaternion);
   node.markAsDirty();
  }
  if(dismounting&&t>0&&t<.46){
   if(landingCape===undefined)landingCape=createLandingCape(byName);
   landingCape?.apply(t);
  }
 }
 return {ready:true,apply,reset};
}
