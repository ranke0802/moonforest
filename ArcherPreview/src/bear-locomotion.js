// The approved 4.5 m bear's in-place locomotion has zero net hip travel.
// Actual low-foot stance samples give ~2.225 / 8.22 world m per source second
// at scale 2.78416486584, hence these source-space gait speeds. Hip sway must
// never be mistaken for a stride or added as a second locomotion owner.
export const BEAR_SOURCE_GAIT_SPEED=Object.freeze({Walking:.8,Running:2.95});

export class BearLocomotion{
 constructor(encounter){
  this.e=encounter;const clip=encounter.config.catalog.find(c=>c.name==='Backflip');this.flip=clip;this.flipArc=new Float64Array(clip?.rootTrack.length??0);
  for(let i=1;i<this.flipArc.length;i++){const a=clip.rootTrack[i-1],b=clip.rootTrack[i];this.flipArc[i]=this.flipArc[i-1]+Math.hypot(b[0]-a[0],b[2]-a[2]);}
  this.reset();
 }
 reset(){this.gaitSerial=null;this.gaitState=null;this.gaitTime=0;this.flipSerial=null;this.flipTime=0;this.flipYaw=0;}
 distanceAt(time){
  if(!this.flipArc.length)return 0;const f=Math.max(0,Math.min(this.flipArc.length-1,time*this.flip.fps)),i=Math.floor(f),j=Math.min(this.flipArc.length-1,i+1);
  return this.flipArc[i]+(this.flipArc[j]-this.flipArc[i])*(f-i);
 }
 backflip(){
  const e=this.e,b=e.brain;if(this.flipSerial!==b.serial){this.flipSerial=b.serial;this.flipTime=0;this.flipYaw=e.actor.rotation.y;}
  const delta=Math.max(0,this.distanceAt(b.time)-this.distanceAt(this.flipTime))*e.config.scale;this.flipTime=b.time;
  e.actor.position.x-=Math.sin(this.flipYaw)*delta;e.actor.position.z-=Math.cos(this.flipYaw)*delta;
 }
 synchronize(before){
  const e=this.e,b=e.brain,sourceSpeed=BEAR_SOURCE_GAIT_SPEED[b.state];
  if(!sourceSpeed||!['move','approach'].includes(b.mode)||b.stagger>0||b.hp<=0){this.gaitSerial=null;return false;}
  if(this.gaitSerial!==b.serial||this.gaitState!==b.state){this.gaitSerial=b.serial;this.gaitState=b.state;this.gaitTime=0;}
  const p=e.actor.position,distance=Math.hypot(p.x-before.x,p.z-before.z);this.gaitTime+=distance/(sourceSpeed*e.config.scale);
  b.time=this.gaitTime%b.durations[b.state];
  // The ordinary update already advanced its native blend once. Only replace
  // this controlled source sample after collision chose the real displacement.
  e.animator.transition(b.state,{clipTime:b.time,actionId:b.serial,loop:true});e.animator.update(0);return true;
 }
}
