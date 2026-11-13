import {Vector3} from '@babylonjs/core';
import {WolfV02Encounter} from './wolf-v02-encounter.js';
import {WolfV02Brain,WOLF_V02_COMBAT_PROFILES} from './wolf-v02-spec.js';
import {WolfV02HurtVolumes} from './wolf-v02-hurt.js';
import {WOLF_CLIPS} from './wolf-spec.js';
import {WOLF_V02_ACTIVE_CLIPS} from './wolf-v02-authored-clips.js';
import {REGULAR_WOLF_VARIANTS,regularWolfBalance,regularWolfRuntimeProfile} from './regular-wolf-spec.js';
import {playerDimensions} from './player-dimensions.js';
import {RegularBoarBrain} from './regular-boar-brain.js';

export class RegularWolfEncounter extends WolfV02Encounter{
 constructor(world,onChange,onDamage,onPlayerHit,options={}){
  super(world,onChange,onDamage,onPlayerHit,options);
  const id=options.regularWolfId;if(!REGULAR_WOLF_VARIANTS[id])throw new Error('Regular wolf variant is required');
  this.summonKind=this.regularWolfId=id;this.displayName=REGULAR_WOLF_VARIANTS[id].label;
  const onDefeat=this.onDefeat;this.onDefeat=event=>onDefeat({...event,kind:id,actorVariant:id});
  this.balance=regularWolfBalance(id);for(const key of ['radius','separationRadius','stopDistance','renderRangePadding'])this[key]=this.balance[key];
  this.combatProfile=WOLF_V02_COMBAT_PROFILES.regularWolf;
 }
 prepareAsset(){
  this.runtimeProfile=regularWolfRuntimeProfile(this.regularWolfId,this.config);
  // New, registered fitted GLBs embed their own keys. The original R8 hash
  // guard remains unchanged and cannot attach its absolute keys to these rigs.
  const names=this.asset.animationGroups.map(group=>group.name),required=[...Object.values(WOLF_CLIPS),...WOLF_V02_ACTIVE_CLIPS.map(clip=>clip.name)];
  if(new Set(names).size!==names.length||required.some(name=>!names.includes(name))||names.length!==22)throw new Error('Regular wolf requires all 22 fitted clips');
  if(!this.runtimeProfile.hurtVolumes?.length||!this.runtimeProfile.contactShapes)throw new Error('Regular wolf anatomy/contact profile is missing');
  this.contactShapes=Object.fromEntries(Object.entries(this.runtimeProfile.contactShapes).map(([name,shape])=>[name,{offset:Vector3.FromArray(shape.offset),radius:shape.radius}]));
 }
 createBrain(durations){
  const Brain=this.regularWolfId==='boar'?RegularBoarBrain:WolfV02Brain;
  const brain=new Brain(durations,this.balance,Math.random,this.runtimeProfile);
  brain.ramReach=this.runtimeProfile.ramReach;return brain;
 }
 contactShape(name,kind){return this.contactShapes[kind==='ram'&&name==='head'?'headRam':kind==='maul'&&name==='jaw'?'jawMaul':name.includes('paw')?'paw':name]??this.contactShapes.head;}
 contactSeparation(){
  // Small animals must allow a real close-range strike. The legacy standing
  // convenience gap is almost 30 cm wider than the warrior's actual body.
  // Keep ram/dodge leases first, then use the same physical pair in idle/move.
  if(this.v02Ram?.hasClearanceLease()||this.dodgeContactClearance)return super.contactSeparation();
  return this.radius+playerDimensions(this.player).moveRadius;
 }
 hurtCapsules(){this.v02Hurt??=new WolfV02HurtVolumes(this.nodes,this.config.scale,this.runtimeProfile.hurtVolumes);return this.v02Hurt.sample();}
 inspect(){return {...super.inspect(),source:this.config?.sourceAssetId,variant:this.regularWolfId,combatProfile:'regularWolf',fittedHeight:this.config?.height};}
}
