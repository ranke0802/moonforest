// The warrior dozing in the wagon bed for the 0.3 opening (2026-11-20, user:
// lying down with sword and shield looked odd; sitting, unarmed, suits it).
// The model has no sitting clip, so the limbs are set over whatever clip is
// playing (bone-pose.js): seated on the boards with the back to the tailgate,
// legs out in front, hands in the lap, head nodding forward while asleep.
// apply(weight, doze): weight 1 seated; doze 1 head down, 0 looking up.
import {createBonePose} from './bone-pose.js';

// [bone, its child joint, direction awake [up, front, left], direction dozing (optional)].
export const SIT_CHAINS=Object.freeze([
 // twist: turn the bone about the body's up axis so its joint pair faces across the body
 {twist:'mixamorig:Hips',a:'mixamorig:RightUpLeg',b:'mixamorig:LeftUpLeg'},
 ['mixamorig:Spine','mixamorig:Spine1',[1,-.22,0]],['mixamorig:Spine1','mixamorig:Spine2',[1,-.18,0]],['mixamorig:Spine2','mixamorig:Neck',[1,-.1,0],[1,.25,0]],
 {twist:'mixamorig:Spine2',a:'mixamorig:RightArm',b:'mixamorig:LeftArm'},
 ['mixamorig:Neck','mixamorig:Head',[1,.12,0],[.55,.85,.08]],['mixamorig:Head','mixamorig:HeadTop_End',[1,.05,0],[.3,.95,.12]],
 {twist:'mixamorig:Head',a:'mixamorig:Head',b:'headfront',face:true},
 // arms down the sides, forearms forward into the lap
 ['mixamorig:LeftArm','mixamorig:LeftForeArm',[-1,.3,.18]],['mixamorig:LeftForeArm','mixamorig:LeftHand',[-.35,1,-.25]],
 ['mixamorig:RightArm','mixamorig:RightForeArm',[-1,.3,-.18]],['mixamorig:RightForeArm','mixamorig:RightHand',[-.35,1,.25]],
 // thighs out in front, a little apart; shins on along the boards, knees barely bent
 ['mixamorig:LeftUpLeg','mixamorig:LeftLeg',[.08,1,.1]],['mixamorig:LeftLeg','mixamorig:LeftFoot',[-.12,1,.04]],
 ['mixamorig:RightUpLeg','mixamorig:RightLeg',[.08,1,-.1]],['mixamorig:RightLeg','mixamorig:RightFoot',[-.12,1,-.04]],
]);

export function createSitPose(root,options){return createBonePose(root,SIT_CHAINS,options);}
