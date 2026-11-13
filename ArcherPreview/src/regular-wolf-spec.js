import {WOLF_BALANCE,WOLF_SCALE} from './wolf-spec.js';
import {WOLF_V02_ACTIONS,WOLF_V02_GAIT,WOLF_V02_TACTICS} from './wolf-v02-spec.js';
import sourceLocks from './regular-wolf-source-locks.json' with {type:'json'};

// Independently fitted quadrupeds share clip roles, never live skeletons.
export const REGULAR_WOLF_VERSION='Regular quadrupeds R1 · body-fitted alpha motions';
export const REGULAR_WOLF_SCALED_VERSION='Regular quadrupeds R2 · 1.5x actor scale';
export const REGULAR_BOAR_SCALED_VERSION='Regular quadrupeds R2 · 2.5x boar actor scale';
const originalVariants={
 'gray-wolf':Object.freeze({id:'gray-wolf',label:'회색 늑대',height:1.05,width:.55820,length:1.32517}),
 'stylized-wolf':Object.freeze({id:'stylized-wolf',label:'늑대 2',height:1.1,width:.58350,length:1.37999}),
 'wolf-3':Object.freeze({id:'wolf-3',label:'늑대 3',height:1.1,width:.41795,length:1.27479}),
 fox:Object.freeze({id:'fox',label:'여우',height:.7,width:.4480916236040906,length:1.0011178409192127}),
 boar:Object.freeze({id:'boar',label:'멧돼지',height:1,width:.9106487148102815,length:1.5159118727050183}),
};
const enlarged=new Set(['gray-wolf','stylized-wolf','wolf-3','fox']);
export const regularWolfActorScale=id=>id==='boar'?2.5:enlarged.has(id)?1.5:1;
export const regularWolfManifest=id=>regularWolfActorScale(id)>1?id+'-r2':id;
export const regularWolfVersion=id=>id==='boar'?REGULAR_BOAR_SCALED_VERSION:enlarged.has(id)?REGULAR_WOLF_SCALED_VERSION:REGULAR_WOLF_VERSION;
export const REGULAR_WOLF_VARIANTS=Object.freeze(Object.fromEntries(Object.entries(originalVariants).map(([id,value])=>{
 const actorScale=regularWolfActorScale(id);return [id,Object.freeze({...value,actorScale,height:value.height*actorScale,width:value.width*actorScale,length:value.length*actorScale})];
})));
export const isRegularWolf=id=>Object.hasOwn(REGULAR_WOLF_VARIANTS,id);
const runtimeProfiles=new WeakMap();
export function regularWolfSize(id){
 const v=REGULAR_WOLF_VARIANTS[id];if(!v)throw new RangeError('Unknown regular wolf: '+id);
 const spatialScale=v.length/(1.9014592170715332*WOLF_SCALE);
 return {spatialScale,radius:Math.max(.25*v.actorScale,v.width*.64),separationRadius:Math.max(.32*v.actorScale,v.width*.76),stopDistance:1.8*WOLF_SCALE*spatialScale,renderRangePadding:v.length*1.6};
}
export function regularWolfBalance(id){
 const size=regularWolfSize(id),s=size.spatialScale,actorScale=regularWolfActorScale(id);
 return {...WOLF_BALANCE,...size,hp:300,walkSpeed:1.2,runSpeed:4.2,detectRange:28,runDistance:8,attackDistance:WOLF_BALANCE.attackDistance*s,lungeMinDistance:WOLF_BALANCE.lungeMinDistance*s,lungeDistance:WOLF_BALANCE.lungeDistance*s,pinDistance:WOLF_BALANCE.pinDistance*s,biteRange:WOLF_BALANCE.biteRange*s,biteContactRadius:.22*actorScale,safeDistance:1.4*actorScale,biteDamage:40,pinDamage:50,gold:25};
}
export function regularWolfRuntimeProfile(id,config){
 const size=regularWolfSize(id),s=size.spatialScale,profile=config.canineProfile;
 const lock=sourceLocks[id];
 if(!profile||!lock||profile.id!==id||profile.version!==1||profile.sourceSha256!==config.sourceSha256||profile.sourceSha256!==lock.sourceSha256||profile.anatomySha256!==lock.anatomySha256||profile.motionSourceSha256!==lock.motionSourceSha256||config.scale!==lock.scale||config.height!==lock.height||profile.motionSourceSha256!=='38057d9820c296c883a5545fc7528bffdda88e78387b9b5b1fe117b89cb09bce')throw new Error('Regular wolf requires its registered fitted motion profile: '+id);
 const cached=runtimeProfiles.get(profile);if(cached){if(cached.modelScale!==config.scale)throw new Error('Regular wolf model scale differs from its fitted profile');return cached;}
 const runSourceSpeed=profile.runSourceSpeed??(WOLF_V02_GAIT.runSourceSpeed*WOLF_SCALE*s/config.scale);
 const actions=Object.fromEntries(WOLF_V02_ACTIONS.map(action=>{
  const reach=profile.attacks?.[action.id];
  return [action.id,Object.freeze({...action,range:reach?.range??action.range*s,minDistance:reach?.minDistance??action.minDistance*s,maxDistance:reach?.maxDistance??action.maxDistance*s,preferredDistance:reach?.preferredDistance??action.preferredDistance*s,damage:Math.round(action.damage*.45),ramPhases:action.ramPhases?.map(phase=>Object.freeze({...phase,damage:Math.round(phase.damage*.45)}))})];
 }));
 const actorScale=regularWolfActorScale(id);
 const result={...size,actions,gait:{...WOLF_V02_GAIT,runSpeed:4.2,farRunSpeed:6,runAcceleration:8,runSourceSpeed,runPlaybackRate:4.2/(runSourceSpeed*config.scale),orbitRadius:profile.orbitRadius??WOLF_V02_GAIT.orbitRadius*WOLF_SCALE*s/config.scale},tactics:{...WOLF_V02_TACTICS,retreatDistance:2.4*actorScale,maximumRetreatRange:5*actorScale},modelScale:config.scale,ramReach:profile.ramReach,catchDistance:profile.catchDistance??Math.max(.7*actorScale,1.90*s),ramPairClearance:profile.ramPairClearance,catchTolerance:.03*actorScale,forepawBrace:'floor',forepawPadHeight:profile.forepawPadHeight,hurtVolumes:profile.hurtVolumes,contactShapes:profile.contactShapes,runRamOverlay:profile.runRamOverlay};
 runtimeProfiles.set(profile,result);return result;
}
