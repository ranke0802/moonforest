import {CHAPTER_BOSS_ATTACKS} from './chapter-boss-attacks.js';

// Metres and seconds in the chapter maps. Attack animation time is normalized
// to the published wind-up and recovery, independently of its source frame rate.
export const CHAPTER_COMBAT = {
  'goblin-warrior': {name:'고블린 전사', hp:115, damage:18, speed:2.35, reach:1.42, windup:.52, recover:.52, cooldown:.64},
  'goblin-archer': {name:'고블린 궁수', hp:92, damage:17, speed:1.95, reach:7.6, windup:.72, recover:.58, cooldown:1.15, missile:'arrow', velocity:11},
  'goblin-shaman': {name:'고블린 주술사', hp:128, damage:27, speed:1.6, reach:6.5, windup:1.1, recover:.75, cooldown:1.4, missile:'spell', velocity:6.2},
  // 2026-11-27 combat pass (1127-combat): hp 780 → 700, damage 48 → 44, a 0.3 s telegraph before each heavy club hit.
  'hobgoblin-boss': {name:'홉고블린', boss:true, hp:700, damage:44, speed:1.95, reach:2.03, windup:.88, recover:.85, cooldown:.9, heavy:true, telegraph:.3},
  'ghoul-warrior': {name:'구울 전사', boss:true, hp:720, damage:42, speed:2.55, reach:1.68, windup:.48, recover:.62, cooldown:.72},
  zombie: {name:'좀비', hp:138, damage:19, speed:1.04, reach:1.36, windup:.82, recover:.78, cooldown:.85},
};

