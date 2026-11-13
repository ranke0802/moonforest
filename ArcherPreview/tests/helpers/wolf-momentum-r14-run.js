import {wolfMomentumR14Fixture} from './wolf-momentum-r14-fixture.js';
import {momentumRow,compareRunBody,fixedLimbLengths,fixedLimbError,actualPlayerLift} from './wolf-momentum-r14-measures.js';
import {measureSkinContact} from '../../reports/wolf-v02-ram-r12/skin-contact.mjs';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
let api;
export async function momentumApi(){return api??=await wolfMomentumR14Fixture();}
export async function disposeMomentumApi(){if(api){await api.dispose();api=null;}}
const planar=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export async function runMomentumBout({fps=60,speed=1,distance=6,custom=true,moving=false,surface=false,beforeStep,afterStep,dtForFrame,seconds=28,tail=.25}={}){
 const api=await momentumApi(),e=await api.summon({distance,speed,sequence:custom?['lunge']:null}),lengths=fixedLimbLengths(e),rows=[],hits=[],actions=[];
 let previous=momentumRow(api,e),serial=null,ended=null,hp=e.playerHp,lastAction=null,maxLimbError=0,maxScaleError=0;
 for(let frame=0;frame<fps*seconds;frame++){
  beforeStep?.({api,e,frame,hits,rows,serial});const dt=dtForFrame?.({api,e,frame,hits,rows,serial})??1/fps;
  api.step(dt,moving?{x:.25*Math.cos(api.elapsed*1.1),y:.12*Math.sin(api.elapsed*.7)}:{});
  const row=momentumRow(api,e),errors=fixedLimbError(e,lengths);row.dt=dt;row.worldSpeed=planar(row.wolf,previous.wolf)/dt;row.playerSpeed=planar(row.player,previous.player)/dt;row.nativeLift=actualPlayerLift(api);row.impactDetails=api.impact?.inspect?.()??null;
  if(row.poseClip===WOLF_CLIPS.run&&row.blend===1)row.runBodyOracle=compareRunBody(api.f,row);
  maxLimbError=Math.max(maxLimbError,errors.length);maxScaleError=Math.max(maxScaleError,errors.scale);rows.push(row);
  if(e.brain.actionId&&e.brain.serial!==lastAction){lastAction=e.brain.serial;actions.push({id:e.brain.actionId,serial:e.brain.serial,time:api.elapsed,poseClip:e.animator.current});}
  if(e.brain.actionId==='lunge'&&serial===null)serial=e.brain.serial;
  if(e.playerHp<hp){const part=e.v02LastContact?.part??(hits.length?'jaw':'head');hits.push({...row,damage:hp-e.playerHp,hp:e.playerHp,skin:surface?measureSkinContact(api,e,{part,torsoOnly:part==='jaw'}):null,torsoSkin:api.torsoSkin()});}hp=e.playerHp;
  afterStep?.({api,e,frame,hits,rows,row,serial});
  if(serial!==null&&(!e.active||e.brain.serial!==serial)&&ended===null)ended=api.elapsed;
  previous=row;if(ended!==null&&api.elapsed>ended+tail)break;
 }
 const result={fps,speed,distance,custom,moving,serial,ended,rows,hits,actions,maxLimbError,maxScaleError,reactions:structuredClone(api.reactions),final:{hp:e.playerHp,captured:!!api.controller.captured,impact:api.impact?.inspect?.()??null,ram:structuredClone(e.inspect().ram)}};
 api.f.battle.hide();return result;
}
