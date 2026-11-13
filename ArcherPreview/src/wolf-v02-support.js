import {WOLF_V02_BACK_RUN,WOLF_V02_CLOSE_RAM} from './wolf-v02-spec.js';

// Reuse the actor's single fixed-length pose solver and cached affected branches.
// Only the support schedule differs from ordinary run/orbit. No second sampler,
// copied pose, bone scale or independent transform owner is introduced.
export class WolfV02Support{
 constructor(e){
  this.e=e;this.schedules=new Map();
  for(const name of [WOLF_V02_BACK_RUN,WOLF_V02_CLOSE_RAM]){
   const clip=e.config.catalog.find(clip=>clip.name===name);if(!clip)continue;
   this.schedules.set(name,e.v02Pose.legs.map(leg=>(clip.supportPhases??[]).filter(phase=>phase.feet.includes(leg.name+'.paw')).map(phase=>[phase.start,phase.end])));
  }
 }
 apply(){
  const e=this.e,b=e.brain,pose=e.v02Pose,schedule=this.schedules.get(b.state);if(!schedule)return false;
  const first=pose.serial!==b.serial;if(first){pose.resetPlants();pose.serial=b.serial;}
  for(let i=0;i<pose.legs.length;i++){
   const leg=pose.legs[i],ranges=schedule[i];let stance=false;
   for(const range of ranges)if(b.time>=range[0]&&b.time<range[1]-1e-8){stance=true;break;}
   if(!stance){leg.planted=false;continue;}pose.plant(leg,first);pose.solveLeg(leg);
  }
  return true;
 }
}
