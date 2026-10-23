import { BossEncounter } from './boss-encounter.js';
import { GoblinBrain, GOBLIN_BY_NAME } from './goblin-spec.js';
export class GoblinEncounter extends BossEncounter {
 constructor(...args){super(...args);this.kind='goblin';this.radius=.34;this.stopDistance=1.05;this.separationRadius=.42;}
 createBrain(durations){return new GoblinBrain(durations);}
 motionSpec(name){return GOBLIN_BY_NAME[name];}
 attackRange(spec){return spec?.range??1.6;}
 attackDamage(event){return event.damage;}
 isHeavyAttack(){return false;}
}
