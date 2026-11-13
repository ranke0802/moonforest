import {wolfCombatR13Fixture} from './wolf-combat-r13-fixture.js';
import {measureSkinContact} from '../../reports/wolf-v02-ram-r12/skin-contact.mjs';
import {WOLF_V02_CLOSE_RAM} from '../../src/wolf-v02-spec.js';

let api;
export async function r13Api(){return api??=await wolfCombatR13Fixture();}
export async function disposeR13(){if(api){await api.dispose();api=null;}}
export const planar=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function snapshot(api,e){
 const body=api.bodyPoints(),inspect=e.inspect();
 return {time:api.elapsed,source:e.brain.time,serial:e.brain.serial,mode:e.brain.mode,behavior:e.brain.behavior,clip:e.brain.state,playerState:api.result.state,fallTime:api.result.clipTime,knockedDown:!!api.result.knockedDown,captured:!!api.controller.captured,body,player:api.f.player.position.asArray(),wolf:e.actor.position.asArray(),paws:Object.fromEntries(['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'].map(n=>[n,e.nodes[n].getAbsolutePosition().asArray()])),ram:inspect.ram,marker:inspect.telegraph,contact:structuredClone(e.v02LastContact)};
}
// A new native controller/animator and combat lifetime is reset per case. The
// normal summon/rise/orbit/approach path is never replaced by a forced attack.
export async function runR13Ram({fps=60,speed=1,distance=6,custom=true,moving=false,surface=false,beforeStep,afterStep,dtForFrame,seconds=28,tail=.15}={}){
 const api=await r13Api(),e=await api.summon({distance,speed,sequence:custom?['lunge']:null}),rows=[],hits=[],actions=[];
 let lastHp=e.playerHp,serial=null,end=null,lastSerial=null;const limbLengths=Object.fromEntries(Object.entries(e.nodes).filter(([n])=>/^(fore|hind)\.[LR]\.(upper|lower|metatarsal|paw)$/.test(n)).map(([n,node])=>[n,node.position.length()]));let limbError=0,scaleError=0,maxStep=0,previous=e.actor.position.asArray();
 for(let frame=0;frame<fps*seconds;frame++){
  beforeStep?.({api,e,frame,hits,serial,rows});
  const dt=dtForFrame?.({api,e,frame,hits,serial,rows})??1/fps;
  const input=moving?{x:.25*Math.cos(api.elapsed*1.1),y:.12*Math.sin(api.elapsed*.7)}:{};
  api.step(dt,input);
  if(e.brain.mode==='attack'&&e.brain.serial!==lastSerial){lastSerial=e.brain.serial;actions.push({time:api.elapsed,id:e.brain.actionId,clip:e.brain.state,distance:planar(e.actor.position.asArray(),api.f.player.position.asArray())});if(e.brain.actionId==='lunge'&&serial===null)serial=e.brain.serial;}
  const row=snapshot(api,e);if(serial!==null)rows.push(row);
  for(const [n,length]of Object.entries(limbLengths)){limbError=Math.max(limbError,Math.abs(e.nodes[n].position.length()-length));scaleError=Math.max(scaleError,...e.nodes[n].scaling.asArray().map(v=>Math.abs(v-1)));}
  maxStep=Math.max(maxStep,planar(row.wolf,previous));previous=row.wolf;
  if(e.playerHp<lastHp){const phase=e.v02LastContact?.phase??(hits.length===0?'ram':`maul-${hits.length}`),part=phase==='ram'?'head':'jaw';hits.push({...row,phase,damage:lastHp-e.playerHp,hp:e.playerHp,skin:surface?measureSkinContact(api,e,{part,torsoOnly:part==='jaw'}):null,torsoSkin:api.torsoSkin()});}lastHp=e.playerHp;
  afterStep?.({api,e,frame,hits,serial,rows,row});
  if(serial!==null&&(!e.active||e.brain.serial!==serial)&&end===null)end=api.elapsed;
  if(end!==null&&api.elapsed>end+tail)break;
 }
 const result={fps,speed,distance,custom,moving,actions,rows,hits,end,limbError,scaleError,maxStep,reactions:structuredClone(api.reactions),final:{hp:e.playerHp,ram:structuredClone(e.inspect().ram),captured:!!api.controller.captured,position:api.f.player.position.asArray()}};
 api.f.battle.hide();return result;
}
