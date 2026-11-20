// Poses the 0.3 opening needs and the models have no clip for (2026-11-20):
// the driver thrown from the bench and lying on the ground, and both men
// pushing the wagon back onto its wheels. Directions are [up, front, left] in
// the body's own frame (bone-pose.js); joints only bend, by amounts a body
// can do, so skin and clothes are not pulled out of shape.
import {createBonePose} from './bone-pose.js';

// Lying on the back (the body's front faces the sky, so a negative front
// points into the ground: limbs slope down from the joints to rest on it).
// The right arm stays close to where it hangs when standing: the driver's
// apron is skinned to that hand and follows it.
// The second direction is the same body stirring in pain (2026-11-20, user:
// he must not lie dead still): the chest lifts, the head rolls over to the
// other side, the hand comes off the ground a little, the knee draws up. The
// story moves slowly between the two.
export const LIE_CHAINS=Object.freeze([
 ['mixamorig:Spine','mixamorig:Spine1',[1,.02,.04]],['mixamorig:Spine1','mixamorig:Spine2',[1,.03,.07],[1,.07,.03]],['mixamorig:Spine2','mixamorig:Neck',[1,.04,.09],[1,.11,.02]],
 // the head rolled to its left, resting
 ['mixamorig:Neck','mixamorig:Head',[1,.06,.28],[1,.13,-.1]],['mixamorig:Head','mixamorig:HeadTop_End',[1,.02,.42],[1,.1,-.18]],
 // left arm flung out, elbow bent, hand up by the head
 ['mixamorig:LeftArm','mixamorig:LeftForeArm',[-.2,-.2,1],[-.34,-.13,1]],['mixamorig:LeftForeArm','mixamorig:LeftHand',[.8,-.03,.6],[.56,.12,.8]],
 // right arm down along the side, a little away from the body
 ['mixamorig:RightArm','mixamorig:RightForeArm',[-1,-.18,-.32]],['mixamorig:RightForeArm','mixamorig:RightHand',[-1,-.07,-.1]],
 // left leg straight, right knee a little up and out
 ['mixamorig:LeftUpLeg','mixamorig:LeftLeg',[-1,-.12,.2]],['mixamorig:LeftLeg','mixamorig:LeftFoot',[-1,-.05,.12]],
 ['mixamorig:RightUpLeg','mixamorig:RightLeg',[-1,.26,-.3],[-1,.4,-.22]],['mixamorig:RightLeg','mixamorig:RightFoot',[-.9,-.42,.1],[-.8,-.6,.08]],
]);

// Pushing: the trunk leans into it and both arms reach for the wagon. The
// second direction is for hands high over the head (the roof edge when the
// wagon is half way up); blend moves between the two.
export const PUSH_CHAINS=Object.freeze([
 ['mixamorig:Spine','mixamorig:Spine1',[1,.3,0],[1,.12,0]],['mixamorig:Spine1','mixamorig:Spine2',[1,.4,0],[1,.16,0]],['mixamorig:Spine2','mixamorig:Neck',[1,.45,0],[1,.18,0]],
 ['mixamorig:Neck','mixamorig:Head',[1,.25,0],[1,-.05,0]],['mixamorig:Head','mixamorig:HeadTop_End',[1,.02,0],[1,-.3,0]],
 ['mixamorig:LeftArm','mixamorig:LeftForeArm',[-.45,1,.24],[.6,.85,.2]],['mixamorig:LeftForeArm','mixamorig:LeftHand',[-.1,1,-.12],[.95,.45,-.06]],
 ['mixamorig:RightArm','mixamorig:RightForeArm',[-.45,1,-.24],[.6,.85,-.2]],['mixamorig:RightForeArm','mixamorig:RightHand',[-.1,1,.12],[.95,.45,.06]],
]);
// The driver pushes with his left arm and shoulder; his right arm stays low
// (the apron follows that hand, see LIE_CHAINS).
export const PUSH_CHAINS_LEFT=Object.freeze([
 ...PUSH_CHAINS.slice(0,7),
 ['mixamorig:RightArm','mixamorig:RightForeArm',[-1,.22,-.2]],['mixamorig:RightForeArm','mixamorig:RightHand',[-.85,.5,-.02]],
]);
// The stance: one leg forward and bent, the other back and straight. The
// second direction is the mirrored stance, so blend steps from one foot to
// the other between heaves.
export const STEP_CHAINS=Object.freeze([
 ['mixamorig:LeftUpLeg','mixamorig:LeftLeg',[-.8,.6,.08],[-1,-.4,.08]],['mixamorig:LeftLeg','mixamorig:LeftFoot',[-1,-.12,0],[-.9,-.45,0]],
 ['mixamorig:RightUpLeg','mixamorig:RightLeg',[-1,-.4,-.08],[-.8,.6,-.08]],['mixamorig:RightLeg','mixamorig:RightFoot',[-.9,-.45,0],[-1,-.12,0]],
]);

// Half way up from the ground: knees bent under him, trunk leaning forward,
// hands down toward the knees (between sitting and standing).
export const CROUCH_CHAINS=Object.freeze([
 ['mixamorig:Spine','mixamorig:Spine1',[1,.4,0]],['mixamorig:Spine1','mixamorig:Spine2',[1,.45,0]],['mixamorig:Spine2','mixamorig:Neck',[1,.4,0]],
 ['mixamorig:Neck','mixamorig:Head',[1,.15,0]],
 ['mixamorig:LeftArm','mixamorig:LeftForeArm',[-.85,.45,.22]],['mixamorig:LeftForeArm','mixamorig:LeftHand',[-.75,.6,-.08]],
 ['mixamorig:RightArm','mixamorig:RightForeArm',[-1,.3,-.2]],['mixamorig:RightForeArm','mixamorig:RightHand',[-.9,.4,0]],
 ['mixamorig:LeftUpLeg','mixamorig:LeftLeg',[-.3,1,.14]],['mixamorig:LeftLeg','mixamorig:LeftFoot',[-1,-.4,0]],
 ['mixamorig:RightUpLeg','mixamorig:RightLeg',[-.3,1,-.14]],['mixamorig:RightLeg','mixamorig:RightFoot',[-1,-.4,0]],
]);

export function createLiePose(root,options){return createBonePose(root,LIE_CHAINS,options);}
export function createCrouchPose(root,options){return createBonePose(root,CROUCH_CHAINS,options);}
// apply(weight, high, step): high 0 hands at chest height .. 1 over the head;
// step 0 left foot forward .. 1 right foot forward.
export function createPushPose(root,{leftOnly=false,...options}={}){
 const arms=createBonePose(root,leftOnly?PUSH_CHAINS_LEFT:PUSH_CHAINS,options),legs=createBonePose(root,STEP_CHAINS,options);
 return {
  get ready(){return arms.ready&&legs.ready;},
  feetAbove:()=>legs.feetAbove(),
  apply(weight,high=0,step=0){legs.apply(weight,step);arms.apply(weight,high);},
 };
}
