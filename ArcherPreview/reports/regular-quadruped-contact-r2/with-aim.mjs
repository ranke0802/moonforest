import {runContactProbe} from './probe.mjs';
import {PlayerMeleeAim} from '../../src/player-melee-aim.js';
const createAim=({api})=>{
 const aim=new PlayerMeleeAim(api.playerAsset);let maximumPitch=0,maximumYaw=0,maximumExtension=0,positionChange=0,scaleChange=0,appliedFrames=0,applyMilliseconds=0,maximumApplyMilliseconds=0,applyCalls=0,activeMilliseconds=0,activeMaximum=0,minimumExtendedElbowBend=Infinity;
 const joints=api.playerAsset.transformNodes.filter(node=>/^mixamorig:(Left|Right)(Arm|ForeArm|Hand)$/.test(node.name));
 const ancestry=Object.fromEntries(['Right','Left'].map(side=>[side,!!aim.arms[side]?.branch.includes(aim.weapons[side])]));
 return {
  beforeNativeAnimation(){aim.restore();},
  afterNativeAnimation({enemy,result,dt}){
   const before=joints.map(node=>({node,position:node.position.clone(),scale:node.scaling.clone()}));
   aim.begin(result,api.f.player,enemy??api.f.battle.nearestTarget(api.f.player.position));const started=performance.now();aim.apply(result,api.f.player,dt);const elapsed=performance.now()-started;applyMilliseconds+=elapsed;maximumApplyMilliseconds=Math.max(maximumApplyMilliseconds,elapsed);applyCalls++;
   maximumPitch=Math.max(maximumPitch,Math.abs(aim.lastPitch));maximumYaw=Math.max(maximumYaw,Math.abs(aim.lastYaw??aim.yaw??0));maximumExtension=Math.max(maximumExtension,Math.abs(aim.lastExtension??0));if(Object.values(aim.arms).some(arm=>arm?.changed)){appliedFrames++;activeMilliseconds+=elapsed;activeMaximum=Math.max(activeMaximum,elapsed);}
   const left=aim.arms.Left;
   if(left?.elbow?.changed&&aim.lastExtension>1e-5){
    const shoulder=left.node.getAbsolutePosition(),elbow=left.elbow.node.getAbsolutePosition(),hand=left.elbow.hand.getAbsolutePosition(),u=elbow.subtract(shoulder).normalize(),v=hand.subtract(elbow).normalize();
    minimumExtendedElbowBend=Math.min(minimumExtendedElbowBend,Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.y*v.y+u.z*v.z))));
   }
   for(const row of before){positionChange=Math.max(positionChange,row.position.subtract(row.node.position).length());scaleChange=Math.max(scaleChange,row.scale.subtract(row.node.scaling).length());}
  },
  inspect(){
   const expected=Object.values(aim.arms).flatMap(arm=>!arm?[]:[...(arm.changed?[{node:arm.node,rotation:arm.original.clone()}]:[]),...(arm.elbow?.changed?[{node:arm.elbow.node,rotation:arm.elbow.original.clone()}]:[])]);aim.restore();
   const restoreError=expected.reduce((maximum,{node,rotation})=>Math.max(maximum,...rotation.asArray().map((value,k)=>Math.abs(value-node.rotationQuaternion.asArray()[k]))),0);
   return {ancestry,checkedJointNames:joints.map(node=>node.name),maximumPitchRadians:maximumPitch,maximumYawRadians:maximumYaw,maximumElbowExtensionRadians:maximumExtension,minimumExtendedElbowBendRadians:Number.isFinite(minimumExtendedElbowBend)?minimumExtendedElbowBend:null,armLocalPositionChange:positionChange,armLocalScaleChange:scaleChange,restoreRotationMaximumError:restoreError,appliedFrames,lastPhysicalAimError:aim.lastError,fitSearches:{full:aim.fullFitCount,local:aim.localFitCount},nativeApplyCpuMilliseconds:{calls:applyCalls,mean:applyMilliseconds/Math.max(1,applyCalls),maximum:maximumApplyMilliseconds,activeCalls:appliedFrames,activeMean:activeMilliseconds/Math.max(1,appliedFrames),activeMaximum}};
  },
  dispose(){aim.restore();},
 };
};
await runContactProbe({ids:process.env.CONTACT_PROBE_IDS?.split(',')??undefined,actions:process.env.CONTACT_PROBE_ACTIONS?.split(',')??undefined,label:process.env.CONTACT_PROBE_LABEL??'with-aim',createAim});
