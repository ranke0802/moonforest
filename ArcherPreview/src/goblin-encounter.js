import { BossEncounter } from './boss-encounter.js';
import { GoblinBrain, GOBLIN_BY_NAME } from './goblin-spec.js';
export class GoblinEncounter extends BossEncounter {
 constructor(...args){super(...args);this.kind='goblin';this.radius=.34;this.stopDistance=1.05;this.separationRadius=.42;}
 createBrain(durations){return new GoblinBrain(durations);}
 motionSpec(name){return GOBLIN_BY_NAME[name];}
 attackRange(spec){return spec?.range??1.6;}
 attackDamage(event){return event.damage;}
 isHeavyAttack(){return false;}
 hurtCapsules(){
  const capsules=super.hurtCapsules();
  if(['down','recover','dead'].includes(this.brain.mode))return capsules;
  const point=name=>this.nodes[`mixamorig:${name}`].getAbsolutePosition();
  const hip=point('Hips'),head=point('Head');
  const floor=Math.max(this.actor.position.y,Math.min(point('LeftFoot').y,point('RightFoot').y)-.08);
  // Height assistance for the short, crouching enemy. Horizontal reach still
  // comes from the actual swept blade and its original active strike windows.
  const radius=.4,top=Math.max(floor+1.8,head.y+.26);
  capsules.push({points:[[hip.x,floor+radius,hip.z],[hip.x,top-radius,hip.z]],radius});
  return capsules;
 }
}
