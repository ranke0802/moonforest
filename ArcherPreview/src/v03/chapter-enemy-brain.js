// Metres and seconds in the chapter maps. Attack animation time is normalized
// to the published wind-up and recovery, independently of its source frame rate.
export const CHAPTER_COMBAT = {
  'goblin-warrior': {name:'고블린 전사', hp:115, damage:18, speed:2.35, reach:1.42, windup:.52, recover:.52, cooldown:.64},
  'goblin-archer': {name:'고블린 궁수', hp:92, damage:17, speed:1.95, reach:7.6, windup:.72, recover:.58, cooldown:1.15, missile:'arrow', velocity:11},
  'goblin-shaman': {name:'고블린 주술사', hp:128, damage:27, speed:1.6, reach:6.5, windup:1.1, recover:.75, cooldown:1.4, missile:'spell', velocity:6.2},
  'hobgoblin-boss': {name:'홉고블린', hp:335, damage:35, speed:1.95, reach:2.03, windup:.88, recover:.85, cooldown:.9, heavy:true},
  'ghoul-warrior': {name:'구울 전사', hp:178, damage:25, speed:2.55, reach:1.68, windup:.48, recover:.62, cooldown:.72},
  zombie: {name:'좀비', hp:138, damage:19, speed:1.04, reach:1.36, windup:.82, recover:.78, cooldown:.85},
};

const labels = {idle:'대기', move:'이동', attack:'공격', dead:'격파', hit:'경직'};
export class ChapterEnemyBrain {
  constructor(profile, durations) {
    this.profile=profile;this.durations=durations;this.hp=this.maxHp=profile.hp;
    this.visited=new Set();this.flash=0;this.flashDuration=.23;this.stagger=0;this.serial=0;
    this.wait=.35;this.hasSight=false;this.engaged=false;this.returning=false;
    this.change('idle','idle');
  }
  change(state,mode) {
    this.state=state;this.mode=mode;this.serial++;this.time=0;this.elapsed=0;
    this.impacted=false;this.visited.add(state);
  }
  get label(){return labels[this.mode];}
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
    if(pursue&&this.hasSight&&distance<=p.reach&&this.wait<=0){
      this.change('attack','attack');return {events,speed:0};
    }
    const moving=this.returning||(pursue&&(distance>p.reach||!this.hasSight));
    const state=moving?'walk':'idle',mode=moving?'move':'idle';
    if(this.mode!==mode)this.change(state,mode);
    this.time=(this.time+dt*(moving?(this.durations.walk/1.1):1))%Math.max(.1,this.durations[state]);
    return {events,speed:moving?p.speed:0};
  }
}