// Telegraph: the hold starts this many seconds before the heavy contact; glow strength (hit flash is .23 s).
const TELEGRAPH_LEAD=.12,TELEGRAPH_FLASH=.3;
const labels = {idle:'대기', move:'이동', attack:'공격', dead:'격파', hit:'경직'};
export class ChapterEnemyBrain {
  constructor(profile, durations, kind) {
    this.profile=profile;this.durations=durations;this.hp=this.maxHp=profile.hp;
    this.visited=new Set();this.flash=0;this.flashDuration=.23;this.stagger=0;this.serial=0;
    this.wait=.35;this.hasSight=false;this.engaged=false;this.returning=false;
    this.moves=CHAPTER_BOSS_ATTACKS[kind];
    this.nextMove=0;this.guardFacing=true;
    this.change('idle','idle');
  }
  change(state,mode) {
    this.state=state;this.mode=mode;this.serial++;this.time=0;this.elapsed=0;
    this.impacted=false;this.move=null;this.nextHit=0;this.poseKey=1;this.visited.add(state);this.hold=0;this.heldHit=-1;
  }
  get label(){return labels[this.mode];}
  get defense(){
    const guard=this.move?.guard;
    return this.guardFacing&&guard&&this.elapsed>=guard.from&&this.elapsed<guard.to?'block':null;
  }
  advanceMove(dt,events){
    const move=this.move,tele=this.profile.telegraph,pending=move.hits[this.nextHit];
    // profile.telegraph (seconds): the pose holds just before a heavy hit and glows once.
    if(tele>0&&pending?.heavy&&this.heldHit!==this.nextHit&&this.elapsed+dt>=pending.at-TELEGRAPH_LEAD){
      if(!(this.hold>0)){this.telegraphSerial=(this.telegraphSerial??0)+1;if(this.flash<TELEGRAPH_FLASH){this.flash=TELEGRAPH_FLASH;this.flashDuration=TELEGRAPH_FLASH*2;}}
      // A long frame reaches the hold point, holds, and goes on with what is left of it.
      const lead=pending.at-TELEGRAPH_LEAD;let left=dt-Math.max(0,lead-this.elapsed);this.elapsed=Math.max(this.elapsed,lead);
      const used=Math.min(left,tele-this.hold);this.hold+=used;left-=used;
      if(this.hold>=tele-1e-9){this.heldHit=this.nextHit;this.hold=0;}
      dt=left;
    }
    const previous=this.elapsed;
    this.elapsed+=dt;
    const now=this.elapsed;
    while(this.nextHit<move.hits.length&&now>=move.hits[this.nextHit].at){
      const hit=move.hits[this.nextHit++];
      if(this.hasSight)events.push({
        type:'attack',kind:'melee',name:move.id,pass:this.nextHit,
        damage:Math.round(this.profile.damage*hit.power),heavy:!!hit.heavy,reach:move.reach,facing:move.facing,
      });
    }
    // Show the warning again during the wind-up of a separate follow-up.
    const next=move.hits[this.nextHit];
    this.impacted=!next||(this.nextHit>0&&next.at-now>.5);
    const poses=move.poses;
    while(this.poseKey<poses.length-1&&now>poses[this.poseKey][0])this.poseKey++;
    const [start,from]=poses[this.poseKey-1],[end,to]=poses[this.poseKey];
    const mix=Math.min(1,(now-start)/(end-start));
    this.time=this.durations.attack*(from+(to-from)*mix);
    const step=move.step;
    let travelled=0;
    if(step){
      const seconds=Math.max(0,Math.min(now,step.to)-Math.max(previous,step.from));
      travelled=step.metres*seconds/(step.to-step.from);
    }
    if(now>=poses.at(-1)[0]){this.change('idle','idle');this.wait=this.profile.cooldown;}
    return {events,speed:dt>0?travelled/dt:0};
  }
  hit({damage=18,heavy=false,stun=0}={}) {
    if(this.hp<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.flash=this.flashDuration=.23;
    if(!this.hp){this.change('death','dead');this.stagger=0;return true;}
    this.engaged=true;this.returning=false;
    this.change('hit','hit');this.stagger=Math.max(heavy?.48:.25,stun);
    return true;
  }
  parry(){if(!this.hp)return false;this.change('hit','hit');this.stagger=.92;return true;}
  update(dt,distance,available=true) {
    this.flash=Math.max(0,this.flash-dt);this.wait=Math.max(0,this.wait-dt);
    const events=[], p=this.profile;
    if(this.mode==='dead'){
      this.time=Math.min(this.durations.death,this.time+dt);return {events,speed:0};
    }
    if(this.stagger>0){
      this.time=Math.min(this.durations.hit,this.time+dt);this.stagger=Math.max(0,this.stagger-dt);
      if(this.stagger<=0)this.change('idle','idle');
      return {events,speed:0};
    }
    if(this.mode==='attack'&&(!this.engaged||!available))this.change('idle','idle');
    if(this.mode==='attack'){
      if(this.move)return this.advanceMove(dt,events);
      this.elapsed+=dt;
      // For the drawn bow/cast and the melee contact the authored strike is
      // at roughly the middle of the clip. Keep its timing legible on all rigs.
      const ratio=this.elapsed<p.windup?.5*this.elapsed/p.windup:.5+.5*(this.elapsed-p.windup)/p.recover;
      this.time=this.durations.attack*Math.min(1,ratio);
      if(!this.impacted&&this.elapsed>=p.windup){
        this.impacted=true;
        if(this.hasSight)events.push({type:'attack',kind:p.missile??'melee',damage:p.damage});
      }
      if(this.elapsed>=p.windup+p.recover){this.change('idle','idle');this.wait=p.cooldown;}
      return {events,speed:0};
    }
    const pursue=this.engaged&&available;
    const move=this.moves?.[this.nextMove],startReach=p.reach*(move?.startReach??1);
    if(pursue&&this.hasSight&&distance<=startReach&&this.wait<=0){
      this.change('attack','attack');
      if(move){
        this.move=move;
        this.nextMove=(this.nextMove+1)%this.moves.length;
        this.time=this.durations.attack*move.poses[0][1];
      }
      return {events,speed:0};
    }
    const moving=this.returning||(pursue&&(distance>p.reach||!this.hasSight));
    const state=moving?'walk':'idle',mode=moving?'move':'idle';
    if(this.mode!==mode)this.change(state,mode);
    this.time=(this.time+dt*(moving?(this.durations.walk/1.1):1))%Math.max(.1,this.durations[state]);
    return {events,speed:moving?p.speed:0};
  }
}
