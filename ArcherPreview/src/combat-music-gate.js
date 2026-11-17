import {encounterInCombat} from './combat-readability.js';

// Audio owns this small latch. Territory admission/rising/idle observation are
// not proof that combat has actually started. Never change AI or hit timing.
const committedModes=new Set(['move','approach','attack','cast','guard','evade','hit','retreat']);
export class CombatMusicGate{
 constructor(){this.reset();}
 reset(){this.actors=new Map();this.present=new Set();this.fighting=[];}
 update(encounters=[]){
  this.present.clear();this.fighting.length=0;
  for(const enemy of encounters){
   const brain=enemy?.brain;if(!brain)continue;
   this.present.add(enemy);
   let memory=this.actors.get(enemy);
   if(!memory||memory.brain!==brain){memory={brain,hp:brain.hp,started:false};this.actors.set(enemy,memory);}
   const damaged=Number.isFinite(memory.hp)&&brain.hp<memory.hp;
   memory.hp=brain.hp;
   if(!enemy.active||!(brain.hp>0)||enemy.reviewMode||!encounterInCombat(enemy)){memory.started=false;continue;}
   if(committedModes.has(brain.mode)||damaged||brain.stagger>0)memory.started=true;
   if(memory.started)this.fighting.push(enemy);
  }
  for(const enemy of this.actors.keys())if(!this.present.has(enemy))this.actors.delete(enemy);
  return this.fighting;
 }
}
